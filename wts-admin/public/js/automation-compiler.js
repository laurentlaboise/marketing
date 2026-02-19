/**
 * Automation Compiler - Tri-Pane UI
 * AST State Management + Compiler + React Flow DAG + Monaco Editor + Telemetry
 */

// ==================== AST STATE STORE (Zustand-like) ====================

const AutomationStore = (() => {
  let state = {
    automationId: null,
    name: 'Untitled Automation',
    targetEngine: ['custom'],
    topologyType: 'DAG',
    status: 'draft',
    manualOverride: false,
    ast: {
      nodes: [],
      edges: [],
      metadata: {
        trigger: { type: '', config: {} },
        actions: [],
        llmPrompt: '',
        variables: {}
      }
    }
  };

  const listeners = new Set();

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setState(updater) {
    const prev = state;
    if (typeof updater === 'function') {
      state = { ...state, ...updater(state) };
    } else {
      state = { ...state, ...updater };
    }
    listeners.forEach(fn => fn(state, prev));
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function updateAst(partial) {
    setState(s => ({
      ast: { ...s.ast, ...partial }
    }));
  }

  function updateMetadata(partial) {
    setState(s => ({
      ast: {
        ...s.ast,
        metadata: { ...s.ast.metadata, ...partial }
      }
    }));
  }

  function addNode(node) {
    setState(s => ({
      ast: {
        ...s.ast,
        nodes: [...s.ast.nodes, {
          id: node.id || crypto.randomUUID(),
          type: node.type || 'action',
          label: node.label || 'New Node',
          config: node.config || {},
          position: node.position || { x: 250, y: s.ast.nodes.length * 120 + 50 }
        }]
      }
    }));
  }

  function removeNode(nodeId) {
    setState(s => ({
      ast: {
        ...s.ast,
        nodes: s.ast.nodes.filter(n => n.id !== nodeId),
        edges: s.ast.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
      }
    }));
  }

  function updateNodePosition(nodeId, position) {
    setState(s => ({
      ast: {
        ...s.ast,
        nodes: s.ast.nodes.map(n =>
          n.id === nodeId ? { ...n, position } : n
        )
      }
    }));
  }

  function addEdge(edge) {
    const exists = state.ast.edges.some(
      e => e.source === edge.source && e.target === edge.target
    );
    if (exists) return;
    setState(s => ({
      ast: {
        ...s.ast,
        edges: [...s.ast.edges, {
          id: edge.id || `e-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          label: edge.label || ''
        }]
      }
    }));
  }

  function removeEdge(edgeId) {
    setState(s => ({
      ast: {
        ...s.ast,
        edges: s.ast.edges.filter(e => e.id !== edgeId)
      }
    }));
  }

  return {
    getState, setState, subscribe,
    updateAst, updateMetadata,
    addNode, removeNode, updateNodePosition,
    addEdge, removeEdge
  };
})();


// ==================== AST COMPILER ====================

function compileAstToEngine(ast, targetEngine) {
  switch (targetEngine) {
    case 'n8n':
      return compileToN8n(ast);
    case 'make':
      return compileToMake(ast);
    case 'custom':
    default:
      return compileToCustomAgent(ast);
  }
}

function compileToN8n(ast) {
  const workflow = {
    name: AutomationStore.getState().name,
    nodes: [],
    connections: {}
  };

  ast.nodes.forEach((node, idx) => {
    const n8nNode = {
      id: node.id,
      name: node.label,
      type: mapNodeTypeToN8n(node.type),
      typeVersion: 1,
      position: [node.position.x, node.position.y],
      parameters: sanitizeCredentials(node.config)
    };
    workflow.nodes.push(n8nNode);
  });

  ast.edges.forEach(edge => {
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

function compileToMake(ast) {
  const scenario = {
    name: AutomationStore.getState().name,
    flow: [],
    scheduling: { type: 'indefinitely' }
  };

  const nodeMap = {};
  ast.nodes.forEach((node, idx) => {
    nodeMap[node.id] = idx + 1;
    scenario.flow.push({
      id: idx + 1,
      module: mapNodeTypeToMake(node.type),
      version: 1,
      metadata: { designer: { x: node.position.x, y: node.position.y } },
      parameters: sanitizeCredentials(node.config),
      mapper: {}
    });
  });

  ast.edges.forEach(edge => {
    const sourceIdx = nodeMap[edge.source];
    const targetIdx = nodeMap[edge.target];
    if (sourceIdx && targetIdx) {
      const sourceModule = scenario.flow[sourceIdx - 1];
      if (!sourceModule.routes) sourceModule.routes = [];
      sourceModule.routes.push({ flow: [{ id: targetIdx }] });
    }
  });

  return scenario;
}

function compileToCustomAgent(ast) {
  return {
    type: AutomationStore.getState().topologyType,
    name: AutomationStore.getState().name,
    agents: ast.nodes.map(node => ({
      id: node.id,
      role: node.type,
      label: node.label,
      config: sanitizeCredentials(node.config),
      position: node.position
    })),
    connections: ast.edges.map(edge => ({
      from: edge.source,
      to: edge.target,
      label: edge.label
    })),
    metadata: ast.metadata,
    runtime: {
      maxConcurrency: 5,
      timeoutMs: 30000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000 }
    }
  };
}

function mapNodeTypeToN8n(type) {
  const map = {
    trigger: 'n8n-nodes-base.webhook',
    action: 'n8n-nodes-base.httpRequest',
    condition: 'n8n-nodes-base.if',
    transform: 'n8n-nodes-base.set',
    llm: 'n8n-nodes-base.httpRequest',
    loop: 'n8n-nodes-base.splitInBatches',
    delay: 'n8n-nodes-base.wait',
    output: 'n8n-nodes-base.respondToWebhook'
  };
  return map[type] || 'n8n-nodes-base.noOp';
}

function mapNodeTypeToMake(type) {
  const map = {
    trigger: 'gateway:CustomWebHook',
    action: 'http:ActionSendRequest',
    condition: 'builtin:BasicRouter',
    transform: 'builtin:BasicTransformer',
    llm: 'http:ActionSendRequest',
    loop: 'builtin:BasicRepeater',
    delay: 'builtin:Sleep',
    output: 'builtin:BasicResponder'
  };
  return map[type] || 'builtin:Placeholder';
}

function sanitizeCredentials(config) {
  const sanitized = { ...config };
  const sensitiveKeys = ['api_key', 'apiKey', 'token', 'secret', 'password', 'credential'];
  Object.keys(sanitized).forEach(key => {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = `{{$env["${key.toUpperCase()}"]}}`;
    }
  });
  return sanitized;
}


// ==================== DAG RENDERER (Canvas-based React Flow alternative) ====================

const DAGRenderer = (() => {
  let canvas, ctx;
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  let selectedNode = null;
  let connecting = null; // { sourceId, startX, startY }
  let mousePos = { x: 0, y: 0 };

  const NODE_W = 180;
  const NODE_H = 60;
  const NODE_COLORS = {
    trigger: '#10b981',
    action: '#3b82f6',
    condition: '#f59e0b',
    transform: '#8b5cf6',
    llm: '#ec4899',
    loop: '#06b6d4',
    delay: '#6b7280',
    output: '#ef4444'
  };
  const NODE_ICONS = {
    trigger: '\uf0e7',
    action: '\uf013',
    condition: '\uf074',
    transform: '\uf0ec',
    llm: '\uf544',
    loop: '\uf2f1',
    delay: '\uf017',
    output: '\uf2f5'
  };

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    bindEvents();
    AutomationStore.subscribe(() => render());
    render();
  }

  function resize() {
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    render();
  }

  function render() {
    if (!ctx) return;
    const state = AutomationStore.getState();
    const nodes = state.ast.nodes;
    const edges = state.ast.edges;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid (light theme)
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw edges
    edges.forEach(edge => {
      const src = nodes.find(n => n.id === edge.source);
      const tgt = nodes.find(n => n.id === edge.target);
      if (src && tgt) {
        drawEdge(src, tgt, edge.label);
      }
    });

    // Draw connecting line
    if (connecting) {
      ctx.strokeStyle = '#2085c8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(connecting.startX, connecting.startY);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    nodes.forEach(node => {
      drawNode(node, node.id === selectedNode);
    });

    // Empty state
    if (nodes.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Add nodes from the left panel or right-click to add', canvas.width / 2, canvas.height / 2);
      ctx.fillText('Use the node palette below to drag nodes onto the canvas', canvas.width / 2, canvas.height / 2 + 24);
    }
  }

  function drawNode(node, isSelected) {
    const x = node.position.x;
    const y = node.position.y;
    const color = NODE_COLORS[node.type] || '#3b82f6';

    // Shadow
    ctx.shadowColor = isSelected ? color : 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = isSelected ? 12 : 4;
    ctx.shadowOffsetY = 2;

    // Body (light theme: white card)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_W, NODE_H, 8);
    ctx.fill();

    // Top accent bar
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_W, 4, [8, 8, 0, 0]);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Border (always draw a subtle border, accent on selection)
    ctx.strokeStyle = isSelected ? color : '#e5e7eb';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_W, NODE_H, 8);
    ctx.stroke();

    // Type badge
    ctx.fillStyle = color + '33';
    ctx.beginPath();
    ctx.roundRect(x + 8, y + 14, 32, 32, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '14px "Font Awesome 6 Free"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(NODE_ICONS[node.type] || '\uf013', x + 24, y + 30);

    // Label (dark text for light theme)
    ctx.fillStyle = '#1f2937';
    ctx.font = '600 13px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const maxLabelWidth = NODE_W - 60;
    let label = node.label;
    if (ctx.measureText(label).width > maxLabelWidth) {
      while (ctx.measureText(label + '...').width > maxLabelWidth && label.length > 0) {
        label = label.slice(0, -1);
      }
      label += '...';
    }
    ctx.fillText(label, x + 48, y + 24);

    // Type text
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Inter, -apple-system, sans-serif';
    ctx.fillText(node.type.charAt(0).toUpperCase() + node.type.slice(1), x + 48, y + 42);

    // Connection ports
    // Input port (left center)
    if (node.type !== 'trigger') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + NODE_H / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Output port (right center)
    if (node.type !== 'output') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + NODE_W, y + NODE_H / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawEdge(src, tgt, label) {
    const sx = src.position.x + NODE_W;
    const sy = src.position.y + NODE_H / 2;
    const tx = tgt.position.x;
    const ty = tgt.position.y + NODE_H / 2;

    const cpx1 = sx + Math.abs(tx - sx) * 0.4;
    const cpx2 = tx - Math.abs(tx - sx) * 0.4;

    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(cpx1, sy, cpx2, ty, tx, ty);
    ctx.stroke();

    // Arrow
    const angle = Math.atan2(ty - sy, tx - cpx2);
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 8 * Math.cos(angle - 0.4), ty - 8 * Math.sin(angle - 0.4));
    ctx.lineTo(tx - 8 * Math.cos(angle + 0.4), ty - 8 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    if (label) {
      const midX = (sx + tx) / 2;
      const midY = (sy + ty) / 2;
      ctx.fillStyle = '#f9fafb';
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(midX - 22, midY - 10, 44, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midX, midY);
    }
  }

  function getNodeAtPos(x, y) {
    const nodes = AutomationStore.getState().ast.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (x >= n.position.x && x <= n.position.x + NODE_W &&
          y >= n.position.y && y <= n.position.y + NODE_H) {
        return n;
      }
    }
    return null;
  }

  function isOnOutputPort(node, x, y) {
    const px = node.position.x + NODE_W;
    const py = node.position.y + NODE_H / 2;
    return Math.hypot(x - px, y - py) <= 10;
  }

  function isOnInputPort(node, x, y) {
    const px = node.position.x;
    const py = node.position.y + NODE_H / 2;
    return Math.hypot(x - px, y - py) <= 10;
  }

  function bindEvents() {
    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAtPos(x, y);

      if (node && isOnOutputPort(node, x, y)) {
        connecting = {
          sourceId: node.id,
          startX: node.position.x + NODE_W,
          startY: node.position.y + NODE_H / 2
        };
        return;
      }

      if (node) {
        dragging = node.id;
        selectedNode = node.id;
        dragOffset.x = x - node.position.x;
        dragOffset.y = y - node.position.y;
        updateNodeDetail(node);
      } else {
        selectedNode = null;
        clearNodeDetail();
      }
      render();
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mousePos.x = e.clientX - rect.left;
      mousePos.y = e.clientY - rect.top;

      if (dragging) {
        AutomationStore.updateNodePosition(dragging, {
          x: Math.max(0, mousePos.x - dragOffset.x),
          y: Math.max(0, mousePos.y - dragOffset.y)
        });
      }
      if (connecting) {
        render();
      }

      // Cursor styling
      const node = getNodeAtPos(mousePos.x, mousePos.y);
      if (node && isOnOutputPort(node, mousePos.x, mousePos.y)) {
        canvas.style.cursor = 'crosshair';
      } else if (node) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'default';
      }
    });

    canvas.addEventListener('mouseup', e => {
      if (connecting) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const targetNode = getNodeAtPos(x, y);
        if (targetNode && targetNode.id !== connecting.sourceId && isOnInputPort(targetNode, x, y)) {
          AutomationStore.addEdge({
            source: connecting.sourceId,
            target: targetNode.id
          });
        }
        connecting = null;
        render();
      }
      dragging = null;
    });

    canvas.addEventListener('dblclick', e => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAtPos(x, y);
      if (node) {
        const newLabel = prompt('Node label:', node.label);
        if (newLabel !== null) {
          AutomationStore.setState(s => ({
            ast: {
              ...s.ast,
              nodes: s.ast.nodes.map(n =>
                n.id === node.id ? { ...n, label: newLabel } : n
              )
            }
          }));
        }
      }
    });

    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAtPos(x, y);
      if (node) {
        if (confirm(`Delete node "${node.label}"?`)) {
          AutomationStore.removeNode(node.id);
          if (selectedNode === node.id) {
            selectedNode = null;
            clearNodeDetail();
          }
        }
      }
    });

    window.addEventListener('resize', () => resize());
  }

  function updateNodeDetail(node) {
    const detailEl = document.getElementById('nodeDetail');
    if (!detailEl) return;
    detailEl.innerHTML = `
      <div class="node-detail-header">
        <span class="node-type-badge" style="background:${NODE_COLORS[node.type] || '#3b82f6'}20;color:${NODE_COLORS[node.type] || '#3b82f6'}">${node.type}</span>
        <strong>${node.label}</strong>
      </div>
      <div class="node-detail-body">
        <label>Config (JSON):</label>
        <textarea id="nodeConfigEdit" rows="4" class="form-input mono">${JSON.stringify(node.config, null, 2)}</textarea>
        <button onclick="saveNodeConfig('${node.id}')" class="btn btn-sm btn-primary" style="margin-top:6px;">Apply</button>
      </div>
    `;
  }

  function clearNodeDetail() {
    const detailEl = document.getElementById('nodeDetail');
    if (detailEl) detailEl.innerHTML = '<p class="text-muted">Select a node to edit</p>';
  }

  return { init, render, resize };
})();

function saveNodeConfig(nodeId) {
  const textarea = document.getElementById('nodeConfigEdit');
  if (!textarea) return;
  try {
    const config = JSON.parse(textarea.value);
    AutomationStore.setState(s => ({
      ast: {
        ...s.ast,
        nodes: s.ast.nodes.map(n =>
          n.id === nodeId ? { ...n, config } : n
        )
      }
    }));
  } catch (e) {
    alert('Invalid JSON: ' + e.message);
  }
}


// ==================== TELEMETRY WEBSOCKET ====================

const TelemetryWS = (() => {
  let ws = null;
  let chart = null;
  let dataPoints = [];
  const MAX_POINTS = 50;

  function connect(automationId) {
    if (!automationId) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/api/telemetry/${automationId}`;

    try {
      ws = new WebSocket(url);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          addDataPoint(data);
        } catch (e) { /* ignore parse errors */ }
      };
      ws.onclose = () => {
        setTimeout(() => connect(automationId), 5000);
      };
      ws.onerror = () => { /* reconnect handled by onclose */ };
    } catch (e) {
      console.warn('WebSocket not available, using polling fallback');
      startPolling(automationId);
    }
  }

  function startPolling(automationId) {
    if (!automationId) return;
    setInterval(async () => {
      try {
        const res = await fetch(`/api/automations/${automationId}/telemetry`);
        if (res.ok) {
          const data = await res.json();
          if (data.telemetry) {
            data.telemetry.forEach(d => addDataPoint(d));
          }
        }
      } catch (e) { /* ignore */ }
    }, 5000);
  }

  function addDataPoint(point) {
    dataPoints.push({
      time: new Date(point.executed_at || Date.now()),
      latency: point.latency_ms || 0,
      status: point.execution_status || 'unknown',
      anomaly: point.anomaly_score || 0
    });
    if (dataPoints.length > MAX_POINTS) {
      dataPoints = dataPoints.slice(-MAX_POINTS);
    }
    renderChart();
  }

  function renderChart() {
    const container = document.getElementById('telemetryChart');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || 180;

    if (dataPoints.length === 0) {
      container.innerHTML = '<div class="telemetry-empty">No telemetry data yet. Deploy and run your automation to see live metrics.</div>';
      return;
    }

    const maxLatency = Math.max(...dataPoints.map(d => d.latency), 1);
    const barWidth = Math.max(4, (width - 40) / MAX_POINTS - 2);

    let html = `<svg width="${width}" height="${height}" class="telemetry-svg">`;
    // Y axis
    html += `<line x1="35" y1="10" x2="35" y2="${height - 25}" stroke="#d1d5db" stroke-width="1"/>`;
    // X axis
    html += `<line x1="35" y1="${height - 25}" x2="${width - 5}" y2="${height - 25}" stroke="#d1d5db" stroke-width="1"/>`;

    // Y labels
    for (let i = 0; i <= 4; i++) {
      const y = 10 + (height - 35) * (1 - i / 4);
      const val = Math.round(maxLatency * i / 4);
      html += `<text x="30" y="${y + 4}" fill="#6b7280" font-size="9" text-anchor="end">${val}ms</text>`;
      html += `<line x1="35" y1="${y}" x2="${width - 5}" y2="${y}" stroke="#f3f4f6" stroke-width="1" stroke-dasharray="3"/>`;
    }

    // Bars
    dataPoints.forEach((dp, i) => {
      const x = 40 + i * (barWidth + 2);
      const barH = (dp.latency / maxLatency) * (height - 35);
      const y = height - 25 - barH;
      const color = dp.status === 'success' ? '#10b981' :
                    dp.status === 'error' ? '#ef4444' :
                    dp.anomaly > 0.7 ? '#f59e0b' : '#3b82f6';
      html += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${color}" rx="2" opacity="0.85">
        <title>${dp.status}: ${dp.latency}ms at ${dp.time.toLocaleTimeString()}</title>
      </rect>`;
    });

    // Legend
    html += `<text x="${width - 5}" y="${height - 5}" fill="#9ca3af" font-size="9" text-anchor="end">Latency (ms) over time</text>`;
    html += `</svg>`;

    // Status counters
    const counts = { success: 0, error: 0, running: 0, unknown: 0 };
    dataPoints.forEach(dp => { counts[dp.status] = (counts[dp.status] || 0) + 1; });
    const avgLatency = Math.round(dataPoints.reduce((s, d) => s + d.latency, 0) / dataPoints.length);

    html += `<div class="telemetry-stats">
      <span class="tstat"><span class="dot" style="background:#10b981"></span> ${counts.success} ok</span>
      <span class="tstat"><span class="dot" style="background:#ef4444"></span> ${counts.error} err</span>
      <span class="tstat">avg ${avgLatency}ms</span>
    </div>`;

    container.innerHTML = html;
  }

  function disconnect() {
    if (ws) { ws.close(); ws = null; }
  }

  return { connect, disconnect, addDataPoint, renderChart };
})();


// ==================== MONACO EDITOR WRAPPER ====================

const CodeEditor = (() => {
  let editor = null;
  let readOnly = true;

  function init(containerId) {
    // Load Monaco from CDN
    if (typeof require === 'undefined' || !window.monaco) {
      const loaderScript = document.createElement('script');
      loaderScript.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
      loaderScript.onload = () => {
        require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], () => {
          createEditor(containerId);
        });
      };
      document.head.appendChild(loaderScript);
    } else {
      createEditor(containerId);
    }
  }

  function createEditor(containerId) {
    // Define custom light theme matching admin design
    monaco.editor.defineTheme('automationLight', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#3a4045',
        'editorLineNumber.foreground': '#9ca3af',
        'editor.selectionBackground': '#dbeafe',
        'editor.lineHighlightBackground': '#f9fafb',
        'editorWidget.background': '#f3f4f6',
        'editorWidget.border': '#e5e7eb'
      }
    });

    editor = monaco.editor.create(document.getElementById(containerId), {
      value: '// Compiled output will appear here\n// Configure your automation in the left panel',
      language: 'json',
      theme: 'automationLight',
      readOnly: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 12 },
      wordWrap: 'on',
      tabSize: 2
    });

    // Subscribe to AST changes to auto-compile
    AutomationStore.subscribe((state) => {
      if (!state.manualOverride) {
        updateCompiledOutput(state);
      }
    });
  }

  function updateCompiledOutput(state) {
    if (!editor) return;
    const engine = state.targetEngine[0] || 'custom';
    try {
      const compiled = compileAstToEngine(state.ast, engine);
      const code = JSON.stringify(compiled, null, 2);
      editor.setValue(code);
    } catch (e) {
      editor.setValue(`// Compilation error: ${e.message}`);
    }
  }

  function setReadOnly(ro) {
    readOnly = ro;
    if (editor) {
      editor.updateOptions({ readOnly: ro });
    }
  }

  function getValue() {
    return editor ? editor.getValue() : '';
  }

  function setValue(val) {
    if (editor) editor.setValue(val);
  }

  return { init, setReadOnly, getValue, setValue };
})();


// ==================== PAGE INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize DAG canvas
  const dagCanvas = document.getElementById('dagCanvas');
  if (dagCanvas) {
    DAGRenderer.init(dagCanvas);
  }

  // Initialize Monaco Editor
  CodeEditor.init('monacoContainer');

  // Bind form controls to store
  bindFormControls();

  // Initialize node palette drag
  initNodePalette();

  // Manual Override toggle
  const overrideToggle = document.getElementById('manualOverride');
  if (overrideToggle) {
    overrideToggle.addEventListener('change', (e) => {
      const override = e.target.checked;
      AutomationStore.setState({ manualOverride: override });
      CodeEditor.setReadOnly(!override);

      const leftPane = document.getElementById('leftPane');
      const centerPane = document.getElementById('centerPane');
      if (leftPane) leftPane.classList.toggle('pane-locked', override);
      if (centerPane) centerPane.classList.toggle('pane-locked', override);
    });
  }

  // Compile button
  const compileBtn = document.getElementById('compileBtn');
  if (compileBtn) {
    compileBtn.addEventListener('click', async () => {
      compileBtn.disabled = true;
      compileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compiling...';
      try {
        const state = AutomationStore.getState();
        const res = await fetch('/api/automations/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ast: state.ast,
            targetEngine: state.targetEngine[0] || 'custom',
            topologyType: state.topologyType,
            name: state.name
          })
        });
        const data = await res.json();
        if (data.success) {
          CodeEditor.setValue(JSON.stringify(data.compiled, null, 2));
          showToast('Compilation successful', 'success');
        } else {
          showToast('Compilation failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (e) {
        showToast('Compile request failed: ' + e.message, 'error');
      } finally {
        compileBtn.disabled = false;
        compileBtn.innerHTML = '<i class="fas fa-play"></i> Compile';
      }
    });
  }

  // Simulate button
  const simulateBtn = document.getElementById('simulateBtn');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', async () => {
      simulateBtn.disabled = true;
      simulateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Simulating...';
      try {
        const compiled = CodeEditor.getValue();
        const state = AutomationStore.getState();
        const res = await fetch('/api/proxy/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            compiled: JSON.parse(compiled),
            targetEngine: state.targetEngine[0] || 'custom'
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Simulation complete: ' + data.results.length + ' steps executed', 'success');
          // Feed simulation results into telemetry chart
          data.results.forEach(r => {
            TelemetryWS.addDataPoint({
              executed_at: r.timestamp || new Date().toISOString(),
              latency_ms: r.latencyMs || Math.floor(Math.random() * 200),
              execution_status: r.status || 'success',
              anomaly_score: r.anomalyScore || 0
            });
          });
        } else {
          showToast('Simulation failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (e) {
        showToast('Simulation error: ' + e.message, 'error');
      } finally {
        simulateBtn.disabled = false;
        simulateBtn.innerHTML = '<i class="fas fa-flask"></i> Simulate';
      }
    });
  }

  // Save button
  const saveBtn = document.getElementById('saveAutomation');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      try {
        const state = AutomationStore.getState();
        const body = {
          name: state.name,
          description: state.ast.metadata.llmPrompt || '',
          target_engine: state.targetEngine,
          topology_type: state.topologyType,
          ast_payload: state.ast,
          status: state.status,
          trigger_type: state.ast.metadata.trigger.type || null,
          trigger_config: state.ast.metadata.trigger.config || {},
          action_type: state.ast.metadata.actions[0]?.type || null,
          action_config: state.ast.metadata.actions[0]?.config || {}
        };
        const res = await fetch('/api/automations/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          AutomationStore.setState({ automationId: data.id });
          showToast('Automation saved', 'success');
          // Start telemetry if we got an ID
          if (data.id) TelemetryWS.connect(data.id);
        } else {
          showToast('Save failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (e) {
        showToast('Save error: ' + e.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
      }
    });
  }
});

function bindFormControls() {
  // Automation name
  const nameInput = document.getElementById('automationName');
  if (nameInput) {
    nameInput.addEventListener('input', e => {
      AutomationStore.setState({ name: e.target.value });
    });
  }

  // Target engine
  const engineSelect = document.getElementById('targetEngine');
  if (engineSelect) {
    engineSelect.addEventListener('change', e => {
      const selected = Array.from(e.target.selectedOptions).map(o => o.value);
      AutomationStore.setState({ targetEngine: selected.length ? selected : ['custom'] });
    });
  }

  // Topology type
  const topoSelect = document.getElementById('topologyType');
  if (topoSelect) {
    topoSelect.addEventListener('change', e => {
      AutomationStore.setState({ topologyType: e.target.value });
    });
  }

  // Trigger type
  const triggerSelect = document.getElementById('triggerType');
  if (triggerSelect) {
    triggerSelect.addEventListener('change', e => {
      AutomationStore.updateMetadata({
        trigger: { ...AutomationStore.getState().ast.metadata.trigger, type: e.target.value }
      });
    });
  }

  // LLM Prompt
  const llmPrompt = document.getElementById('llmPrompt');
  if (llmPrompt) {
    llmPrompt.addEventListener('input', e => {
      AutomationStore.updateMetadata({ llmPrompt: e.target.value });
    });
  }

  // Status - update store AND toolbar badge reactively
  const statusSelect = document.getElementById('automationStatus');
  if (statusSelect) {
    statusSelect.addEventListener('change', e => {
      AutomationStore.setState({ status: e.target.value });
      updateStatusBadge(e.target.value);
    });
  }
}

function updateStatusBadge(status) {
  const badge = document.getElementById('statusBadge');
  if (!badge) return;
  badge.textContent = status;
  // Use same status-badge classes from style.css
  badge.className = 'status-badge ' + status;
}

function initNodePalette() {
  document.querySelectorAll('.node-palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.nodeType;
      const label = item.dataset.nodeLabel || type.charAt(0).toUpperCase() + type.slice(1);
      const canvas = document.getElementById('dagCanvas');
      AutomationStore.addNode({
        type,
        label,
        position: {
          x: 50 + Math.random() * (canvas ? canvas.width - 250 : 200),
          y: 50 + AutomationStore.getState().ast.nodes.length * 80
        }
      });
    });
  });
}

function showToast(message, type) {
  const container = document.getElementById('toastContainer') || document.body;
  const toast = document.createElement('div');
  toast.className = `compiler-toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
