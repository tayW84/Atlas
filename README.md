# Atlas Network Map

Atlas is a lightweight Node.js app that parses Nmap scan outputs and visualizes discovered hosts/services in a browser-based topology graph.

## Features

- Parses Nmap XML (`-oX`) files first, then falls back to plain text parsing.
- Normalizes hosts into `{ id, ip, hostname, domain, ports[] }` objects when available.
- Builds a graph with host nodes and shared domain hub nodes (falls back to `/24` subnet hubs).
- Serves graph data over JSON APIs and renders with Cytoscape.js.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start in development mode (watch enabled):

   ```bash
   npm run dev
   ```

3. Or run production mode:

   ```bash
   npm start
   ```

4. Open http://localhost:3000.

## Configuring scan input

By default, the app reads scans from `./scans`.

Set `NMAP_SCAN_DIR` to use a different directory:

```bash
NMAP_SCAN_DIR=/path/to/scans npm start
```

## Nmap command examples

Write XML scan output:

```bash
nmap -sV -oX scans/scan1.xml 192.168.1.0/24
```

Write standard text output:

```bash
nmap -sV -oN scans/scan1.txt 192.168.1.0/24
```

You can place multiple files in the scan directory; results are merged by host IP.

## API endpoints

- `GET /api/health` → `{ status: "ok" }`
- `GET /api/network-map` → scan metadata, normalized hosts, and graph nodes/edges

## Supported formats and limitations

- **Supported**:
  - Nmap XML (`-oX`) including service/version fields when available.
  - Nmap normal text output (`-oN`) with `PORT STATE SERVICE VERSION` table parsing.
- **Limitations**:
  - Only IPv4 host extraction is currently normalized.
  - Edge inference is topology-based (shared domain grouping, with `/24` fallback), not traffic/flow-based.
  - Text parser focuses on common Nmap output patterns and may skip unusual layouts.

## Testing

Run parser and graph validation tests:

```bash
npm test
```
