function subnetFromIp(ip = '') {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    return null;
  }

  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function connectedNodeId(host = {}) {
  const domain = host.domain?.trim();
  if (domain) {
    return domain;
  }

  return subnetFromIp(host.ip);
}

function buildGraph(hosts = []) {
  const nodes = [];
  const edges = [];
  const connectedNodes = new Set();
  const domainSubnets = new Map();

  for (const host of hosts) {
    const domain = host.domain?.trim();
    const subnet = subnetFromIp(host.ip);

    if (!domain || !subnet) {
      continue;
    }

    const knownSubnets = domainSubnets.get(domain) || new Set();
    knownSubnets.add(subnet);
    domainSubnets.set(domain, knownSubnets);
  }

  for (const host of hosts) {
    nodes.push({
      data: {
        id: host.id,
        label: host.hostname ? `${host.hostname}\n${host.ip}` : host.ip,
        type: 'host',
        metadata: {
          ip: host.ip,
          hostname: host.hostname || null,
          domain: host.domain || null,
          hostScriptResults: host.hostScriptResults || [],
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
      const domainSubnetsForNode = domainSubnets.get(connectedId);
      const isDomainNode = Boolean(domainSubnetsForNode);
      const subnetLabel = isDomainNode
        ? Array.from(domainSubnetsForNode).sort().join(', ')
        : connectedId;

      nodes.push({
        data: {
          id: connectedId,
          label: isDomainNode ? `${connectedId}\n${subnetLabel}` : connectedId,
          type: 'subnet',
          metadata: {
            subnet: subnetLabel
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

    if (host.domain?.trim()) {
      continue;
    }

    const hostSubnet = subnetFromIp(host.ip);
    if (!hostSubnet) {
      continue;
    }

    for (const [domainName, domainSubnetSet] of domainSubnets.entries()) {
      if (!domainSubnetSet.has(hostSubnet)) {
        continue;
      }

      edges.push({
        data: {
          id: `${domainName}~${host.id}`,
          source: domainName,
          target: host.id,
          type: 'domain-subnet-link'
        }
      });
    }
  }

  return { nodes, edges };
}

module.exports = {
  buildGraph,
  connectedNodeId,
  subnetFromIp
};
