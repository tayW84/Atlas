let cy;
let baseGraph = { nodes: [], edges: [] };
let customGraphState = createDefaultCustomGraphState();
let connectionDraft = null;

const CUSTOM_GRAPH_STORAGE_KEY = 'atlas-custom-graph';
const GRAPH_LAYOUT_STORAGE_KEY = 'atlas-graph-layout';
const EDGE_NOTE_EMPTY_STATE = 'Select an edge to inspect or annotate it.';
const NODE_NOTE_EMPTY_STATE = 'Select a host or domain node to inspect details.';

function createDefaultCustomGraphState() {
  return {
    nodeNotes: {},
    edgeNotes: {},
    customEdges: []
  };
}

function createDefaultLayoutState() {
  return {
    anchorNodeId: null,
    positions: {}
  };
}

function loadCustomGraphState() {
  try {
    const rawState = window.localStorage.getItem(CUSTOM_GRAPH_STORAGE_KEY);
    if (!rawState) {
      return createDefaultCustomGraphState();
    }

    const parsedState = JSON.parse(rawState);
    return {
      nodeNotes: parsedState.nodeNotes || {},
      edgeNotes: parsedState.edgeNotes || {},
      customEdges: Array.isArray(parsedState.customEdges) ? parsedState.customEdges : []
    };
  } catch (error) {
    console.warn('Unable to load custom graph state', error);
    return createDefaultCustomGraphState();
  }
}

function saveCustomGraphState() {
  window.localStorage.setItem(CUSTOM_GRAPH_STORAGE_KEY, JSON.stringify(customGraphState));
}

function loadLayoutState() {
  try {
    const rawState = window.localStorage.getItem(GRAPH_LAYOUT_STORAGE_KEY);
    if (!rawState) {
      return createDefaultLayoutState();
    }

    const parsedState = JSON.parse(rawState);
    return {
      anchorNodeId: parsedState.anchorNodeId || null,
      positions: parsedState.positions || {}
    };
  } catch (error) {
    console.warn('Unable to load graph layout state', error);
    return createDefaultLayoutState();
  }
}

let layoutState = createDefaultLayoutState();

function saveLayoutState() {
  window.localStorage.setItem(GRAPH_LAYOUT_STORAGE_KEY, JSON.stringify(layoutState));
}

function getStoredPosition(nodeId) {
  const position = layoutState.positions[nodeId];
  if (!position) {
    return null;
  }

  if (typeof position.x !== 'number' || typeof position.y !== 'number') {
    return null;
  }

  return position;
}

function persistCurrentNodePositions() {
  if (!cy) {
    return;
  }

  const nextPositions = {};
  cy.nodes().forEach((node) => {
    const position = node.position();
    nextPositions[node.id()] = {
      x: position.x,
      y: position.y
    };
  });

  layoutState.positions = nextPositions;
  saveLayoutState();
}

function pruneStoredPositions(elements = []) {
  const validNodeIds = new Set(
    elements
      .filter((element) => element.data?.id && !element.data?.source && !element.data?.target)
      .map((element) => element.data.id)
  );

  layoutState.positions = Object.fromEntries(
    Object.entries(layoutState.positions).filter(([nodeId]) => validNodeIds.has(nodeId))
  );

  if (layoutState.anchorNodeId && !validNodeIds.has(layoutState.anchorNodeId)) {
    layoutState.anchorNodeId = null;
  }
}

function applyAnchoredLayout() {
  if (!cy) {
    return;
  }

  const anchorNodeId = layoutState.anchorNodeId;
  const anchorExists = Boolean(anchorNodeId) && cy.getElementById(anchorNodeId).nonempty();
  const allNodesHaveStoredPositions = cy.nodes().every((node) => Boolean(getStoredPosition(node.id())));

  if (anchorExists && !allNodesHaveStoredPositions) {
    const anchorNode = cy.getElementById(anchorNodeId);
    cy.layout({
      name: 'breadthfirst',
      animate: false,
      directed: true,
      circle: false,
      spacingFactor: 1.25,
      padding: 20,
      roots: anchorNode
    }).run();
    persistCurrentNodePositions();
  }

  if (Object.keys(layoutState.positions).length > 0) {
    cy.nodes().positions((node) => getStoredPosition(node.id()) || node.position());
  } else {
    cy.layout({
      name: 'cose',
      animate: false,
      padding: 20
    }).run();
    persistCurrentNodePositions();
  }
}

