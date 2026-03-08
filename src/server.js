const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const { parseScanDirectory } = require('./parser/nmapParser');
const { buildGraph } = require('./graph/buildGraph');

const app = express();
const port = process.env.PORT || 3000;
const scanDir = process.env.NMAP_SCAN_DIR || './scans';
const defaultSubnet = process.env.NMAP_DEFAULT_SUBNET || '192.168.1.0/24';
const scanDirectoryPath = path.resolve(scanDir);
const nmapScanFlags = ['-sV', '-sC'];

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.get('/logo.png', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'logo.png'));
});

function isValidIpv4Address(value) {
  const ipPattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(value)) {
    return false;
  }

  const octets = value.split('.').map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255);
}

function classifyScanTarget(rawTarget) {
  const target = rawTarget.trim();
  if (!target) {
    return { kind: 'invalid', value: target };
  }

  if (target.includes('/')) {
    const subnetPattern = /^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
    if (!subnetPattern.test(target)) {
      return { kind: 'invalid', value: target };
    }

    const [address] = target.split('/');
    if (!isValidIpv4Address(address)) {
      return { kind: 'invalid', value: target };
    }

    return { kind: 'cidr', value: target };
  }

  if (isValidIpv4Address(target)) {
    return { kind: 'ip', value: target };
  }

  return { kind: 'invalid', value: target };
}

function runNmapScan({ target, targetKind, outputFilePath }) {
  return new Promise((resolve, reject) => {
    const scanFlags = targetKind === 'cidr'
      ? [...nmapScanFlags, '--open']
      : [...nmapScanFlags];
    const nmapProcess = spawn('nmap', [...scanFlags, '-oX', outputFilePath, target]);
    let stderr = '';

    nmapProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    nmapProcess.on('error', (error) => {
      reject(error);
    });

    nmapProcess.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(stderr.trim() || `nmap exited with code ${code}`);
        reject(error);
        return;
      }

      resolve();
    });
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/network-map', async (req, res) => {
  try {
    const parsed = await parseScanDirectory(scanDir);
    const graph = buildGraph(parsed.hosts);

    res.json({
      scanDirectory: scanDirectoryPath,
      defaultSubnet,
      hosts: parsed.hosts,
      edges: parsed.edges,
      graph
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to parse scan data',
      details: error.message
    });
  }
});

app.post('/api/run-scan', async (req, res) => {
  const requestedTarget = (req.body?.subnet || defaultSubnet).trim();
  const scanTarget = classifyScanTarget(requestedTarget);

  if (scanTarget.kind === 'invalid') {
    res.status(400).json({ error: 'Invalid target format. Enter CIDR notation (192.168.1.0/24) or a single IPv4 address.' });
    return;
  }

  const outputFileName = `scan-${Date.now()}.xml`;
  const outputFilePath = path.join(scanDirectoryPath, outputFileName);

  try {
    await fs.mkdir(scanDirectoryPath, { recursive: true });
    await runNmapScan({
      target: scanTarget.value,
      targetKind: scanTarget.kind,
      outputFilePath
    });

    res.json({
      message: 'Scan completed successfully',
      target: scanTarget.value,
      targetType: scanTarget.kind,
      outputFile: outputFileName
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to run nmap scan',
      details: error.message
    });
  }
});

app.get('/api/scan-files/:fileName', async (req, res) => {
  const requestedFileName = path.basename(req.params.fileName);
  const fullPath = path.join(scanDirectoryPath, requestedFileName);

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      res.status(404).json({ error: 'Scan file not found' });
      return;
    }

    res.sendFile(fullPath);
  } catch (error) {
    res.status(404).json({ error: 'Scan file not found' });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Atlas server listening on http://localhost:${port}`);
});
