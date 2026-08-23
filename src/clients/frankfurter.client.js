import { CurrencyProviderError } from '../errors/currency.errors.js';

const DEFAULT_FX_API_BASE = 'https://api.frankfurter.dev';
const REQUEST_TIMEOUT_MS = 8000;

function getFxApiBase() {
  return String(process.env.CURRENCY_FX_API_BASE || DEFAULT_FX_API_BASE).replace(/\/$/, '');
}

function truncate(value, max = 200) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function fail(fromCurrency, toCurrency, cause) {
  if (cause) {
    console.error('[currency] Frankfurter error:', truncate(cause));
  }
  throw new CurrencyProviderError(fromCurrency, toCurrency);
}

/**
 * Current or historical rate for one pair.
 * @see https://api.frankfurter.dev/v2/rate/KWD/PKR?date=2026-08-16
 */
export async function fetchPairRate(
  { fromCurrency, toCurrency, conversionDate },
  httpFetch = fetch
) {
  const url = new URL(
    `${getFxApiBase()}/v2/rate/${encodeURIComponent(fromCurrency)}/${encodeURIComponent(toCurrency)}`
  );
  if (conversionDate) {
    url.searchParams.set('date', conversionDate);
  }

  let response;
  try {
    response = await httpFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    fail(fromCurrency, toCurrency, err?.message || err);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    fail(fromCurrency, toCurrency, `${response.status} ${errorBody}`.trim());
  }

  try {
    return await response.json();
  } catch (err) {
    fail(fromCurrency, toCurrency, err?.message || err);
  }
}
