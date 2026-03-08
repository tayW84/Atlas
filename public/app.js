let cy;

function renderPortDetails(nodeData) {
  const hostIpElement = document.getElementById('host-ip');
  const hostNameElement = document.getElementById('host-hostname');
  const hostDomainElement = document.getElementById('host-domain');
  const portsListElement = document.getElementById('ports-list');

  portsListElement.innerHTML = '';

  if (!nodeData || nodeData.type !== 'host') {
    hostIpElement.textContent = 'Click a host node to inspect services.';
    hostNameElement.textContent = '';
    hostDomainElement.textContent = '';
    return;
  }

  hostIpElement.textContent = `IP: ${nodeData.metadata?.ip || nodeData.id}`;
  hostNameElement.textContent = nodeData.metadata?.hostname
    ? `Hostname: ${nodeData.metadata.hostname}`
    : 'Hostname: Unknown';
  hostDomainElement.textContent = nodeData.metadata?.domain
    ? `Connected node: ${nodeData.metadata.domain}`
    : '';
  const ports = nodeData.metadata?.ports || [];

  if (ports.length === 0) {
    const emptyStateItem = document.createElement('li');
    emptyStateItem.textContent = 'No open ports found';
    portsListElement.appendChild(emptyStateItem);
    return;
  }

  for (const port of ports) {
    const item = document.createElement('li');
    const versionText = port.version ? ` (${port.version})` : '';
    item.textContent = `${port.port}/${port.protocol} ${port.service}${versionText}`;
    portsListElement.appendChild(item);
  }
}

function initializeGraph(elements) {
  const container = document.getElementById('cy');

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
          'font-size': 11,
          'text-valign': 'center',
          'text-wrap': 'wrap',
          width: 45,
          height: 45
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
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#8a8a8a',
          'target-arrow-color': '#8a8a8a',
          'target-arrow-shape': 'triangle'
        }
      }
    ],
    layout: {
      name: 'cose',
      animate: false,
      padding: 20
    }
  });

  cy.on('tap', 'node', (event) => {
    renderPortDetails(event.target.data());
  });
}

async function loadGraph() {
  const response = await fetch('/api/network-map');
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load network map');
  }

  const elements = [...payload.graph.nodes, ...payload.graph.edges];

  if (cy) {
    cy.destroy();
  }

  initializeGraph(elements);
  renderPortDetails(null);
}

async function refreshGraph() {
  const button = document.getElementById('refresh-btn');
  button.disabled = true;

  try {
    await loadGraph();
  } catch (error) {
    // eslint-disable-next-line no-alert
    alert(`Unable to refresh graph: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

document.getElementById('refresh-btn').addEventListener('click', refreshGraph);
refreshGraph();
