# Digify ERP

Node.js (ESM) Express 5 backend for Digify HR. Flutter clients call this API. Business domains live under `feature/`. Oracle holds most business logic; this process is transport, validation, and orchestration.

GRC (`/api/grc/*`) is served by the private npm package `digify-hr-grc-backend`, not by local feature code.

## Setup

```bash
cp .env.example .env
# Fill Oracle, JWT, and integration values.
# Place the Oracle wallet in ./Wallet (cwallet.sso). Do not commit it.
npm ci
npm start
```

`GET /health` should return `{ "status": true, ... }`. Default port is `3000`.

## Production

- Do not commit `.env`, `Wallet/`, `TESTDB/`, or credential JSON.
- Docker Compose mounts `./Wallet` and Firebase credentials at runtime.
- Deploy: `bash ./deploy.sh` (requires `.env`, `Wallet/cwallet.sso`, and `firebase-service-account.json` on the host).

See `docs/CODEBASE_ARCHITECTURE.md` for modules and route prefixes.
