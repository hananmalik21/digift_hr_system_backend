import {
  FRANKFURTER_RATE_SOURCE,
  getCurrencyMinorUnits,
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

function formatRate(decimal) {
  return toNumber(roundHalfUp(decimal, RATE_DISPLAY_SCALE));
}

function formatAmount(decimal, currencyCode) {
  return toNumber(roundHalfUp(decimal, getCurrencyMinorUnits(currencyCode)));
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
 */
export async function convertCurrency(
  { amount, fromCurrency, toCurrency, conversionDate },
  fetchPair = defaultFetchPair
) {
  const amountDecimal = parseDecimal(amount);
  const rateData = await getExchangeRate(fromCurrency, toCurrency, conversionDate, fetchPair);
  const convertedDecimal =
    rateData.source === SAME_CURRENCY_SOURCE
      ? amountDecimal
      : multiply(amountDecimal, rateData.exchangeRate);

  return {
    original_amount: toNumber(amountDecimal),
    from_currency: fromCurrency,
    to_currency: toCurrency,
    exchange_rate: formatRate(rateData.exchangeRate),
    converted_amount: formatAmount(convertedDecimal, toCurrency),
    conversion_date: conversionDate,
    rate_effective_date: rateData.effectiveDate,
    rate_source: rateData.source,
  };
}

export function createCurrencyService(fetchPair) {
  return {
    getExchangeRate: (fromCurrency, toCurrency, conversionDate) =>
      getExchangeRate(fromCurrency, toCurrency, conversionDate, fetchPair),
    convertCurrency: (params) => convertCurrency(params, fetchPair),
  };
}
