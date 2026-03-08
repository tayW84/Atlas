const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { parseXmlContent, parseTextContent, parseScanDirectory } = require('../src/parser/nmapParser');
const { buildGraph } = require('../src/graph/buildGraph');

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
      version: 'OpenSSH 8.9p1'
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
    version: 'dnsmasq 2.80'
  });
  assert.deepEqual(result.hosts[1].ports[1], {
    port: 161,
    protocol: 'udp',
    state: 'open',
    service: 'snmp',
    version: 'SNMPv2 server'
  });
});

test('parseScanDirectory merges scan files and buildGraph groups hosts by /24 subnet', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-scan-'));
  const xmlFixture = await readFixture('sample.xml');
  const textFixture = await readFixture('sample.txt');

  await fs.writeFile(path.join(tempDir, 'a.xml'), xmlFixture);
  await fs.writeFile(path.join(tempDir, 'b.txt'), textFixture);

  const parsed = await parseScanDirectory(tempDir);
  assert.equal(parsed.hosts.length, 3);

  const graph = buildGraph(parsed.hosts);
  const subnetNode = graph.nodes.find((node) => node.data.id === '192.168.1.0/24');

  assert.ok(subnetNode, 'expected subnet hub node to be created');
  assert.equal(graph.edges.length, 3);
  assert.ok(graph.edges.some((edge) => edge.data.target === '192.168.1.10'));
});
