/**
 * Currency conversion service tests.
 * Uses an injected Frankfurter stub — no network and no Oracle table.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { convertCurrency, createCurrencyService, getExchangeRate } from '../services/currency.service.js';
import {
  CurrencyProviderError,
  CurrencyValidationError,
  ExchangeRateNotFoundError,
} from '../errors/currency.errors.js';
import { fetchPairRate } from '../clients/frankfurter.client.js';
import { parseConvertBody } from '../validators/currency.validator.js';
import { multiply, parseDecimal, toPlainString, toNumber } from '../utils/currencyDecimal.js';

function stubFrankfurter({ rate = 904.96, date = '2026-08-14', calls } = {}) {
  return async ({ fromCurrency, toCurrency, conversionDate }) => {
    if (calls) {
      calls.push({ fromCurrency, toCurrency, conversionDate });
    }
    if (rate == null) {
      return { date, rate: null };
    }
    return { base: fromCurrency, quote: toCurrency, date, rate };
  };
}

test('decimal helper does not use IEEE-754 drift for 0.1 * 0.2', () => {
  const product = multiply(parseDecimal('0.1'), parseDecimal('0.2'));
  assert.equal(toPlainString(product), '0.02');
});

test('KWD → PKR multiplies amount by the provider rate', async () => {
  const result = await convertCurrency(
    {
      amount: 1,
      fromCurrency: 'KWD',
      toCurrency: 'PKR',
      conversionDate: '2026-08-16',
    },
    stubFrankfurter({ rate: 904.96, date: '2026-08-14' })
  );
  assert.equal(result.exchange_rate, 904.96);
  assert.equal(result.converted_amount, 904.96);
  assert.equal(result.rate_source, 'FRANKFURTER');
  assert.equal(result.rate_effective_date, '2026-08-14');
  assert.equal(result.conversion_date, '2026-08-16');
  assert.equal(result.from_currency, 'KWD');
  assert.equal(result.to_currency, 'PKR');
  assert.equal('rate_type' in result, false);
});

test('converted amount rounds to the destination currency minor units', async () => {
  const result = await convertCurrency(
    {
      amount: 5000,
      fromCurrency: 'USD',
      toCurrency: 'KWD',
      conversionDate: '2026-08-23',
    },
    stubFrankfurter({ rate: 0.3075, date: '2026-08-22' })
  );
  assert.equal(result.converted_amount, 1537.5);
});

test('same currency returns rate 1 without calling the provider', async () => {
  const calls = [];
  const result = await convertCurrency(
    {
      amount: 5000,
      fromCurrency: 'USD',
      toCurrency: 'USD',
      conversionDate: '2026-08-23',
    },
    stubFrankfurter({ calls })
  );
  assert.equal(calls.length, 0);
  assert.equal(result.exchange_rate, 1);
  assert.equal(result.converted_amount, 5000);
  assert.equal(result.rate_source, 'SAME_CURRENCY');
  assert.equal(result.rate_effective_date, '2026-08-23');
});

test('missing provider rate returns EXCHANGE_RATE_NOT_FOUND', async () => {
  await assert.rejects(
    () =>
      convertCurrency(
        {
          amount: 100,
          fromCurrency: 'USD',
          toCurrency: 'JPY',
          conversionDate: '2026-08-23',
        },
        stubFrankfurter({ rate: null })
      ),
    (err) => {
      assert.equal(err instanceof ExchangeRateNotFoundError, true);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'EXCHANGE_RATE_NOT_FOUND');
      return true;
    }
  );
});

test('provider HTTP failure is EXCHANGE_RATE_PROVIDER_ERROR', async () => {
  await assert.rejects(
    () =>
      convertCurrency(
        {
          amount: 1,
          fromCurrency: 'KWD',
          toCurrency: 'PKR',
          conversionDate: '2026-08-16',
        },
        async () => {
          throw new CurrencyProviderError('KWD', 'PKR');
        }
      ),
    (err) => {
      assert.equal(err instanceof CurrencyProviderError, true);
      assert.equal(err.statusCode, 502);
      assert.equal(err.code, 'EXCHANGE_RATE_PROVIDER_ERROR');
      return true;
    }
  );
});

test('zero amount converts to zero', async () => {
  const result = await convertCurrency(
    {
      amount: 0,
      fromCurrency: 'KWD',
      toCurrency: 'PKR',
      conversionDate: '2026-08-16',
    },
    stubFrankfurter({ rate: 904.96, date: '2026-08-14' })
  );
  assert.equal(result.original_amount, 0);
  assert.equal(result.converted_amount, 0);
});

test('negative amount is rejected by the validator', () => {
  assert.throws(
    () => parseConvertBody({ amount: -10, from_currency: 'KWD', to_currency: 'PKR' }),
    CurrencyValidationError
  );
});

test('invalid currency code is rejected', () => {
  assert.throws(
    () => parseConvertBody({ amount: 10, from_currency: 'KW', to_currency: 'PKR' }),
    CurrencyValidationError
  );
});

test('missing conversion_date defaults to today and rate_type is ignored', () => {
  const parsed = parseConvertBody({
    amount: 10,
    from_currency: 'kwd',
    to_currency: 'pkr',
    rate_type: 'CORPORATE',
  });
  assert.match(parsed.conversionDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(parsed.fromCurrency, 'KWD');
  assert.equal(parsed.toCurrency, 'PKR');
  assert.equal('rateType' in parsed, false);
});

test('missing amount/from/to returns the combined required message', () => {
  assert.throws(
    () => parseConvertBody({}),
    (err) => {
      assert.equal(err.message, 'amount, from_currency and to_currency are required');
      return true;
    }
  );
});

test('getExchangeRate returns SAME_CURRENCY for identity pairs', async () => {
  const data = await getExchangeRate('KWD', 'KWD', '2026-08-16', stubFrankfurter());
  assert.equal(data.source, 'SAME_CURRENCY');
  assert.equal(toNumber(data.exchangeRate), 1);
});

test('createCurrencyService injects a provider for other HR modules', async () => {
  const service = createCurrencyService(stubFrankfurter({ rate: 904.96, date: '2026-08-14' }));
  const result = await service.convertCurrency({
    amount: 1,
    fromCurrency: 'KWD',
    toCurrency: 'PKR',
    conversionDate: '2026-08-16',
  });
  assert.equal(result.converted_amount, 904.96);
  assert.equal(result.rate_source, 'FRANKFURTER');
});

test('malformed provider rate is EXCHANGE_RATE_PROVIDER_ERROR', async () => {
  await assert.rejects(
    () =>
      convertCurrency(
        {
          amount: 1,
          fromCurrency: 'KWD',
          toCurrency: 'PKR',
          conversionDate: '2026-08-16',
        },
        async () => ({ date: '2026-08-14', rate: 'not-a-rate' })
      ),
    (err) => {
      assert.equal(err instanceof CurrencyProviderError, true);
      assert.equal(err.statusCode, 502);
      assert.equal(err.code, 'EXCHANGE_RATE_PROVIDER_ERROR');
      return true;
    }
  );
});

test('null convert body is treated as missing required fields', () => {
  assert.throws(
    () => parseConvertBody(null),
    (err) => {
      assert.equal(err instanceof CurrencyValidationError, true);
      assert.equal(err.message, 'amount, from_currency and to_currency are required');
      return true;
    }
  );
});

test('impossible calendar date is rejected', () => {
  assert.throws(
    () =>
      parseConvertBody({
        amount: 1,
        from_currency: 'KWD',
        to_currency: 'PKR',
        conversion_date: '2026-02-31',
      }),
    CurrencyValidationError
  );
});

test('Frankfurter HTTP failure is EXCHANGE_RATE_PROVIDER_ERROR', async () => {
  await assert.rejects(
    () =>
      fetchPairRate(
        { fromCurrency: 'KWD', toCurrency: 'PKR', conversionDate: '2026-08-16' },
        async () => ({
          ok: false,
          status: 503,
          text: async () => 'unavailable',
        })
      ),
    (err) => {
      assert.equal(err instanceof CurrencyProviderError, true);
      assert.equal(err.statusCode, 502);
      return true;
    }
  );
});
