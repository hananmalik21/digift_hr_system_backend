import {
  FRANKFURTER_RATE_SOURCE,
  RATE_DISPLAY_SCALE,
  SAME_CURRENCY_SOURCE,
} from '../constants/currency.constants.js';
import { fetchPairRate as defaultFetchPair } from '../clients/frankfurter.client.js';
import { CurrencyProviderError, ExchangeRateNotFoundError } from '../errors/currency.errors.js';
import {
  isPositive,
  multiply,
  parseDecimal,
  roundHalfUp,
  toNumber,
} from '../utils/currencyDecimal.js';
import CurrenciesModel from '../../feature/enterprise_structure/currencies/model/currenciesModel.js';

function formatRate(decimal) {
  return toNumber(roundHalfUp(decimal, RATE_DISPLAY_SCALE));
}

/**
 * Format a monetary amount using ENT.CURRENCIES.decimal_places.
 * When decimal_places is null, do not assume a default precision (e.g. 2).
 * @param {{ units: bigint, scale: number }} decimal
 * @param {number|null|undefined} decimalPlaces
 */
function formatAmount(decimal, decimalPlaces) {
  if (decimalPlaces == null) {
    return toNumber(decimal);
  }
  return toNumber(roundHalfUp(decimal, decimalPlaces));
}

async function defaultResolveDecimalPlaces(currencyCode) {
  return CurrenciesModel.getDecimalPlaces(currencyCode);
}

function parseProviderRate(rate, fromCurrency, toCurrency, conversionDate) {
  if (rate == null || rate === '') {
    throw new ExchangeRateNotFoundError(fromCurrency, toCurrency, conversionDate);
  }

  let exchangeRate;
  try {
    exchangeRate = parseDecimal(rate);
  } catch {
    throw new CurrencyProviderError(fromCurrency, toCurrency);
  }

  if (!isPositive(exchangeRate)) {
    throw new ExchangeRateNotFoundError(fromCurrency, toCurrency, conversionDate);
  }

  return exchangeRate;
}

/**
 * Frankfurter rate, or 1 when both currencies are the same.
 */
export async function getExchangeRate(
  fromCurrency,
  toCurrency,
  conversionDate = null,
  fetchPair = defaultFetchPair
) {
  if (fromCurrency === toCurrency) {
    return {
      exchangeRate: parseDecimal('1'),
      effectiveDate: conversionDate,
      source: SAME_CURRENCY_SOURCE,
    };
  }

  const data = await fetchPair({ fromCurrency, toCurrency, conversionDate });
  return {
    exchangeRate: parseProviderRate(data?.rate, fromCurrency, toCurrency, conversionDate),
    effectiveDate: data?.date || conversionDate,
    source: FRANKFURTER_RATE_SOURCE,
  };
}

/**
 * Shared conversion used by Payroll, Compensation, Job Offers, Expenses, and reports.
 * Persist `exchange_rate` on finalized payroll so later provider revisions do not change history.
 * Rounding uses `decimal_places` from ENT.CURRENCIES (source of truth).
 *
 * @param {{ amount: number|string, fromCurrency: string, toCurrency: string, conversionDate?: string|null }} params
 * @param {typeof defaultFetchPair} [fetchPair]
 * @param {(code: string) => Promise<number|null>} [resolveDecimalPlaces]
 */
export async function convertCurrency(
  { amount, fromCurrency, toCurrency, conversionDate },
  fetchPair = defaultFetchPair,
  resolveDecimalPlaces = defaultResolveDecimalPlaces
) {
  const amountDecimal = parseDecimal(amount);
  const rateData = await getExchangeRate(fromCurrency, toCurrency, conversionDate, fetchPair);
  const convertedDecimal =
    rateData.source === SAME_CURRENCY_SOURCE
      ? amountDecimal
      : multiply(amountDecimal, rateData.exchangeRate);

  const decimalPlaces = await resolveDecimalPlaces(toCurrency);

  return {
    original_amount: toNumber(amountDecimal),
    from_currency: fromCurrency,
    to_currency: toCurrency,
    exchange_rate: formatRate(rateData.exchangeRate),
    converted_amount: formatAmount(convertedDecimal, decimalPlaces),
    conversion_date: conversionDate,
    rate_effective_date: rateData.effectiveDate,
    rate_source: rateData.source,
  };
}

export function createCurrencyService(fetchPair, resolveDecimalPlaces = defaultResolveDecimalPlaces) {
  return {
    getExchangeRate: (fromCurrency, toCurrency, conversionDate) =>
      getExchangeRate(fromCurrency, toCurrency, conversionDate, fetchPair),
    convertCurrency: (params) => convertCurrency(params, fetchPair, resolveDecimalPlaces),
  };
}