function updateLayoutButtons() {
  const anchorButton = document.getElementById('anchor-node-btn');
  const resetButton = document.getElementById('reset-layout-btn');
  const selectedNode = cy?.$(':selected').filter('node')[0] || null;

  if (selectedNode) {
    anchorButton.disabled = false;
    anchorButton.textContent = `Anchor from ${selectedNode.id()}`;
  } else if (layoutState.anchorNodeId) {
    anchorButton.disabled = true;
    anchorButton.textContent = `Anchor set: ${layoutState.anchorNodeId}`;
  } else {
    anchorButton.disabled = true;
    anchorButton.textContent = 'Set selected node as anchor';
  }

  resetButton.textContent = layoutState.anchorNodeId ? 'Reset anchored layout' : 'Reset layout';
}

function truncateNote(note = '', maxLength = 42) {
  const trimmed = note.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function edgeStorageKey(sourceId, targetId) {
  return `${sourceId}=>${targetId}`;
}

function getNodeNote(nodeId) {
  return customGraphState.nodeNotes[nodeId] || '';
}

function getEdgeNote(sourceId, targetId) {
  return customGraphState.edgeNotes[edgeStorageKey(sourceId, targetId)] || '';
}

function setScanFileLink(scanFiles = []) {
  const scanFileLink = document.getElementById('scan-file-link');
  const primaryFile = scanFiles[0];

  if (!primaryFile) {
    scanFileLink.href = '#';
    scanFileLink.setAttribute('aria-disabled', 'true');
    scanFileLink.textContent = 'Open Nmap scan file';
    return;
  }

  scanFileLink.href = `/api/scan-files/${encodeURIComponent(primaryFile)}`;
  scanFileLink.setAttribute('aria-disabled', 'false');
  scanFileLink.textContent = `Open Nmap scan file (${primaryFile})`;
}

function setScanStatus(message, isError = false) {
  const statusElement = document.getElementById('scan-status');
  statusElement.textContent = message;
  statusElement.dataset.state = isError ? 'error' : 'info';
}

function renderSelectionDetails(element = null) {
  const hostIpElement = document.getElementById('host-ip');
  const hostNameElement = document.getElementById('host-hostname');
  const hostDomainElement = document.getElementById('host-domain');
  const hostScriptResultsListElement = document.getElementById('host-script-results-list');
  const portsListElement = document.getElementById('ports-list');
  const nodeNoteElement = document.getElementById('node-note');
  const edgeSummaryElement = document.getElementById('edge-summary');
  const edgeNoteElement = document.getElementById('edge-note');

  hostScriptResultsListElement.innerHTML = '';
  portsListElement.innerHTML = '';
  nodeNoteElement.textContent = NODE_NOTE_EMPTY_STATE;
  edgeSummaryElement.textContent = '';
  edgeNoteElement.textContent = EDGE_NOTE_EMPTY_STATE;

  if (!element) {
    hostNameElement.textContent = 'Right-click nodes to connect or annotate them.';
    hostIpElement.textContent = '';
    hostDomainElement.textContent = '';
    setScanFileLink([]);
    return;
  }

  if (element.group() === 'edges') {
    const edgeData = element.data();
    const note = edgeData.note || 'No note added yet.';

    hostNameElement.textContent = 'Edge selected';
    hostIpElement.textContent = '';
    hostDomainElement.textContent = '';
    setScanFileLink([]);
    edgeSummaryElement.textContent = `${edgeData.source} → ${edgeData.target}`;
    edgeNoteElement.textContent = note;
    nodeNoteElement.textContent = NODE_NOTE_EMPTY_STATE;
    return;
  }

  const nodeData = element.data();
  const nodeTypeLabel = nodeData.type === 'host' ? 'host' : 'domain/subnet';
  const nodeNote = nodeData.note || 'No note added yet.';
  nodeNoteElement.textContent = nodeNote;

  if (nodeData.type !== 'host') {
    hostNameElement.textContent = `Selected ${nodeTypeLabel}: ${nodeData.id}`;
    hostIpElement.textContent = nodeData.metadata?.subnet ? `Subnet: ${nodeData.metadata.subnet}` : '';
    hostDomainElement.textContent = '';
    setScanFileLink([]);

    const emptyStateItem = document.createElement('li');
    emptyStateItem.textContent = 'No host script results available for this node type.';
    hostScriptResultsListElement.appendChild(emptyStateItem);

    const portsEmptyStateItem = document.createElement('li');
    portsEmptyStateItem.textContent = 'No open ports found for this node type.';
    portsListElement.appendChild(portsEmptyStateItem);
    return;
  }

  hostNameElement.textContent = nodeData.metadata?.hostname
    ? `Hostname: ${nodeData.metadata.hostname}`
    : 'Hostname: Unknown';
  hostIpElement.textContent = `IP: ${nodeData.metadata?.ip || nodeData.id}`;
  hostDomainElement.textContent = nodeData.metadata?.domain
    ? `Connected node: ${nodeData.metadata.domain}`
    : '';

  setScanFileLink(nodeData.metadata?.scanFiles || []);

  const hostScriptResults = nodeData.metadata?.hostScriptResults || [];
  if (hostScriptResults.length === 0) {
    const emptyStateItem = document.createElement('li');
    emptyStateItem.textContent = 'No host script results available.';
    hostScriptResultsListElement.appendChild(emptyStateItem);
  } else {
    for (const resultLine of hostScriptResults) {
      const item = document.createElement('li');
      item.textContent = resultLine;
      hostScriptResultsListElement.appendChild(item);
    }
  }

  const ports = nodeData.metadata?.ports || [];

  if (ports.length === 0) {
    const emptyStateItem = document.createElement('li');
    emptyStateItem.textContent = 'No open ports found';
    portsListElement.appendChild(emptyStateItem);
    return;
  }

  for (const port of ports) {
    const item = document.createElement('li');
    const summaryButton = document.createElement('button');
    summaryButton.type = 'button';
    summaryButton.className = 'port-toggle';

    const versionText = port.version ? ` (${port.version})` : '';
    summaryButton.textContent = `${port.port}/${port.protocol} ${port.service}${versionText}`;

    const detailsElement = document.createElement('pre');
    detailsElement.className = 'port-extra-details';
    detailsElement.hidden = true;

    const detailLines = Array.isArray(port.details) ? port.details : [];
    detailsElement.textContent = detailLines.length > 0
      ? detailLines.join('\n')
      : 'No additional Nmap script details available for this port.';

    summaryButton.addEventListener('click', () => {
      detailsElement.hidden = !detailsElement.hidden;
    });

    item.appendChild(summaryButton);
    item.appendChild(detailsElement);
    portsListElement.appendChild(item);
  }
}

function sanitizeCustomGraphState(validNodeIds = new Set(), state = customGraphState, graph = baseGraph, draft = connectionDraft) {
  const sanitizedNodeNotes = Object.fromEntries(
    Object.entries(state.nodeNotes || {}).filter(([nodeId]) => validNodeIds.has(nodeId))
  );

  const validCustomEdges = (state.customEdges || []).filter((edge) => (
    validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
  ));

  const validCustomEdgeKeys = new Set(validCustomEdges.map((edge) => edgeStorageKey(edge.source, edge.target)));
  const baseEdgeKeys = new Set(
    (graph.edges || []).map((edge) => edgeStorageKey(edge.data.source, edge.data.target))
  );

  const sanitizedEdgeNotes = Object.fromEntries(
    Object.entries(state.edgeNotes || {}).filter(([edgeKey]) => (
      validCustomEdgeKeys.has(edgeKey) || baseEdgeKeys.has(edgeKey)
    ))
  );

  const nextDraft = draft && validNodeIds.has(draft.sourceId) ? draft : null;
  const nextState = {
    ...state,
    nodeNotes: sanitizedNodeNotes,
    edgeNotes: sanitizedEdgeNotes,
    customEdges: validCustomEdges
  };

  const customStateChanged = validCustomEdges.length !== (state.customEdges || []).length
    || Object.keys(sanitizedNodeNotes).length !== Object.keys(state.nodeNotes || {}).length
    || Object.keys(sanitizedEdgeNotes).length !== Object.keys(state.edgeNotes || {}).length;

  if (state === customGraphState) {
    customGraphState = nextState;

    if (customStateChanged) {
      saveCustomGraphState();
    }
  }

  if (draft === connectionDraft) {
    connectionDraft = nextDraft;
  }

  return {
    customState: nextState,
    connectionDraft: nextDraft,
    customEdges: validCustomEdges,
    changed: customStateChanged || nextDraft !== draft
  };
}

function buildCustomElements() {
  const validNodeIds = new Set(baseGraph.nodes.map((node) => node.data.id));
  const { customEdges: validCustomEdges } = sanitizeCustomGraphState(validNodeIds);
  const customEdges = validCustomEdges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'custom-link',
      note: getEdgeNote(edge.source, edge.target),
      notePreview: truncateNote(getEdgeNote(edge.source, edge.target))
    }
  }));

  return {
    nodes: [],
    edges: customEdges
  };
}

