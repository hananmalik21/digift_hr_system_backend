import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurrencyByCodeQuery,
  buildCurrenciesListQuery,
  mapCurrencyRows,
  mapDecimalPlaces,
  normalizeCurrencySearch
} from '../utils/currenciesQuery.js';
import {
  sendCurrenciesList,
  sendCurrenciesServerError
} from '../view/currenciesView.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('normalizeCurrencySearch trims, blanks to null, and caps length', () => {
  assert.equal(normalizeCurrencySearch(undefined), null);
  assert.equal(normalizeCurrencySearch('  '), null);
  assert.equal(normalizeCurrencySearch(' Kuwait '), 'Kuwait');
  assert.equal(normalizeCurrencySearch('x'.repeat(120)).length, 100);
});

test('mapDecimalPlaces preserves null and zero; coerces finite numbers', () => {
  assert.equal(mapDecimalPlaces(null), null);
  assert.equal(mapDecimalPlaces(undefined), null);
  assert.equal(mapDecimalPlaces(''), null);
  assert.equal(mapDecimalPlaces(0), 0);
  assert.equal(mapDecimalPlaces(2), 2);
  assert.equal(mapDecimalPlaces('3'), 3);
  assert.equal(mapDecimalPlaces(Number.NaN), null);
});

test('buildCurrenciesListQuery selects code+name+decimal_places and orders by name then code', () => {
  const { sql, binds } = buildCurrenciesListQuery();
  assert.equal(
    sql,
    'SELECT CURRENCY_CODE, CURRENCY_NAME, DECIMAL_PLACES FROM ENT.CURRENCIES ORDER BY CURRENCY_NAME, CURRENCY_CODE'
  );
  assert.deepEqual(binds, {});
});

test('buildCurrenciesListQuery searches code and name with :search bind only', () => {
  const { sql, binds } = buildCurrenciesListQuery({ search: 'Kuwait' });
  assert.match(
    sql,
    /WHERE \(UPPER\(CURRENCY_CODE\) LIKE '%' \|\| UPPER\(:search\) \|\| '%' OR UPPER\(CURRENCY_NAME\) LIKE '%' \|\| UPPER\(:search\) \|\| '%'\)/
  );
  assert.match(sql, /ORDER BY CURRENCY_NAME, CURRENCY_CODE/);
  assert.match(sql, /DECIMAL_PLACES/);
  assert.deepEqual(binds, { search: 'Kuwait' });
  assert.doesNotMatch(sql, /Kuwait/);
});

test('buildCurrencyByCodeQuery uses exact code bind', () => {
  const { sql, binds } = buildCurrencyByCodeQuery('kwd');
  assert.equal(
    sql,
    'SELECT CURRENCY_CODE, CURRENCY_NAME, DECIMAL_PLACES FROM ENT.CURRENCIES WHERE UPPER(CURRENCY_CODE) = UPPER(:currency_code)'
  );
  assert.deepEqual(binds, { currency_code: 'KWD' });
});

test('mapCurrencyRows shapes payload including decimal_places and empty input', () => {
  assert.deepEqual(mapCurrencyRows(null), []);
  assert.deepEqual(
    mapCurrencyRows([
      {
        currency_code: 'KWD',
        currency_name: 'Kuwaiti Dinar',
        decimal_places: 3,
        extra: 1
      }
    ]),
    [
      {
        currency_code: 'KWD',
        currency_name: 'Kuwaiti Dinar',
        decimal_places: 3
      }
    ]
  );
  assert.deepEqual(
    mapCurrencyRows([
      { currency_code: 'JPY', currency_name: 'Yen', decimal_places: 0 }
    ]),
    [{ currency_code: 'JPY', currency_name: 'Yen', decimal_places: 0 }]
  );
  assert.deepEqual(
    mapCurrencyRows([
      { currency_code: 'XXX', currency_name: 'No precision', decimal_places: null }
    ]),
    [
      {
        currency_code: 'XXX',
        currency_name: 'No precision',
        decimal_places: null
      }
    ]
  );
  assert.deepEqual(mapCurrencyRows([{}]), [
    { currency_code: null, currency_name: null, decimal_places: null }
  ]);
});

test('sendCurrenciesList returns success envelope', () => {
  const res = mockRes();
  const row = {
    currency_code: 'AED',
    currency_name: 'UAE Dirham',
    decimal_places: 2
  };
  sendCurrenciesList(res, [row]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, data: [row] });

  sendCurrenciesList(res, null);
  assert.deepEqual(res.body, { success: true, data: [] });
});

test('sendCurrenciesServerError hides Oracle details', (t) => {
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  const res = mockRes();
  sendCurrenciesServerError(res, new Error('ORA-00942: table or view does not exist'));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Failed to retrieve currencies'
  });
  assert.equal(res.body.error_details, undefined);
});
