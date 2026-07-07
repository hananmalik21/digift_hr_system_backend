import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  CRITERIA_TYPE_TO_ORG_LEVEL,
  EMPLOYMENT_TYPE_OPTIONS
} from '../constants/payElementEligibilityRules.constants.js';

const WORK_LOCATIONS_VIEW = 'FNDSEC.FNDSEC_WORK_LOCATIONS_V';
const GENERIC_FETCH_ERROR = 'Unable to process request. Please try again or contact support.';

const EMPLOYMENT_TYPE_LABELS = Object.freeze({
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  TEMP: 'Temporary'
});

function mapDropdownRow(row) {
  const value = row.VALUE ?? row.value;
  const label = row.LABEL ?? row.label;
  const code = row.CODE ?? row.code;
  return {
    value: value != null ? String(value) : null,
    label: label != null ? String(label) : null,
    code: code != null ? String(code) : null
  };
}

function mapEmploymentTypeOptions() {
  return EMPLOYMENT_TYPE_OPTIONS.map((code) => ({
    value: code,
    label: EMPLOYMENT_TYPE_LABELS[code] ?? code.replace(/_/g, ' '),
    code
  }));
}

async function executeDropdownQuery(sql, binds = {}) {
  try {
    const result = await db.executeQuery(sql, binds);
    return (result.rows ?? []).map(mapDropdownRow);
  } catch (err) {
    throw new DatabaseError(GENERIC_FETCH_ERROR, err, GENERIC_FETCH_ERROR);
  }
}

async function queryGrades() {
  const sql = `
SELECT TO_CHAR(g.GRADE_ID) AS value,
       TO_CHAR(g.GRADE_NUMBER) AS label,
       g.GRADE_CATEGORY AS code
  FROM ENT.GRADES g
 WHERE g.STATUS = 'ACTIVE'
 ORDER BY g.GRADE_NUMBER`.trim();

  return executeDropdownQuery(sql);
}

async function queryPositions() {
  const sql = `
SELECT RAWTOHEX(p.POSITION_ID) AS value,
       p.POSITION_TITLE_EN AS label,
       p.POSITION_CODE AS code
  FROM ENT.POSITIONS p
 WHERE p.STATUS = 'ACTIVE'
 ORDER BY p.POSITION_TITLE_EN`.trim();

  return executeDropdownQuery(sql);
}

async function queryOrgUnitsByLevel(levelCode) {
  const sql = `
SELECT RAWTOHEX(ou.ORG_UNIT_ID) AS value,
       ou.ORG_UNIT_NAME_EN AS label,
       ou.ORG_UNIT_CODE AS code
  FROM ENT.ORG_UNITS ou
 WHERE UPPER(ou.LEVEL_CODE) = :level_code
   AND ou.STATUS = 'ACTIVE'
 ORDER BY ou.ORG_UNIT_NAME_EN`.trim();

  return executeDropdownQuery(sql, {
    level_code: String(levelCode).trim().toUpperCase()
  });
}

async function queryLocations(enterpriseId) {
  const sql = `
SELECT v.LOCATION_CODE AS value,
       v.LOCATION_NAME AS label,
       v.LOCATION_CODE AS code
  FROM ${WORK_LOCATIONS_VIEW} v
 WHERE v.ENTERPRISE_ID = :enterprise_id
 ORDER BY v.LOCATION_NAME`.trim();

  return executeDropdownQuery(sql, { enterprise_id: enterpriseId });
}

/**
 * @param {string} criteriaTypeCode
 * @param {number|null} enterpriseId
 */
export async function listEligibilityCriteriaValues(criteriaTypeCode, enterpriseId = null) {
  const type = String(criteriaTypeCode).trim().toUpperCase();

  if (type === 'EMPLOYMENT_TYPE') {
    return mapEmploymentTypeOptions();
  }

  if (type === 'GRADE') {
    return queryGrades();
  }

  if (type === 'POSITION') {
    return queryPositions();
  }

  const levelCode = CRITERIA_TYPE_TO_ORG_LEVEL[type];
  if (levelCode) {
    return queryOrgUnitsByLevel(levelCode);
  }

  if (type === 'LOCATION') {
    if (enterpriseId == null) return [];
    return queryLocations(enterpriseId);
  }

  return [];
}
