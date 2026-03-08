const fs = require('node:fs/promises');
const path = require('node:path');
const { parseStringPromise } = require('xml2js');

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseVersionFromService(serviceAttrs = {}) {
  const versionParts = [serviceAttrs.product, serviceAttrs.version, serviceAttrs.extrainfo]
    .filter(Boolean)
    .join(' ')
    .trim();

  return versionParts || '';
}

function parseXmlHost(host) {
  const addresses = ensureArray(host.address);
  const ipv4Addr = addresses.find((entry) => entry.$?.addrtype === 'ipv4') || addresses[0];
  const ip = ipv4Addr?.$?.addr;

  if (!ip) {
    return null;
  }

  const ports = [];
  const portEntries = ensureArray(host.ports?.[0]?.port || host.ports?.port);

  for (const portEntry of portEntries) {
    const attrs = portEntry.$ || {};
    const stateAttrs = portEntry.state?.[0]?.$ || portEntry.state?.$ || {};

    if (stateAttrs.state !== 'open') {
      continue;
    }

    const serviceAttrs = portEntry.service?.[0]?.$ || portEntry.service?.$ || {};

    ports.push({
      port: Number(attrs.portid),
      protocol: attrs.protocol || 'tcp',
      state: stateAttrs.state || 'open',
      service: serviceAttrs.name || 'unknown',
      version: parseVersionFromService(serviceAttrs)
    });
  }

  return {
    id: ip,
    ip,
    hostname: null,
    domain: null,
    ports
  };
}

async function parseXmlContent(content) {
  const parsed = await parseStringPromise(content, {
    explicitArray: true,
    trim: true,
    mergeAttrs: false
  });

  const hosts = ensureArray(parsed?.nmaprun?.host)
    .map(parseXmlHost)
    .filter(Boolean);

  return { hosts, edges: [] };
}

function parseTextHostIp(line) {
  const withParen = line.match(/Nmap scan report for .*\((\d+\.\d+\.\d+\.\d+)\)/i);
  if (withParen) {
    return withParen[1];
  }

  const directIp = line.match(/Nmap scan report for (\d+\.\d+\.\d+\.\d+)/i);
  return directIp ? directIp[1] : null;
}

function parseTextPortLine(line) {
  const match = line.match(/^(\d+)\/(tcp|udp)\s+(\S+)\s+(\S+)?\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const [, port, protocol, state, serviceName, remainder] = match;

  return {
    port: Number(port),
    protocol: protocol.toLowerCase(),
    state: state.toLowerCase(),
    service: serviceName || 'unknown',
    version: (remainder || '').trim()
  };
}

function parseTextContent(content) {
  const lines = content.split(/\r?\n/);
  const hosts = [];

  let currentHost = null;
  let inPortsSection = false;

  for (const line of lines) {
    if (/^Nmap scan report for /i.test(line)) {
      if (currentHost) {
        hosts.push(currentHost);
      }

      const ip = parseTextHostIp(line);
      currentHost = ip
        ? {
          id: ip,
          ip,
          hostname: null,
          domain: null,
          ports: []
        }
        : null;
      inPortsSection = false;
      continue;
    }

    if (!currentHost) {
      continue;
    }

    if (/^PORT\s+STATE\s+SERVICE/i.test(line)) {
      inPortsSection = true;
      continue;
    }

    if (inPortsSection && line.trim() === '') {
      inPortsSection = false;
      continue;
    }

    if (!inPortsSection) {
      const hostnameMatch = line.match(/NetBIOS name:\s*([^,\s]+)/i)
        || line.match(/NetBIOS_Computer_Name:\s*(\S+)/i);

      if (hostnameMatch && !currentHost.hostname) {
        currentHost.hostname = hostnameMatch[1].trim();
      }

      const domainMatch = line.match(/NetBIOS_Domain_Name:\s*(\S+)/i)
        || line.match(/^\|\s+([A-Z0-9._-]+)<00>\s+Flags:\s+<group><active>/i);

      if (domainMatch && !currentHost.domain) {
        currentHost.domain = domainMatch[1].trim();
      }

      continue;
    }

    const parsedPort = parseTextPortLine(line.trim());
    if (!parsedPort || parsedPort.state !== 'open') {
      continue;
    }

    currentHost.ports.push(parsedPort);
  }

  if (currentHost) {
    hosts.push(currentHost);
  }

  return { hosts, edges: [] };
}

function mergeResults(results) {
  const hostMap = new Map();

  for (const result of results) {
    for (const host of result.hosts || []) {
      if (!hostMap.has(host.ip)) {
        hostMap.set(host.ip, {
          id: host.ip,
          ip: host.ip,
          hostname: null,
          domain: null,
          ports: []
        });
      }

      const existing = hostMap.get(host.ip);

      if (!existing.hostname && host.hostname) {
        existing.hostname = host.hostname;
      }

      if (!existing.domain && host.domain) {
        existing.domain = host.domain;
      }

      const portKeySet = new Set(existing.ports.map((port) => `${port.port}/${port.protocol}`));

      for (const port of host.ports || []) {
        const key = `${port.port}/${port.protocol}`;
        if (portKeySet.has(key)) {
          continue;
        }
        existing.ports.push(port);
        portKeySet.add(key);
      }
    }
  }

  return {
    hosts: Array.from(hostMap.values()),
    edges: []
  };
}

async function parseScanDirectory(scanDirectory) {
  const directoryPath = path.resolve(scanDirectory);
  let files = [];

  try {
    files = await fs.readdir(directoryPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { hosts: [], edges: [] };
    }
    throw error;
  }

  const parseResults = [];

  for (const fileName of files) {
    const filePath = path.join(directoryPath, fileName);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('<')) {
      try {
        parseResults.push(await parseXmlContent(trimmed));
        continue;
      } catch (error) {
        // Fall through to text parser as best-effort fallback.
      }
    }

    parseResults.push(parseTextContent(trimmed));
  }

  return mergeResults(parseResults);
}

module.exports = {
  parseScanDirectory,
  parseXmlContent,
  parseTextContent
};
