# @edgefinder/openclaw-plugin

OpenClaw plugin that bundles the EdgeFinder skill for NFL, NBA, and MLB analysis.

## Install

Local path:

```bash
openclaw plugins install /absolute/path/to/openclaw-plugin
```

From npm after publication:

```bash
openclaw plugins install @edgefinder/openclaw-plugin
```

Restart the OpenClaw gateway after install.

## What it provides

- The `edgefinder-cli` skill for NFL, NBA, and MLB analysis
- A wrapper script that uses the local `edgefinder` binary when available
- Fallback to `npx -y @edgefinder/cli`

## Authentication

The bundled skill supports:

- `edgefinder login`
- `EDGEFINDER_API_KEY=ef_live_...`
- EdgeFinder CLI config stored in `~/.edgefinder/config.json`