function mergeGraphElements() {
  const baseNodes = baseGraph.nodes.map((node) => ({
    data: {
      ...node.data,
      note: getNodeNote(node.data.id)
    },
    classes: getNodeNote(node.data.id) ? 'has-note' : ''
  }));

  const baseEdges = baseGraph.edges.map((edge) => ({
    data: {
      ...edge.data,
      note: getEdgeNote(edge.data.source, edge.data.target),
      notePreview: truncateNote(getEdgeNote(edge.data.source, edge.data.target))
    },
    classes: getEdgeNote(edge.data.source, edge.data.target) ? 'has-note' : ''
  }));

  const customElements = buildCustomElements();
  const customEdges = customElements.edges.map((edge) => ({
    ...edge,
    classes: edge.data.note ? 'has-note' : ''
  }));

  return [...baseNodes, ...baseEdges, ...customEdges];
}

function positionContextMenu(event) {
  const menu = document.getElementById('context-menu');
  const renderedPosition = event.renderedPosition || event.position || { x: 0, y: 0 };
  menu.style.left = `${renderedPosition.x + 16}px`;
  menu.style.top = `${renderedPosition.y + 16}px`;
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  menu.hidden = true;
  menu.dataset.targetId = '';
  menu.dataset.targetGroup = '';
  menu.dataset.edgeSource = '';
  menu.dataset.edgeTarget = '';
}

