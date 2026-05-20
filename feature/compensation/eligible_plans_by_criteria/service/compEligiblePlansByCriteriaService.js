import { executeQuery } from '../../../../config/db.js';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { parseJsonLoose } from '../../employee_compensation/utils/oracleCompensationRead.js';

const ELIGIBLE_PLANS_BY_CRITERIA_SQL = `
SELECT v.enterprise_id,
       v.plan_id,
       UPPER(RAWTOHEX(v.plan_guid)) AS plan_guid,
       v.plan_code,
       v.plan_name,
       v.plan_type_code,
       v.components_json
  FROM comp.v_eligible_plans_by_criteria_json v
 WHERE v.enterprise_id = :enterprise_id
   AND v.grade_id = :grade_id
   AND v.position_id = HEXTORAW(:position_id)
   AND v.job_family_id = :job_family_id
   AND v.org_unit_id = HEXTORAW(:org_unit_id)
 ORDER BY v.plan_id
`;

function parseJsonArrayLoose(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && !Buffer.isBuffer(value)) {
    return [];
  }
  const parsed = typeof value === 'string' ? parseJsonLoose(value) : value;
  return Array.isArray(parsed) ? parsed : [];
}

function mapRow(r) {
  return {
    enterprise_id: r.ENTERPRISE_ID ?? r.enterprise_id,
    plan_id: r.PLAN_ID ?? r.plan_id,
    plan_guid: r.PLAN_GUID ?? r.plan_guid,
    plan_code: r.PLAN_CODE ?? r.plan_code,
    plan_name: r.PLAN_NAME ?? r.plan_name,
    plan_type_code: r.PLAN_TYPE_CODE ?? r.plan_type_code,
    components: parseJsonArrayLoose(r.COMPONENTS_JSON ?? r.components_json)
  };
}

/**
 * @param {{ enterprise_id: number, grade_id: number, position_id_hex: string, job_family_id: number, org_unit_id_hex: string }} input
 * @returns {Promise<object[]>}
 */
export async function listEligiblePlansByCriteria(input) {
  return withCompSchemaConnection(async (connection) => {
    const result = await executeQuery(
      ELIGIBLE_PLANS_BY_CRITERIA_SQL,
      {
        enterprise_id: input.enterprise_id,
        grade_id: input.grade_id,
        position_id: input.position_id_hex,
        job_family_id: input.job_family_id,
        org_unit_id: input.org_unit_id_hex
      },
      { connection }
    );
    const rows = result?.rows ?? [];
    return rows.map(mapRow);
  });
}

