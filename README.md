# Digify ERP Starter

Lightweight Node/Express skeleton focused on the requested `feature > companies > model|view|controller` structure.

## Project Layout

- `feature/companies/model`: domain logic and fake data store for the Companies domain.
- `feature/companies/view`: presentation helpers that format responses consistently.
- `feature/companies/controller`: Express routes that glue the model and view layers together.
- `index.js`: Express app entry point that wires the companies controller under `/api/companies` and boots the Oracle pool.

## Getting Started

```bash
npm install
npm run dev    # or `npm start` in production
```

After startup, the API endpoints are:

- `GET /api/companies` — list seeded companies
- `GET /api/companies/:id` — fetch a single company
- `POST /api/companies` — register a company (body: `{ name, industry?, employees? }`)

