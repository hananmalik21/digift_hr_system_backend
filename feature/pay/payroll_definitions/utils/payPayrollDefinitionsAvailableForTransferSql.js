/**
 * Shared available-for-transfer Payroll Definition query + row mapper.
 * Used by payroll-definitions lookup and compensation-transfer setup/pre-checks.
 */

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

export const AVAILABLE_FOR_TRANSFER_SQL = `
SELECT
    PD.PAYROLL_ID,
    LOWER(RAWTOHEX(PD.PAYROLL_GUID)) AS PAYROLL_GUID,
    PD.ENTERPRISE_ID,
    PD.PAYROLL_NAME,
    PD.PAYROLL_CODE,
    PD.EFFECTIVE_START_DATE,
    PD.EFFECTIVE_END_DATE,
    PD.STATUS
FROM PAY.PAYROLL_DEFINITIONS PD
WHERE PD.ENTERPRISE_ID = :enterprise_id
  AND UPPER(TRIM(PD.STATUS)) = UPPER(TRIM(NVL(:status, 'ACTIVE')))
  AND
      (
          :period_start_date IS NULL
          OR PD.EFFECTIVE_START_DATE IS NULL
          OR TRUNC(PD.EFFECTIVE_START_DATE)
                <= TRUNC(TO_DATE(:period_start_date, 'YYYY-MM-DD'))
      )
  AND
      (
          :period_end_date IS NULL
          OR PD.EFFECTIVE_END_DATE IS NULL
          OR TRUNC(PD.EFFECTIVE_END_DATE)
                >= TRUNC(TO_DATE(:period_end_date, 'YYYY-MM-DD'))
      )
ORDER BY
    PD.PAYROLL_NAME,
    PD.PAYROLL_ID
`.trim();

/**
 * @param {Record<string, unknown>} row
 */
export function mapAvailableForTransferPayrollDefinitionRow(row) {
  const r = rowKeysUpper(row);
  return {
    payroll_id: toNumberOrNull(r.PAYROLL_ID),
    payroll_guid: toStringOrNull(r.PAYROLL_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    payroll_name: toStringOrNull(r.PAYROLL_NAME),
    payroll_code: toStringOrNull(r.PAYROLL_CODE),
    effective_start_date: toIsoDateOrNull(r.EFFECTIVE_START_DATE),
    effective_end_date: toIsoDateOrNull(r.EFFECTIVE_END_DATE),
    status: toStringOrNull(r.STATUS)
  };
}
