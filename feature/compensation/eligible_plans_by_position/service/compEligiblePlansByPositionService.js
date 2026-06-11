import { executeQuery } from '../../../../config/db.js';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { parseJsonLoose } from '../../employee_compensation/utils/oracleCompensationRead.js';

const ELIGIBLE_PLANS_BY_POSITION_SQL = `
SELECT v.enterprise_id,
       v.plan_id,
       UPPER(RAWTOHEX(v.plan_guid)) AS plan_guid,
       v.plan_code,
       v.plan_name,
       v.plan_type_code,
       UPPER(RAWTOHEX(v.position_id)) AS position_id,
       v.components_json
  FROM comp.v_eligible_plans_by_position_json v
 WHERE v.position_id = HEXTORAW(:position_id)
 ORDER BY v.plan_id
`;

const ELIGIBLE_PLANS_BY_POSITION_ENTERPRISE_SQL = `
SELECT v.enterprise_id,
       v.plan_id,
       UPPER(RAWTOHEX(v.plan_guid)) AS plan_guid,
       v.plan_code,
       v.plan_name,
       v.plan_type_code,
       UPPER(RAWTOHEX(v.position_id)) AS position_id,
       v.components_json
  FROM comp.v_eligible_plans_by_position_json v
 WHERE v.position_id = HEXTORAW(:position_id)
   AND v.enterprise_id = :enterprise_id
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
    position_id: r.POSITION_ID ?? r.position_id,
    components: parseJsonArrayLoose(r.COMPONENTS_JSON ?? r.components_json)
  };
}

/**
 * @param {{ position_id_hex: string, enterprise_id?: number }} input
 * @returns {Promise<object[]>}
 */
export async function listEligiblePlansByPosition(input) {
  return withCompSchemaConnection(async (connection) => {
    const hasEnterprise = input.enterprise_id != null;
    const result = await executeQuery(
      hasEnterprise ? ELIGIBLE_PLANS_BY_POSITION_ENTERPRISE_SQL : ELIGIBLE_PLANS_BY_POSITION_SQL,
      hasEnterprise
        ? { position_id: input.position_id_hex, enterprise_id: input.enterprise_id }
        : { position_id: input.position_id_hex },
      { connection }
    );
    const rows = result?.rows ?? [];
    return rows.map(mapRow);
  });
}
