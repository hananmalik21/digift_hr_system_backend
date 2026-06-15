/**
 * Org scope helpers — employment types (replaces legacy employee_categories).
 */

/**
 * @param {object|undefined|null} org
 * @returns {unknown[]|undefined|null}
 */
export function resolveEmploymentTypes(org) {
  if (org == null) return null;
  if (org.employment_types != null) return org.employment_types;
  if (org.employee_categories != null) return org.employee_categories;
  return null;
}

/**
 * Map legacy org_scope.employee_categories → employment_types before validation/DB bind.
 * @param {object} body
 * @returns {object}
 */
export function normalizeOrgScopeLegacy(body) {
  const org = body?.org_scope;
  if (!org || org.employment_types != null) return body;
  if (!Object.prototype.hasOwnProperty.call(org, 'employee_categories')) return body;

  const { employee_categories, ...restOrg } = org;
  return {
    ...body,
    org_scope: {
      ...restOrg,
      employment_types: employee_categories
    }
  };
}

/**
 * @param {unknown} arr
 * @param {string} fieldLabel
 * @returns {string|null}
 */
export function validateEmploymentTypesList(arr, fieldLabel) {
  if (!Array.isArray(arr)) return `${fieldLabel} must be an array`;
  for (const item of arr) {
    if (typeof item !== 'string' || String(item).trim() === '') {
      return `${fieldLabel} entries must be non-empty strings`;
    }
  }
  return null;
}
