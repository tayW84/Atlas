let cy;

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

function renderPortDetails(nodeData) {
  const hostIpElement = document.getElementById('host-ip');
  const hostNameElement = document.getElementById('host-hostname');
  const hostDomainElement = document.getElementById('host-domain');
  const hostScriptResultsListElement = document.getElementById('host-script-results-list');
  const portsListElement = document.getElementById('ports-list');

  hostScriptResultsListElement.innerHTML = '';
  portsListElement.innerHTML = '';

  if (!nodeData || nodeData.type !== 'host') {
    hostNameElement.textContent = 'Click a host node to inspect services.';
    hostIpElement.textContent = '';
    hostDomainElement.textContent = '';
    hostScriptResultsListElement.innerHTML = '';
    setScanFileLink([]);
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
          'font-size': 12,
          'text-valign': 'center',
          'text-wrap': 'wrap',
          width: 72,
          height: 72
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
