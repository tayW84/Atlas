const path = require('node:path');
const express = require('express');
const { parseScanDirectory } = require('./parser/nmapParser');
const { buildGraph } = require('./graph/buildGraph');

const app = express();
const port = process.env.PORT || 3000;
const scanDir = process.env.NMAP_SCAN_DIR || './scans';

app.use(express.static(path.resolve(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/network-map', async (req, res) => {
  try {
    const parsed = await parseScanDirectory(scanDir);
    const graph = buildGraph(parsed.hosts);

    res.json({
      scanDirectory: path.resolve(scanDir),
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

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Atlas server listening on http://localhost:${port}`);
});