function queueContextMenuAction(callback) {
  hideContextMenu();
  window.requestAnimationFrame(() => {
    callback();
  });
}

function showContextMenuForNode(event) {
  const menu = document.getElementById('context-menu');
  const targetNode = event.target;
  const connectButton = document.getElementById('context-connect-btn');
  const cancelConnectButton = document.getElementById('context-cancel-connect-btn');
  const noteButton = document.getElementById('context-note-btn');

  menu.dataset.targetId = targetNode.id();
  menu.dataset.targetGroup = 'node';
  menu.dataset.edgeSource = '';
  menu.dataset.edgeTarget = '';

  if (connectionDraft && connectionDraft.sourceId !== targetNode.id()) {
    connectButton.textContent = `Connect from ${connectionDraft.sourceId}`;
  } else {
    connectButton.textContent = `Start connection from ${targetNode.id()}`;
  }

  noteButton.textContent = getNodeNote(targetNode.id()) ? 'Edit node note' : 'Add node note';
  cancelConnectButton.hidden = !connectionDraft;

  positionContextMenu(event);
  menu.hidden = false;
}

function showContextMenuForEdge(event) {
  const menu = document.getElementById('context-menu');
  const targetEdge = event.target;
  const connectButton = document.getElementById('context-connect-btn');
  const cancelConnectButton = document.getElementById('context-cancel-connect-btn');
  const noteButton = document.getElementById('context-note-btn');

  menu.dataset.targetId = targetEdge.id();
  menu.dataset.targetGroup = 'edge';
  menu.dataset.edgeSource = targetEdge.data('source');
  menu.dataset.edgeTarget = targetEdge.data('target');

  connectButton.textContent = 'Connections require nodes';
  noteButton.textContent = targetEdge.data('note') ? 'Edit edge note' : 'Add edge note';
  cancelConnectButton.hidden = !connectionDraft;

  positionContextMenu(event);
  menu.hidden = false;
}

