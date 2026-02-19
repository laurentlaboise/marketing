const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.use(ensureAuthenticated);

// ==================== POST /api/proxy/simulate ====================
// Sandbox execution layer: parses compiled code, intercepts outbound HTTP,
// matches against mock OpenAPI library, returns synthetic responses.
// Does NOT touch live production databases.

router.post('/simulate', express.json(), async (req, res) => {
  try {
    const { compiled, targetEngine } = req.body;

    if (!compiled) {
      return res.status(400).json({ success: false, error: 'compiled payload is required' });
    }

    const results = [];

    switch (targetEngine) {
      case 'n8n':
        simulateN8nWorkflow(compiled, results);
        break;
      case 'make':
        simulateMakeScenario(compiled, results);
        break;
      case 'custom':
      default:
        simulateCustomAgents(compiled, results);
        break;
    }

    res.json({ success: true, results, engine: targetEngine });
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Mock Simulation Engines ====================

function simulateN8nWorkflow(workflow, results) {
  const nodes = workflow.nodes || [];
  const connections = workflow.connections || {};

  // Execute in topological order
  const executed = new Set();
  const queue = nodes.filter(n =>
    n.type === 'n8n-nodes-base.webhook' ||
    n.type === 'n8n-nodes-base.scheduleTrigger'
  );

  // If no triggers found, start from first node
  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0]);
  }

  while (queue.length > 0) {
    const node = queue.shift();
    if (executed.has(node.id)) continue;
    executed.add(node.id);

    const startTime = Date.now();
    const result = simulateNode(node);
    const latency = Date.now() - startTime + Math.floor(Math.random() * 150) + 20;

    results.push({
      nodeId: node.id,
      nodeName: node.name,
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: latency,
      response: result.response,
      timestamp: new Date().toISOString(),
      anomalyScore: result.anomalyScore || 0
    });

    // Follow connections
    const nodeConnections = connections[node.id];
    if (nodeConnections && nodeConnections.main) {
      nodeConnections.main.forEach(outputs => {
        outputs.forEach(conn => {
          const nextNode = nodes.find(n => n.id === conn.node);
          if (nextNode && !executed.has(nextNode.id)) {
            queue.push(nextNode);
          }
        });
      });
    }
  }
}

function simulateMakeScenario(scenario, results) {
  const flow = scenario.flow || [];
  flow.forEach((module, idx) => {
    const startTime = Date.now();
    const result = simulateModule(module);
    const latency = Date.now() - startTime + Math.floor(Math.random() * 120) + 15;

    results.push({
      moduleId: module.id,
      moduleName: module.module,
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: latency,
      response: result.response,
      timestamp: new Date().toISOString(),
      anomalyScore: result.anomalyScore || 0
    });
  });
}

function simulateCustomAgents(config, results) {
  const agents = config.agents || [];
  const connections = config.connections || [];

  // Simulate agents in dependency order
  const executed = new Set();
  const targetSet = new Set(connections.map(c => c.to));
  const queue = agents.filter(a => !targetSet.has(a.id));

  if (queue.length === 0 && agents.length > 0) {
    queue.push(agents[0]);
  }

  while (queue.length > 0) {
    const agent = queue.shift();
    if (executed.has(agent.id)) continue;
    executed.add(agent.id);

    const latency = Math.floor(Math.random() * 300) + 30;
    const isError = Math.random() < 0.05; // 5% error rate in simulation

    results.push({
      agentId: agent.id,
      agentLabel: agent.label,
      role: agent.role,
      status: isError ? 'error' : 'success',
      statusCode: isError ? 500 : 200,
      latencyMs: latency,
      response: isError
        ? mockErrorResponse(agent.role)
        : mockSuccessResponse(agent.role),
      timestamp: new Date().toISOString(),
      anomalyScore: isError ? 0.9 : Math.random() * 0.3
    });

    // Follow connections
    connections
      .filter(c => c.from === agent.id)
      .forEach(c => {
        const next = agents.find(a => a.id === c.to);
        if (next && !executed.has(next.id)) {
          queue.push(next);
        }
      });
  }
}

// ==================== Mock Response Library ====================

function simulateNode(node) {
  const type = node.type || '';

  if (type.includes('webhook')) {
    return {
      status: 'success',
      statusCode: 200,
      response: { message: 'Webhook received', body: { test: true }, headers: {} }
    };
  }

  if (type.includes('httpRequest')) {
    return mockHttpResponse(node.parameters);
  }

  if (type.includes('if')) {
    return {
      status: 'success',
      statusCode: 200,
      response: { branch: 'true', condition: 'evaluated' }
    };
  }

  if (type.includes('set')) {
    return {
      status: 'success',
      statusCode: 200,
      response: { transformed: true, fields: Object.keys(node.parameters || {}) }
    };
  }

  if (type.includes('wait')) {
    return {
      status: 'success',
      statusCode: 200,
      response: { waited: true, duration: '1s (simulated)' }
    };
  }

  return {
    status: 'success',
    statusCode: 200,
    response: { executed: true, type: node.type }
  };
}

function simulateModule(module) {
  const mod = module.module || '';

  if (mod.includes('WebHook')) {
    return {
      status: 'success',
      statusCode: 200,
      response: { trigger: 'webhook', payload: { simulated: true } }
    };
  }

  if (mod.includes('SendRequest')) {
    return mockHttpResponse(module.parameters);
  }

  if (mod.includes('Router')) {
    return {
      status: 'success',
      statusCode: 200,
      response: { route: 'default', matched: true }
    };
  }

  return {
    status: 'success',
    statusCode: 200,
    response: { module: mod, simulated: true }
  };
}

function mockHttpResponse(params) {
  const url = (params && params.url) || '';

  // Match against common API patterns
  if (url.includes('/api/') || url.includes('openai') || url.includes('anthropic')) {
    return {
      status: 'success',
      statusCode: 200,
      response: {
        data: { id: 'sim_' + Date.now(), result: 'Mock API response' },
        headers: { 'content-type': 'application/json', 'x-simulated': 'true' }
      }
    };
  }

  // Generic mock
  return {
    status: 'success',
    statusCode: 200,
    response: {
      body: '{"status":"ok","simulated":true}',
      headers: { 'content-type': 'application/json' }
    }
  };
}

function mockSuccessResponse(role) {
  const responses = {
    trigger: { event: 'triggered', timestamp: new Date().toISOString() },
    action: { result: 'completed', data: { processed: true } },
    condition: { evaluated: true, branch: 'true' },
    transform: { transformed: true, records: Math.floor(Math.random() * 100) },
    llm: { completion: 'Simulated LLM response for testing purposes.', tokens: 150 },
    loop: { iterations: Math.floor(Math.random() * 10) + 1, completed: true },
    delay: { waited: true, duration: '1000ms' },
    output: { delivered: true, format: 'json' }
  };
  return responses[role] || { status: 'ok' };
}

function mockErrorResponse(role) {
  return {
    error: 'SimulatedError',
    message: `Mock ${role} failure for testing error handling`,
    code: 'ESIMULATED'
  };
}

module.exports = router;
