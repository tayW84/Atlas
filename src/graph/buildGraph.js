function connectedNodeId(host = {}) {
  const domain = host.domain?.trim();
  if (domain) {
    return domain;
  }

  const octets = (host.ip || '').split('.');
  if (octets.length !== 4) {
    return null;
  }

  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function buildGraph(hosts = []) {
  const nodes = [];
  const edges = [];
  const connectedNodes = new Set();

  for (const host of hosts) {
    nodes.push({
      data: {
        id: host.id,
        label: host.hostname ? `${host.ip}\n${host.hostname}` : host.ip,
        type: 'host',
        metadata: {
          ip: host.ip,
          hostname: host.hostname || null,
          domain: host.domain || null,
          ports: host.ports || [],
          scanFiles: host.scanFiles || []
        }
      }
    });

    const connectedId = connectedNodeId(host);
    if (!connectedId) {
      continue;
    }

    if (!connectedNodes.has(connectedId)) {
      nodes.push({
        data: {
          id: connectedId,
          label: connectedId,
          type: 'subnet',
          metadata: {
            subnet: connectedId
          }
        }
      });
      connectedNodes.add(connectedId);
    }

    edges.push({
      data: {
        id: `${connectedId}->${host.id}`,
        source: connectedId,
        target: host.id,
        type: 'subnet-membership'
      }
    });
  }

  return { nodes, edges };
}

module.exports = {
  buildGraph,
  connectedNodeId
};
