import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdvancedComponentFlags,
  normalizePlanComponentForGetResponse,
  collectComponentAdvancedFlagValidationErrors,
  normalizeAdvancedSettingsForGetResponse
} from '../utils/planComponentAdvancedSettings.js';

test('create plan with recurring_flag Y normalizes to Y in package JSON', () => {
  const out = normalizeAdvancedComponentFlags({
    component_id: 97,
    recurring_flag: 'Y'
  });
  assert.equal(out.recurring_flag, 'Y');
  assert.equal(out.advanced_settings, undefined);
});

test('create plan with recurring_flag N normalizes to N', () => {
  const out = normalizeAdvancedComponentFlags({ component_id: 97, recurring_flag: 'N' });
  assert.equal(out.recurring_flag, 'N');
});

test('update recurring_flag from N to Y', () => {
  const out = normalizeAdvancedComponentFlags({
    component_id: 97,
    recurring_flag: 'Y',
    prorated_flag: 'N'
  });
  assert.equal(out.recurring_flag, 'Y');
  assert.equal(out.prorated_flag, 'N');
});

test('update recurring_flag from Y to N', () => {
  const out = normalizeAdvancedComponentFlags({
    component_id: 97,
    recurring_flag: 'n',
    taxable_flag: 'Y'
  });
  assert.equal(out.recurring_flag, 'N');
  assert.equal(out.taxable_flag, 'Y');
});

test('omit recurring_flag defaults to N', () => {
  const out = normalizeAdvancedComponentFlags({ component_id: 97, taxable_flag: 'Y' });
  assert.equal(out.recurring_flag, 'N');
});

test('advanced_settings.recurring_flag is merged when flat flag omitted', () => {
  const out = normalizeAdvancedComponentFlags({
    component_id: 97,
    advanced_settings: { recurring_flag: 'Y', pay_basis: 'monthly' }
  });
  assert.equal(out.recurring_flag, 'Y');
  assert.equal(out.pay_basis, 'MONTHLY');
  assert.equal(out.advanced_settings, undefined);
});

test('retrieve plan component returns recurring_flag under advanced_settings', () => {
  const out = normalizePlanComponentForGetResponse({
    component_id: 97,
    component_name: 'Housing Allowance',
    recurring_flag: 'Y',
    taxable_flag: 'Y',
    pay_basis: 'MONTHLY'
  });
  assert.deepEqual(out.advanced_settings, {
    prorated_flag: 'N',
    taxable_flag: 'Y',
    pensionable_flag: 'N',
    statutory_flag: 'N',
    include_in_ctc_flag: 'N',
    optional_flag: 'N',
    amortizable_flag: 'N',
    recurring_flag: 'Y',
    pay_basis: 'MONTHLY'
  });
  assert.equal(out.recurring_flag, undefined);
  assert.equal(out.component_id, 97);
});

test('retrieve preserves nested advanced_settings and defaults missing flags to N', () => {
  const out = normalizePlanComponentForGetResponse({
    component_id: 97,
    advanced_settings: { recurring_flag: 'N', pay_basis: 'MONTHLY' }
  });
  assert.equal(out.advanced_settings.recurring_flag, 'N');
  assert.equal(out.advanced_settings.prorated_flag, 'N');
  assert.equal(out.advanced_settings.pay_basis, 'MONTHLY');
});

test('validation rejects invalid recurring_flag', () => {
  const errors = collectComponentAdvancedFlagValidationErrors(
    { recurring_flag: 'YES' },
    0
  );
  assert.ok(errors.some((e) => e.includes('recurring_flag')));
});

test('validation accepts omitted recurring_flag', () => {
  const errors = collectComponentAdvancedFlagValidationErrors({ component_id: 1 }, 0);
  assert.equal(errors.length, 0);
});

test('normalizeAdvancedSettingsForGetResponse defaults all flags to N', () => {
  assert.deepEqual(normalizeAdvancedSettingsForGetResponse(null), {
    prorated_flag: 'N',
    taxable_flag: 'N',
    pensionable_flag: 'N',
    statutory_flag: 'N',
    include_in_ctc_flag: 'N',
    optional_flag: 'N',
    amortizable_flag: 'N',
    recurring_flag: 'N'
  });
});
