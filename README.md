# Founderos Core

APS-constrained control plane. Greenfield build in progress.

## Live Endpoints
- GET /api/founderos/health — public, no auth
- GET /api/founderos/capabilities — requires x-founderos-key header

## Status
- v0.1.0 — seed deployment
- Legacy code preserved in /legacy

## Architecture
- Pre-commitment: AI proposes (GPT 5.4 Thinking via Custom GPT)
- Commitment: API executes exact frozen operations after human authorization
- Witness: Append-only event log
