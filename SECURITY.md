# Security Policy

## Reporting Vulnerabilities

Please report suspected vulnerabilities through GitHub private vulnerability
reporting for this repository:

https://github.com/andrewnexys/edgefinder-cli/security/advisories/new

If you cannot use GitHub, email support@edgefinder.io with a concise
description, affected version, reproduction steps, and any relevant logs.
Do not open a public issue for a suspected vulnerability.

## Supported Versions

Security fixes are released for the latest published version of
`@edgefinder/cli`.

## Credential Handling

The CLI accepts API keys through `EDGEFINDER_API_KEY` or stores them locally in:

```text
~/.edgefinder/config.json
```

When the CLI writes this file, it sets file permissions to `0600` so only the
current user can read it on Unix-like systems. Use `edgefinder logout` to remove
the saved API key.

For hosted MCP integrations, prefer sending API keys in an `Authorization:
Bearer ...` header. Query-string API keys are supported only for connector UIs
that cannot set headers, because URLs may be captured in browser history,
proxies, or logs.

## Dependency and Code Scanning

This repository uses GitHub security features for dependency tracking, secret
scanning, push protection, and CodeQL analysis. Dependabot is configured to open
dependency update pull requests for the CLI package and OpenClaw plugin package.
