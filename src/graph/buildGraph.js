function subnetFromIp(ip) {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    return null;
  }

  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function buildGraph(hosts = []) {
  const nodes = [];
  const edges = [];
  const subnetNodes = new Set();

  for (const host of hosts) {
    nodes.push({
      data: {
        id: host.id,
        label: host.ip,
        type: 'host',
        metadata: {
          ip: host.ip,
          ports: host.ports || []
        }
      }
    });

    const subnetId = subnetFromIp(host.ip);
    if (!subnetId) {
      continue;
    }

    if (!subnetNodes.has(subnetId)) {
      nodes.push({
        data: {
          id: subnetId,
          label: subnetId,
          type: 'subnet',
          metadata: {
            subnet: subnetId
          }
        }
      });
      subnetNodes.add(subnetId);
    }

    edges.push({
      data: {
        id: `${subnetId}->${host.id}`,
        source: subnetId,
        target: host.id,
        type: 'subnet-membership'
      }
    });
  }

  return { nodes, edges };
}

module.exports = {
  buildGraph,
  subnetFromIp
};
