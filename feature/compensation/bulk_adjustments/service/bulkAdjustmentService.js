import oracledb from 'oracledb';
import { withCompConnection } from '../../employee_compensation/utils/withCompConnection.js';
import {
  componentsJsonClobBind,
  parseJsonClobOut,
  readClobOut,
  textClobBind
} from '../../utils/oracleClobBinds.js';
import { buildOracleComponentsJson, toUtcDateFromYmd } from '../utils/buildOracleComponentsJson.js';
import { normalizeBulkAdjustOutcome } from '../utils/normalizeBulkAdjustOutcome.js';

const BULK_ADJUST_PLSQL = `
BEGIN
  COMP.EMPLOYEE_COMPENSATION.bulk_adjust_components(
    p_enterprise_id      => :p_enterprise_id,
    p_adjustment_type    => :p_adjustment_type,
    p_effective_date     => :p_effective_date,
    p_reason_code        => :p_reason_code,
    p_budget_code        => :p_budget_code,
    p_justification_text => :p_justification_text,
    p_updated_by         => :p_updated_by,
    p_components_json    => :p_components_json,
    x_success_count      => :x_success_count,
    x_error_count        => :x_error_count,
    x_message            => :x_message,
    x_result_json        => :x_result_json
  );
END;
`.trim();

const OUT_BINDS = Object.freeze({
  x_success_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  x_error_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  x_message: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
  x_result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
});

/**
 * @param {import('../validation/bulkAdjustmentBody.js').BulkAdjustmentPayload} payload
 */
function buildProcedureBinds(payload, componentsJson) {
  return {
    p_enterprise_id: payload.enterprise_id,
    p_adjustment_type: payload.adjustment_type,
    p_effective_date: {
      val: toUtcDateFromYmd(payload.effective_date),
      dir: oracledb.BIND_IN,
      type: oracledb.DATE
    },
    p_reason_code: payload.reason_code,
    p_budget_code: payload.budget_code,
    p_justification_text: textClobBind(payload.justification_text),
    p_updated_by: payload.updated_by,
    p_components_json: componentsJsonClobBind(componentsJson),
    ...OUT_BINDS
  };
}

/**
 * @param {Record<string, unknown>} outBinds
 * @returns {Promise<import('../utils/normalizeBulkAdjustOutcome.js').BulkAdjustOutcome>}
 */
async function parseProcedureOutBinds(outBinds) {
  const successCount = Number(outBinds.x_success_count ?? 0);
  const errorCount = Number(outBinds.x_error_count ?? 0);
  const messageRaw = await readClobOut(/** @type {string} */ (outBinds.x_message));
  const results = await parseJsonClobOut(outBinds.x_result_json);

  return normalizeBulkAdjustOutcome({
    success_count: Number.isFinite(successCount) ? successCount : 0,
    error_count: Number.isFinite(errorCount) ? errorCount : 0,
    message:
      messageRaw != null && String(messageRaw).trim() !== ''
        ? String(messageRaw).trim()
        : 'Bulk compensation adjustment completed.',
    results: results ?? []
  });
}

/**
 * @param {import('../validation/bulkAdjustmentBody.js').BulkAdjustmentPayload} payload
 * @returns {Promise<import('../utils/normalizeBulkAdjustOutcome.js').BulkAdjustOutcome>}
 */
export async function bulkAdjustCompensationComponents(payload) {
  const componentsJson = buildOracleComponentsJson(payload.employees, payload.effective_date);

  return withCompConnection(async (connection) => {
    const result = await connection.execute(
      BULK_ADJUST_PLSQL,
      buildProcedureBinds(payload, componentsJson),
      { autoCommit: false }
    );

    return parseProcedureOutBinds(result?.outBinds ?? {});
  });
}
