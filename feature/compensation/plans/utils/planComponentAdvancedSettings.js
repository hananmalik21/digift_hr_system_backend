/**
 * Plan-component advanced settings (COMP.COMP_PLAN_COMP_ADV_SETTINGS).
 * Create/update accept flat flags on each component (and optional advanced_settings object).
 * GET responses expose flags under component.advanced_settings.
 */

export const ADVANCED_COMPONENT_FLAG_KEYS = [
  'prorated_flag',
  'taxable_flag',
  'pensionable_flag',
  'statutory_flag',
  'include_in_ctc_flag',
  'optional_flag',
  'amortizable_flag',
  'recurring_flag'
];

export function normalizeYnFlag(value) {
  if (value === undefined || value === null) return 'N';
  const s = String(value).trim().toUpperCase();
  if (!s) return 'N';
  if (s === 'Y' || s.startsWith('Y')) return 'Y';
  if (s === 'N' || s.startsWith('N')) return 'N';
  return 'N';
}

/** Optional plan-component pay_basis; trim + uppercase for storage. */
export function normalizePayBasisForPlanJson(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  return s.toUpperCase();
}

export function isValidYnFlag(value) {
  if (value === undefined || value === null) return true;
  const s = String(value).trim().toUpperCase();
  if (!s) return true;
  return s === 'Y' || s === 'N';
}

function hasKey(obj, key) {
  return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Merges optional `advanced_settings` object into flat component fields for package JSON.
 * @param {object} component
 */
export function flattenComponentAdvancedSettingsInput(component) {
  if (component == null || typeof component !== 'object' || Array.isArray(component)) {
    return component;
  }
  const out = { ...component };
  const adv = component.advanced_settings;
  if (adv != null && typeof adv === 'object' && !Array.isArray(adv)) {
    ADVANCED_COMPONENT_FLAG_KEYS.forEach((k) => {
      if (!hasKey(out, k) && hasKey(adv, k)) out[k] = adv[k];
    });
    if (!hasKey(out, 'pay_basis') && hasKey(adv, 'pay_basis')) out.pay_basis = adv.pay_basis;
  }
  return out;
}

export function normalizeAdvancedComponentFlags(component) {
  const flattened = flattenComponentAdvancedSettingsInput(component);
  if (flattened == null || typeof flattened !== 'object' || Array.isArray(flattened)) {
    return flattened;
  }
  const out = { ...flattened };
  ADVANCED_COMPONENT_FLAG_KEYS.forEach((k) => {
    out[k] = normalizeYnFlag(flattened[k]);
  });
  const pb = normalizePayBasisForPlanJson(flattened.pay_basis);
  if (pb !== undefined) out.pay_basis = pb;
  else delete out.pay_basis;
  delete out.advanced_settings;
  return out;
}

/**
 * @param {object} component
 * @param {number} idx
 * @returns {string[]}
 */
export function collectComponentAdvancedFlagValidationErrors(component, idx) {
  const errors = [];
  if (component == null || Array.isArray(component) || typeof component !== 'object') {
    return errors;
  }

  const sources = [component];
  if (
    component.advanced_settings != null &&
    typeof component.advanced_settings === 'object' &&
    !Array.isArray(component.advanced_settings)
  ) {
    sources.push(component.advanced_settings);
  }

  ADVANCED_COMPONENT_FLAG_KEYS.forEach((flag) => {
    sources.forEach((src) => {
      if (hasKey(src, flag) && !isValidYnFlag(src[flag])) {
        errors.push(`components[${idx}].${flag} must be "Y" or "N"`);
      }
    });
  });

  return errors;
}

/**
 * @param {object|null|undefined} advancedSettings
 */
export function normalizeAdvancedSettingsForGetResponse(advancedSettings) {
  const src =
    advancedSettings != null && typeof advancedSettings === 'object' && !Array.isArray(advancedSettings)
      ? advancedSettings
      : {};
  const out = {};
  ADVANCED_COMPONENT_FLAG_KEYS.forEach((k) => {
    out[k] = normalizeYnFlag(src[k]);
  });
  const pb = normalizePayBasisForPlanJson(src.pay_basis);
  if (pb !== undefined) out.pay_basis = pb;
  return out;
}

/**
 * Shapes a plan component for API GET responses with nested advanced_settings.
 * @param {object} component
 */
export function normalizePlanComponentForGetResponse(component) {
  if (component == null || typeof component !== 'object' || Array.isArray(component)) {
    return component;
  }

  const advancedFromNested =
    component.advanced_settings != null &&
    typeof component.advanced_settings === 'object' &&
    !Array.isArray(component.advanced_settings)
      ? component.advanced_settings
      : {};

  const advancedFromFlat = {};
  ADVANCED_COMPONENT_FLAG_KEYS.forEach((k) => {
    if (hasKey(component, k)) advancedFromFlat[k] = component[k];
  });
  if (hasKey(component, 'pay_basis')) advancedFromFlat.pay_basis = component.pay_basis;

  const mergedAdvanced = { ...advancedFromFlat, ...advancedFromNested };
  const advanced_settings = normalizeAdvancedSettingsForGetResponse(mergedAdvanced);

  const rest = { ...component };
  ADVANCED_COMPONENT_FLAG_KEYS.forEach((k) => {
    delete rest[k];
  });
  delete rest.pay_basis;
  delete rest.advanced_settings;

  return {
    ...rest,
    advanced_settings
  };
}
