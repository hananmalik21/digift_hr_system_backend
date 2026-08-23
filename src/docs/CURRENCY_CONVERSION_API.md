# Currency Conversion API

Converts an amount using **live/historical rates from [Frankfurter](https://frankfurter.dev/)** (central-bank data, no API key). Digify does not store a currency-rates table.

```
Flutter
   ↓
POST /api/currency/convert
   ↓
Frankfurter (global FX)
   ↓
amount × rate
   ↓
Return result
```

```js
import { convertCurrency } from '../../src/services/currency.service.js';

const result = await convertCurrency({
  amount: 1,
  fromCurrency: 'KWD',
  toCurrency: 'PKR',
  conversionDate: '2026-08-16',
});
```

Payroll, compensation, job offers, expenses, and reports should reuse this service. If a payroll result is finalized, **save the returned `exchange_rate` on that transaction** so a later rerun is not affected if the provider revises history.

## Endpoint

```http
POST http://localhost:3000/api/currency/convert
Authorization: Bearer <token>
Content-Type: application/json
```

`conversion_date` is optional (defaults to today). Frankfurter returns the latest published rate on or before that date. Weekends typically resolve to the previous business day (for example `2026-08-16` is a Sunday, so the effective date may be `2026-08-14`).

`rate_type` is not used. A global provider has no Digify `CORPORATE` rate.

## Request

```json
{
  "amount": 1,
  "from_currency": "KWD",
  "to_currency": "PKR",
  "conversion_date": "2026-08-16"
}
```

## Response `200`

```json
{
  "success": true,
  "data": {
    "original_amount": 1,
    "from_currency": "KWD",
    "to_currency": "PKR",
    "exchange_rate": 904.96,
    "converted_amount": 904.96,
    "conversion_date": "2026-08-16",
    "rate_effective_date": "2026-08-14",
    "rate_source": "FRANKFURTER"
  }
}
```

Same-currency conversions return `rate_source: "SAME_CURRENCY"` and `exchange_rate: 1` without calling Frankfurter.

Converted amounts are rounded to the destination currency's ISO minor units (KWD = 3, PKR = 2).

## Errors

- **400** `VALIDATION_ERROR` — missing/invalid amount or currency
- **404** `EXCHANGE_RATE_NOT_FOUND` — provider returned no rate
- **502** `EXCHANGE_RATE_PROVIDER_ERROR` — Frankfurter unreachable or HTTP error

Optional env: `CURRENCY_FX_API_BASE=https://api.frankfurter.dev`
