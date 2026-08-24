import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurrenciesListQuery,
  mapCurrencyRows,
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
  assert.equal(normalizeCurrencySearch(' kw '), 'kw');
  assert.equal(normalizeCurrencySearch('x'.repeat(40)).length, 32);
});

test('buildCurrenciesListQuery orders without WHERE when no search', () => {
  const { sql, binds } = buildCurrenciesListQuery();
  assert.equal(sql, 'SELECT CURRENCY_CODE FROM ENT.CURRENCIES ORDER BY CURRENCY_CODE');
  assert.deepEqual(binds, {});
});

test('buildCurrenciesListQuery uses :search bind only', () => {
  const { sql, binds } = buildCurrenciesListQuery({ search: 'KW' });
  assert.match(sql, /LIKE '%' \|\| UPPER\(:search\) \|\| '%'/);
  assert.deepEqual(binds, { search: 'KW' });
  assert.doesNotMatch(sql, /KW/);
});

test('mapCurrencyRows shapes payload and empty input', () => {
  assert.deepEqual(mapCurrencyRows(null), []);
  assert.deepEqual(mapCurrencyRows([{ currency_code: 'USD', extra: 1 }]), [
    { currency_code: 'USD' }
  ]);
});

test('sendCurrenciesList returns success envelope', () => {
  const res = mockRes();
  sendCurrenciesList(res, [{ currency_code: 'AED' }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [{ currency_code: 'AED' }]
  });

  sendCurrenciesList(res, null);
  assert.deepEqual(res.body, { success: true, data: [] });
});

test('sendCurrenciesServerError hides Oracle details', () => {
  const res = mockRes();
  sendCurrenciesServerError(res, new Error('ORA-00942: table or view does not exist'));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Failed to retrieve currencies'
  });
  assert.equal(res.body.error_details, undefined);
});
