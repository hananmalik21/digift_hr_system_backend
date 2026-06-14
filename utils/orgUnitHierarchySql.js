/**
 * Reusable Oracle CONNECT BY fragments for ENT.ORG_UNITS hierarchy.
 * Enterprise-scoped to avoid cross-tenant tree traversal.
 */

/** Walk from a node up to ancestors (child → parent). */
export const ORG_UNIT_ANCESTORS_CONNECT_BY = `
  CONNECT BY NOCYCLE
    PRIOR ou.PARENT_ORG_UNIT_ID = ou.ORG_UNIT_ID
    AND PRIOR ou.ENTERPRISE_ID = ou.ENTERPRISE_ID`;

/** Walk from a node down to descendants (parent → children). */
export const ORG_UNIT_DESCENDANTS_CONNECT_BY = `
  CONNECT BY NOCYCLE
    PRIOR ou.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
    AND PRIOR ou.ENTERPRISE_ID = ou.ENTERPRISE_ID`;

/**
 * SQL IN-subquery: org units in the subtree rooted at orgUnitBind (inclusive).
 *
 * @param {number|string} orgUnitBind positional bind index
 * @param {number|string} enterpriseBind positional bind index
 * @returns {string}
 */
export function orgUnitSubtreeInSubquery(orgUnitBind, enterpriseBind) {
  return `
    SELECT ou.ORG_UNIT_ID
    FROM ENT.ORG_UNITS ou
    START WITH ou.ORG_UNIT_ID = :${orgUnitBind}
      AND ou.ENTERPRISE_ID = :${enterpriseBind}
    ${ORG_UNIT_DESCENDANTS_CONNECT_BY}`;
}

/**
 * WHERE clause fragment matching positions in an org unit subtree.
 *
 * @param {number|string} orgUnitBind
 * @param {number|string} enterpriseBind
 * @returns {string}
 */
export function positionOrgUnitSubtreeWhere(orgUnitBind, enterpriseBind) {
  return `p.ORG_UNIT_ID IN (${orgUnitSubtreeInSubquery(orgUnitBind, enterpriseBind)})`;
}
