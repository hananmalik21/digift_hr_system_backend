import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIST_ACTIVE_LOCATIONS_SQL,
  mapLocationRows
} from '../utils/locationsQuery.js';
import {
  sendLocationsList,
  sendLocationsServerError
} from '../view/locationsView.js';

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

test('LIST_ACTIVE_LOCATIONS_SQL reads ENT.V_LOCATIONS active rows ordered by name', () => {
  assert.match(LIST_ACTIVE_LOCATIONS_SQL, /FROM ENT\.V_LOCATIONS/);
  assert.match(LIST_ACTIVE_LOCATIONS_SQL, /ACTIVE_FLAG = 'Y'/);
  assert.match(LIST_ACTIVE_LOCATIONS_SQL, /ORDER BY LOCATION_NAME/);
  assert.match(LIST_ACTIVE_LOCATIONS_SQL, /LOCATION_ID/);
  assert.match(LIST_ACTIVE_LOCATIONS_SQL, /COUNTRY_CODE/);
  assert.match(LIST_ACTIVE_LOCATIONS_SQL, /LOCATION_NAME/);
  assert.doesNotMatch(LIST_ACTIVE_LOCATIONS_SQL, /INSERT|UPDATE|DELETE/i);
});

test('mapLocationRows shapes payload and empty input', () => {
  assert.deepEqual(mapLocationRows(null), []);
  assert.deepEqual(mapLocationRows([]), []);
  assert.deepEqual(
    mapLocationRows([
      {
        LOCATION_ID: 1,
        COUNTRY_CODE: 'KW',
        LOCATION_NAME: 'Kuwait',
        extra: true
      },
      {
        location_id: '2',
        country_code: 'PK',
        location_name: 'Pakistan'
      }
    ]),
    [
      { location_id: 1, country_code: 'KW', location_name: 'Kuwait' },
      { location_id: 2, country_code: 'PK', location_name: 'Pakistan' }
    ]
  );
  assert.deepEqual(mapLocationRows([{}]), [
    { location_id: null, country_code: null, location_name: null }
  ]);
});

test('sendLocationsList returns success envelope', () => {
  const res = mockRes();
  const row = { location_id: 1, country_code: 'KW', location_name: 'Kuwait' };
  sendLocationsList(res, [row]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, data: [row] });

  sendLocationsList(res, null);
  assert.deepEqual(res.body, { success: true, data: [] });
});

test('sendLocationsServerError hides Oracle details', (t) => {
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  const res = mockRes();
  sendLocationsServerError(res, new Error('ORA-00942: table or view does not exist'));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Failed to retrieve locations'
  });
  assert.equal(res.body.error_details, undefined);
});
