import assert from 'assert';
import { mapRowToFullDetailsShape } from './employeeController.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('Employee full-details mapping (workLocationObj)\n');

runTest('when WORK_LOCATION_OBJ is present, assignment includes workLocationObj with lookupId and lookupCode', () => {
  const row = {
    WORK_LOCATION_OBJ: JSON.stringify({ lookupId: 42, lookupCode: 'HQ', lookupNameEn: 'Headquarters' })
  };
  const data = mapRowToFullDetailsShape(row);
  assert.strictEqual(data.assignment.hasOwnProperty('workLocationObj'), true, 'assignment must include workLocationObj');
  assert.strictEqual(data.assignment.workLocationObj != null, true, 'workLocationObj must be non-null when present');
  assert.strictEqual(data.assignment.workLocationObj.lookupId, 42, 'workLocationObj.lookupId must match');
  assert.strictEqual(data.assignment.workLocationObj.lookupCode, 'HQ', 'workLocationObj.lookupCode must match');
});

runTest('when WORK_LOCATION_OBJ is null, assignment includes workLocationObj: null', () => {
  const row = { WORK_LOCATION_OBJ: null };
  const data = mapRowToFullDetailsShape(row);
  assert.strictEqual(data.assignment.hasOwnProperty('workLocationObj'), true, 'assignment must include workLocationObj');
  assert.strictEqual(data.assignment.workLocationObj, null, 'workLocationObj must be null when WORK_LOCATION_OBJ is null');
});

runTest('when work_location_obj (snake_case) is present, assignment includes parsed workLocationObj', () => {
  const row = { work_location_obj: '{"lookupId":1,"lookupCode":"REMOTE"}' };
  const data = mapRowToFullDetailsShape(row);
  assert.strictEqual(data.assignment.workLocationObj != null, true);
  assert.strictEqual(data.assignment.workLocationObj.lookupId, 1);
  assert.strictEqual(data.assignment.workLocationObj.lookupCode, 'REMOTE');
});

console.log('\nAll tests passed.');
