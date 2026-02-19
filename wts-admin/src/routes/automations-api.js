const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');

const router = express.Router();

// All routes require authentication
router.use(ensureAuthenticated);

// ==================== POST /api/automations/compile ====================
// Accepts AST, validates, and returns deployable code for the target engine

router.post('/compile', express.json(), async (req, res) => {
  try {
    const { ast, targetEngine, topologyType, name } = req.body;

    if (!ast || !targetEngine) {
      return res.status(400).json({ success: false, error: 'ast and targetEngine are required' });
    }

    // Validate AST structure
    const errors = validateAst(ast);
    if (errors.length > 0) {
      return res.status(422).json({ success: false, error: 'AST validation failed', details: errors });
    }

    // Compile based on engine
    let compiled;
    switch (targetEngine) {
      case 'n8n':
        compiled = compileToN8n(ast, name);
        break;
      case 'make':
        compiled = compileToMake(ast, name);
        break;
      case 'custom':
      default:
        compiled = compileToCustom(ast, name, topologyType);
        break;
    }

    // Mask credentials in the compiled output
    compiled = maskCredentials(compiled);

    res.json({ success: true, compiled, engine: targetEngine });
  } catch (error) {
    console.error('Compile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ==================== POST /api/automations/save ====================
// Save or update automation with AST payload

router.post('/save', express.json(), async (req, res) => {
  try {
    const {
      id, name, description, target_engine, topology_type,
      ast_payload, status, trigger_type, trigger_config,
      action_type, action_config
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    let automationId;

    if (id) {
      // Update existing
      await db.query(
        `UPDATE automations SET
          name = $1, description = $2, target_engine = $3, topology_type = $4,
          ast_payload = $5, status = $6, trigger_type = $7, trigger_config = $8,
          action_type = $9, action_config = $10, updated_at = CURRENT_TIMESTAMP
        WHERE id = $11`,
        [
          name, description || '', target_engine || ['custom'], topology_type || 'DAG',
          JSON.stringify(ast_payload || {}), status || 'draft',
          trigger_type || null, JSON.stringify(trigger_config || {}),
          action_type || null, JSON.stringify(action_config || {}),
          id
        ]
      );
      automationId = id;

      // Auto-version
      const versionResult = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM automation_versions WHERE automation_id = $1',
        [id]
      );
      const nextVersion = versionResult.rows[0].next_version;

      await db.query(
        `INSERT INTO automation_versions (automation_id, version_number, ast_payload, compiled_code)
         VALUES ($1, $2, $3, $4)`,
        [id, nextVersion, JSON.stringify(ast_payload || {}), JSON.stringify({})]
      );
    } else {
      // Create new
      const result = await db.query(
        `INSERT INTO automations (
          name, description, target_engine, topology_type, ast_payload, status,
          trigger_type, trigger_config, action_type, action_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          name, description || '', target_engine || ['custom'], topology_type || 'DAG',
          JSON.stringify(ast_payload || {}), status || 'draft',
          trigger_type || null, JSON.stringify(trigger_config || {}),
          action_type || null, JSON.stringify(action_config || {})
        ]
      );
      automationId = result.rows[0].id;

      // Create initial version
      await db.query(
        `INSERT INTO automation_versions (automation_id, version_number, ast_payload, compiled_code)
         VALUES ($1, 1, $2, $3)`,
        [automationId, JSON.stringify(ast_payload || {}), JSON.stringify({})]
      );
    }

    res.json({ success: true, id: automationId });
  } catch (error) {
    console.error('Save automation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ==================== GET /api/automations/:id/telemetry ====================
// Polling fallback for telemetry data

router.get('/:id/telemetry', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM execution_telemetry
       WHERE automation_id = $1
       ORDER BY executed_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json({ success: true, telemetry: result.rows });
  } catch (error) {
    // Table may not exist yet or no partition covers this range
    res.json({ success: true, telemetry: [] });
  }
});


// ==================== Compiler Functions ====================

function validateAst(ast) {
  const errors = [];
  if (!ast.nodes || !Array.isArray(ast.nodes)) {
    errors.push('ast.nodes must be an array');
  }
  if (!ast.edges || !Array.isArray(ast.edges)) {
    errors.push('ast.edges must be an array');
  }
  if (ast.nodes) {
    ast.nodes.forEach((node, i) => {
      if (!node.id) errors.push(`Node at index ${i} is missing an id`);
      if (!node.type) errors.push(`Node at index ${i} is missing a type`);
    });
  }
  if (ast.edges) {
    const nodeIds = new Set((ast.nodes || []).map(n => n.id));
    ast.edges.forEach((edge, i) => {
      if (!edge.source) errors.push(`Edge at index ${i} is missing source`);
      if (!edge.target) errors.push(`Edge at index ${i} is missing target`);
      if (edge.source && !nodeIds.has(edge.source)) {
        errors.push(`Edge at index ${i} references unknown source: ${edge.source}`);
      }
      if (edge.target && !nodeIds.has(edge.target)) {
        errors.push(`Edge at index ${i} references unknown target: ${edge.target}`);
      }
    });
  }
  return errors;
}

function compileToN8n(ast, name) {
  const nodeTypeMap = {
    trigger: 'n8n-nodes-base.webhook',
    action: 'n8n-nodes-base.httpRequest',
    condition: 'n8n-nodes-base.if',
    transform: 'n8n-nodes-base.set',
    llm: 'n8n-nodes-base.httpRequest',
    loop: 'n8n-nodes-base.splitInBatches',
    delay: 'n8n-nodes-base.wait',
    output: 'n8n-nodes-base.respondToWebhook'
  };

  const workflow = {
    name: name || 'Untitled Workflow',
    nodes: [],
    connections: {},
    settings: { executionOrder: 'v1' }
  };

  (ast.nodes || []).forEach(node => {
    workflow.nodes.push({
      id: node.id,
      name: node.label || node.type,
      type: nodeTypeMap[node.type] || 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [node.position?.x || 0, node.position?.y || 0],
      parameters: node.config || {}
    });
  });

  (ast.edges || []).forEach(edge => {
    if (!workflow.connections[edge.source]) {
      workflow.connections[edge.source] = { main: [[]] };
    }
    workflow.connections[edge.source].main[0].push({
      node: edge.target,
      type: 'main',
      index: 0
    });
  });

  return workflow;
}

function compileToMake(ast, name) {
  const moduleMap = {
    trigger: 'gateway:CustomWebHook',
    action: 'http:ActionSendRequest',
    condition: 'builtin:BasicRouter',
    transform: 'builtin:BasicTransformer',
    llm: 'http:ActionSendRequest',
    loop: 'builtin:BasicRepeater',
    delay: 'builtin:Sleep',
    output: 'builtin:BasicResponder'
  };

  const scenario = {
    name: name || 'Untitled Scenario',
    flow: [],
    scheduling: { type: 'indefinitely' }
  };

  const nodeMap = {};
  (ast.nodes || []).forEach((node, idx) => {
    nodeMap[node.id] = idx + 1;
    scenario.flow.push({
      id: idx + 1,
      module: moduleMap[node.type] || 'builtin:Placeholder',
      version: 1,
      metadata: { designer: { x: node.position?.x || 0, y: node.position?.y || 0 } },
      parameters: node.config || {},
      mapper: {}
    });
  });

  (ast.edges || []).forEach(edge => {
    const sourceIdx = nodeMap[edge.source];
    const targetIdx = nodeMap[edge.target];
    if (sourceIdx && targetIdx) {
      const src = scenario.flow[sourceIdx - 1];
      if (!src.routes) src.routes = [];
      src.routes.push({ flow: [{ id: targetIdx }] });
    }
  });

  return scenario;
}

function compileToCustom(ast, name, topologyType) {
  return {
    type: topologyType || 'DAG',
    name: name || 'Untitled Automation',
    agents: (ast.nodes || []).map(node => ({
      id: node.id,
      role: node.type,
      label: node.label,
      config: node.config || {},
      position: node.position
    })),
    connections: (ast.edges || []).map(edge => ({
      from: edge.source,
      to: edge.target,
      label: edge.label || ''
    })),
    metadata: ast.metadata || {},
    runtime: {
      maxConcurrency: 5,
      timeoutMs: 30000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000 }
    }
  };
}

function maskCredentials(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(maskCredentials);

  const sensitiveKeys = ['api_key', 'apikey', 'token', 'secret', 'password', 'credential', 'authorization'];
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk)) && typeof value === 'string') {
      result[key] = `{{$env["${key.toUpperCase()}"]}}`;
    } else {
      result[key] = maskCredentials(value);
    }
  }
  return result;
}

module.exports = router;
