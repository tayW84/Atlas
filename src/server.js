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

function validateSubnet(subnet) {
  const subnetPattern = /^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
  if (!subnetPattern.test(subnet)) {
    return false;
  }

  const [address] = subnet.split('/');
  const octets = address.split('.').map(Number);

  return octets.every((octet) => octet >= 0 && octet <= 255);
}

function runNmapScan({ subnet, outputFilePath }) {
  return new Promise((resolve, reject) => {
    const nmapProcess = spawn('nmap', [...nmapScanFlags, '-oX', outputFilePath, subnet]);
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
  const requestedSubnet = (req.body?.subnet || defaultSubnet).trim();

  if (!validateSubnet(requestedSubnet)) {
    res.status(400).json({ error: 'Invalid subnet format. Expected CIDR notation like 192.168.1.0/24.' });
    return;
  }

  const outputFileName = `scan-${Date.now()}.xml`;
  const outputFilePath = path.join(scanDirectoryPath, outputFileName);

  try {
    await fs.mkdir(scanDirectoryPath, { recursive: true });
    await runNmapScan({ subnet: requestedSubnet, outputFilePath });

    res.json({
      message: 'Scan completed successfully',
      subnet: requestedSubnet,
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
