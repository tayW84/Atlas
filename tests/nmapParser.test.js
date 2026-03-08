const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { parseXmlContent, parseTextContent, parseScanDirectory } = require('../src/parser/nmapParser');
const { buildGraph, subnetFromIp } = require('../src/graph/buildGraph');

async function readFixture(name) {
  return fs.readFile(path.join(__dirname, 'fixtures', name), 'utf-8');
}

test('parseXmlContent extracts host, open ports, and service details', async () => {
  const xmlContent = await readFixture('sample.xml');
  const result = await parseXmlContent(xmlContent);

  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].ip, '192.168.1.10');
  assert.deepEqual(result.hosts[0].ports, [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: 'ssh',
      version: 'OpenSSH 8.9p1',
      details: []
    }
  ]);
});

test('parseTextContent extracts IPs, open ports, and service versions', async () => {
  const textContent = await readFixture('sample.txt');
  const result = parseTextContent(textContent);

  assert.equal(result.hosts.length, 2);
  assert.equal(result.hosts[0].ip, '192.168.1.20');
  assert.equal(result.hosts[1].ip, '192.168.1.1');
  assert.deepEqual(result.hosts[0].ports[0], {
    port: 53,
    protocol: 'tcp',
    state: 'open',
    service: 'domain',
    version: 'dnsmasq 2.80',
    details: []
  });
  assert.deepEqual(result.hosts[1].ports[1], {
    port: 161,
    protocol: 'udp',
    state: 'open',
    service: 'snmp',
    version: 'SNMPv2 server',
    details: []
  });
});

test('parseTextContent keeps per-port script detail lines', () => {
  const content = [
    'Nmap scan report for 10.0.0.10',
    'PORT     STATE SERVICE VERSION',
    '80/tcp   open  http    nginx 1.24.0',
    '| http-title: Internal landing page',
    '|_http-server-header: nginx',
    ''
  ].join('\n');

  const result = parseTextContent(content);
  assert.deepEqual(result.hosts[0].ports[0].details, [
    'http-title: Internal landing page',
    'http-server-header: nginx'
  ]);
});

test('parseTextContent extracts hostname and domain from host script results', async () => {
  const textContent = await readFixture('sample-host-script.txt');
  const result = parseTextContent(textContent);

  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].ip, '172.16.7.50');
  assert.equal(result.hosts[0].hostname, 'MS01');
  assert.equal(result.hosts[0].domain, 'INLANEFREIGHT');
  assert.deepEqual(result.hosts[0].hostScriptResults, [
    'nbstat: NetBIOS name: MS01, NetBIOS user: <unknown>, NetBIOS MAC: 00:50:56:b0:38:59 (VMware)',
    'rdp-ntlm-info:',
    'NetBIOS_Domain_Name: INLANEFREIGHT',
    'NetBIOS_Computer_Name: MS01',
    'DNS_Computer_Name: MS01.INLANEFREIGHT.LOCAL'
  ]);
});

test('subnetFromIp returns /24 subnet when IPv4 is valid', () => {
  assert.equal(subnetFromIp('10.10.10.200'), '10.10.10.0/24');
  assert.equal(subnetFromIp('not-an-ip'), null);
});

test('parseScanDirectory merges scan files and buildGraph groups hosts by /24 subnet', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-scan-'));
  const xmlFixture = await readFixture('sample.xml');
  const textFixture = await readFixture('sample.txt');

  await fs.writeFile(path.join(tempDir, 'a.xml'), xmlFixture);
  await fs.writeFile(path.join(tempDir, 'b.txt'), textFixture);

  const parsed = await parseScanDirectory(tempDir);
  assert.equal(parsed.hosts.length, 3);
  assert.deepEqual(parsed.hosts.find((host) => host.ip === '192.168.1.10').scanFiles, ['a.xml']);

  const graph = buildGraph(parsed.hosts);
  const subnetNode = graph.nodes.find((node) => node.data.id === '192.168.1.0/24');

  assert.ok(subnetNode, 'expected connected hub node to be created');
  assert.equal(graph.edges.length, 3);
  assert.ok(graph.edges.some((edge) => edge.data.target === '192.168.1.10'));
});

test('buildGraph uses domain as connected node when present', async () => {
  const graph = buildGraph([
    {
      id: '172.16.7.50',
      ip: '172.16.7.50',
      hostname: 'MS01',
      domain: 'INLANEFREIGHT',
      ports: [],
      scanFiles: ['host.txt']
    }
  ]);

  const domainNode = graph.nodes.find((node) => node.data.id === 'INLANEFREIGHT');
  assert.ok(domainNode);
  assert.equal(domainNode.data.label, 'INLANEFREIGHT\n172.16.7.0/24');
  assert.ok(graph.edges.some((edge) => edge.data.source === 'INLANEFREIGHT' && edge.data.target === '172.16.7.50'));
  const hostNode = graph.nodes.find((node) => node.data.id === '172.16.7.50');
  assert.equal(hostNode.data.label, 'MS01\n172.16.7.50');
  assert.deepEqual(hostNode.data.metadata.hostScriptResults, []);
  assert.deepEqual(hostNode.data.metadata.scanFiles, ['host.txt']);
});

test('buildGraph adds dashed-link relationship for hosts sharing a domain subnet', () => {
  const graph = buildGraph([
    {
      id: '10.10.10.100',
      ip: '10.10.10.100',
      hostname: 'SQL1',
      domain: 'TAYW',
      ports: [],
      scanFiles: []
    },
    {
      id: '10.10.10.200',
      ip: '10.10.10.200',
      hostname: 'WEB1',
      ports: [],
      scanFiles: []
    }
  ]);

  const linkEdge = graph.edges.find((edge) => edge.data.id === 'TAYW~10.10.10.200');
  assert.ok(linkEdge);
  assert.equal(linkEdge.data.source, 'TAYW');
  assert.equal(linkEdge.data.target, '10.10.10.200');
  assert.equal(linkEdge.data.type, 'domain-subnet-link');
});