function refreshGraphView() {
  const selectedElement = cy?.$(':selected')[0] || null;
  const elements = mergeGraphElements();
  pruneStoredPositions(elements);
  initializeGraph(elements);

  if (selectedElement) {
    const matchingElement = cy.getElementById(selectedElement.id());
    if (matchingElement.nonempty()) {
      matchingElement.select();
      renderSelectionDetails(matchingElement);
      updateLayoutButtons();
      return;
    }
  }

  renderSelectionDetails(null);
  updateLayoutButtons();
}

function upsertCustomEdge(sourceId, targetId, note = '') {
  const existingEdge = customGraphState.customEdges.find((edge) => edge.source === sourceId && edge.target === targetId);
  if (!existingEdge) {
    customGraphState.customEdges.push({
      id: `custom:${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId
    });
  }

  if (note.trim()) {
    customGraphState.edgeNotes[edgeStorageKey(sourceId, targetId)] = note.trim();
  }

  saveCustomGraphState();
}

function promptForNote(existingNote = '', promptLabel = 'Add a note') {
  const enteredNote = window.prompt(`${promptLabel}. Leave blank to remove the note.`, existingNote);
  if (enteredNote === null) {
    return null;
  }

  return enteredNote.trim();
}

function handleNodeConnectionAction(nodeId) {
  if (!connectionDraft) {
    connectionDraft = { sourceId: nodeId };
    setScanStatus(`Connection mode enabled from ${nodeId}. Right-click another node or domain and choose connect.`, false);
    return;
  }

  if (connectionDraft.sourceId === nodeId) {
    setScanStatus('Choose a different target node or domain to create a link.', true);
    return;
  }

  const edgeNote = promptForNote('', `Add a note for the edge ${connectionDraft.sourceId} → ${nodeId}`);
  if (edgeNote === null) {
    setScanStatus('Connection cancelled.', false);
    connectionDraft = null;
    return;
  }

  upsertCustomEdge(connectionDraft.sourceId, nodeId, edgeNote);
  const sourceId = connectionDraft.sourceId;
  connectionDraft = null;
  refreshGraphView();
  setScanStatus(`Created a custom link from ${sourceId} to ${nodeId}.`, false);
}

function handleNoteAction(targetGroup, targetId, edgeSource, edgeTarget) {
  if (targetGroup === 'node') {
    const existingNote = getNodeNote(targetId);
    const nextNote = promptForNote(existingNote, `Edit note for ${targetId}`);
    if (nextNote === null) {
      return;
    }

    if (nextNote) {
      customGraphState.nodeNotes[targetId] = nextNote;
    } else {
      delete customGraphState.nodeNotes[targetId];
    }

    saveCustomGraphState();
    refreshGraphView();
    setScanStatus(nextNote ? `Updated note for ${targetId}.` : `Removed note for ${targetId}.`, false);
    return;
  }

  const existingNote = getEdgeNote(edgeSource, edgeTarget);
  const nextNote = promptForNote(existingNote, `Edit note for ${edgeSource} → ${edgeTarget}`);
  if (nextNote === null) {
    return;
  }

  if (nextNote) {
    customGraphState.edgeNotes[edgeStorageKey(edgeSource, edgeTarget)] = nextNote;
  } else {
    delete customGraphState.edgeNotes[edgeStorageKey(edgeSource, edgeTarget)];
  }

  saveCustomGraphState();
  refreshGraphView();
  setScanStatus(nextNote ? `Updated note for ${edgeSource} → ${edgeTarget}.` : `Removed note for ${edgeSource} → ${edgeTarget}.`, false);
}

function initializeGraph(elements) {
  const container = document.getElementById('cy');

  if (cy) {
    cy.destroy();
  }

  cy = cytoscape({
    container,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#1f77b4',
          color: '#ffffff',
          label: 'data(label)',
          'font-size': 12,
          'text-valign': 'center',
          'text-wrap': 'wrap',
          width: 72,
          height: 72,
          'border-width': 0,
          'overlay-opacity': 0
        }
      },
      {
        selector: 'node[type="subnet"]',
        style: {
          'background-color': '#2ca02c',
          shape: 'round-rectangle',
          width: 'label',
          height: 28,
          padding: '6px'
        }
      },
      {
        selector: 'node.has-note',
        style: {
          'border-width': 3,
          'border-color': '#ffd166'
        }
      },
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#8a8a8a',
          'target-arrow-color': '#8a8a8a',
          'target-arrow-shape': 'triangle',
          label: 'data(notePreview)',
          'font-size': 10,
          'text-background-color': '#081021',
          'text-background-opacity': 0.8,
          'text-background-padding': '3px',
          color: '#ffd166',
          'curve-style': 'bezier',
          'overlay-opacity': 0
        }
      },
      {
        selector: 'edge[type="domain-subnet-link"]',
        style: {
          'line-style': 'dashed',
          'target-arrow-shape': 'none',
          'line-color': '#4caf50'
        }
      },
      {
        selector: 'edge[type="custom-link"]',
        style: {
          width: 3,
          'line-color': '#ff9f1c',
          'target-arrow-color': '#ff9f1c'
        }
      },
      {
        selector: ':selected',
        style: {
          'underlay-color': '#65d5ff',
          'underlay-opacity': 0.22,
          'underlay-padding': 8
        }
      }
    ],
    layout: {
      name: 'preset'
    }
  });

  applyAnchoredLayout();
  cy.userPanningEnabled(true);
  cy.userZoomingEnabled(true);
  cy.autoungrabify(false);
  cy.nodes().grabify();

  cy.on('tap', 'node, edge', (event) => {
    event.target.select();
    renderSelectionDetails(event.target);
    hideContextMenu();
    updateLayoutButtons();
  });

  cy.on('tap', (event) => {
    if (event.target === cy) {
      cy.elements().unselect();
      renderSelectionDetails(null);
      hideContextMenu();
      updateLayoutButtons();
    }
  });

  cy.on('cxttap', 'node', (event) => {
    event.target.select();
    renderSelectionDetails(event.target);
    showContextMenuForNode(event);
  });

  cy.on('cxttap', 'edge', (event) => {
    event.target.select();
    renderSelectionDetails(event.target);
    showContextMenuForEdge(event);
  });

  cy.on('cxttap', (event) => {
    if (event.target === cy) {
      hideContextMenu();
    }
  });

  cy.on('dragfree', 'node', () => {
    persistCurrentNodePositions();
  });

  updateLayoutButtons();
}

async function loadGraph() {
  const response = await fetch('/api/network-map');
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load network map');
  }

  baseGraph = {
    nodes: payload.graph.nodes,
    edges: payload.graph.edges
  };

  const subnetInput = document.getElementById('subnet-input');
  if (!subnetInput.value && payload.defaultSubnet) {
    subnetInput.value = payload.defaultSubnet;
  }

  refreshGraphView();
}

async function refreshGraph() {
  const button = document.getElementById('refresh-btn');
  button.disabled = true;

  try {
    await loadGraph();
    setScanStatus('Graph refreshed. Right-click a node to create a custom link or note.', false);
  } catch (error) {
    setScanStatus(`Unable to refresh graph: ${error.message}`, true);
    alert(`Unable to refresh graph: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function runScan() {
  const runButton = document.getElementById('run-scan-btn');
  const subnetInput = document.getElementById('subnet-input');

  runButton.disabled = true;
  setScanStatus('Running nmap scan. This can take a while...');

  try {
    const response = await fetch('/api/run-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subnet: subnetInput.value })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || payload.details || 'Failed to run scan');
    }

    const scannedTarget = payload.target || payload.subnet;
    setScanStatus(`Scan complete for ${scannedTarget}. Saved to ${payload.outputFile}.`);
    await loadGraph();
  } catch (error) {
    setScanStatus(`Unable to run scan: ${error.message}`, true);
    alert(`Unable to run scan: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
}

function bindContextMenuActions() {
  document.getElementById('context-connect-btn').addEventListener('click', () => {
    const menu = document.getElementById('context-menu');
    const targetGroup = menu.dataset.targetGroup;
    const targetId = menu.dataset.targetId;

    queueContextMenuAction(() => {
      if (targetGroup !== 'node') {
        setScanStatus('Select a node or domain to create a connection.', true);
        return;
      }

      handleNodeConnectionAction(targetId);
    });
  });

  document.getElementById('context-note-btn').addEventListener('click', () => {
    const menu = document.getElementById('context-menu');
    const { targetGroup, targetId, edgeSource, edgeTarget } = menu.dataset;

    queueContextMenuAction(() => {
      handleNoteAction(targetGroup, targetId, edgeSource, edgeTarget);
    });
  });

  document.getElementById('context-cancel-connect-btn').addEventListener('click', () => {
    queueContextMenuAction(() => {
      connectionDraft = null;
      setScanStatus('Connection mode cancelled.', false);
    });
  });

  document.addEventListener('pointerdown', (event) => {
    const menu = document.getElementById('context-menu');
    if (!menu.hidden && !menu.contains(event.target)) {
      hideContextMenu();
    }
  }, true);

  document.addEventListener('contextmenu', (event) => {
    const menu = document.getElementById('context-menu');
    if (!menu.hidden && !menu.contains(event.target)) {
      event.preventDefault();
      hideContextMenu();
    }
  }, true);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  customGraphState = loadCustomGraphState();
  layoutState = loadLayoutState();
  document.getElementById('refresh-btn').addEventListener('click', refreshGraph);
  document.getElementById('run-scan-btn').addEventListener('click', runScan);
  document.getElementById('anchor-node-btn').addEventListener('click', () => {
    const selectedNode = cy?.$(':selected').filter('node')[0] || null;
    if (!selectedNode) {
      setScanStatus('Select a node first, then click the anchor button.', true);
      updateLayoutButtons();
      return;
    }

    layoutState.anchorNodeId = selectedNode.id();
    layoutState.positions = {};
    saveLayoutState();
    refreshGraphView();
    setScanStatus(`Anchored graph from ${selectedNode.id()}. Layout will stay left-to-right from that node until reset.`, false);
  });
  document.getElementById('reset-layout-btn').addEventListener('click', () => {
    layoutState = createDefaultLayoutState();
    saveLayoutState();
    refreshGraphView();
    setScanStatus('Graph layout reset. Select a node if you want to anchor the map again.', false);
  });
  bindContextMenuActions();
  refreshGraph();


}

if (typeof module !== 'undefined') {
  module.exports = {
    createDefaultCustomGraphState,
    edgeStorageKey,
    sanitizeCustomGraphState
  };
}
