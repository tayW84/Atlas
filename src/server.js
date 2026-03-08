const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { parseScanDirectory } = require('./parser/nmapParser');
const { buildGraph } = require('./graph/buildGraph');

const app = express();
const port = process.env.PORT || 3000;
const scanDir = process.env.NMAP_SCAN_DIR || './scans';
const scanDirectoryPath = path.resolve(scanDir);

app.use(express.static(path.resolve(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/network-map', async (req, res) => {
  try {
    const parsed = await parseScanDirectory(scanDir);
    const graph = buildGraph(parsed.hosts);

    res.json({
      scanDirectory: scanDirectoryPath,
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
