import oracledb from 'oracledb';
import db, { executeQuery } from '../../../../config/db.js';
import { normalizeComponentForGetResponse } from '../../components/normalizeComponentGetResponse.js';
import {
  normalizePlanGuidHex,
  PLAN_GUID_VALIDATION_MESSAGE
} from '../planGuid.js';

/* After CREATE_PLAN, sync plan ↔ employees (all five criteria incl. BU / BUSINESS_UNIT
   node in org_structure_list per PKG_PLAN_EMPLOYEES). Avoid AFTER INSERT alone. */
const CREATE_PLAN_SQL = `
DECLARE
  l_plan_id NUMBER;
BEGIN
  COMP.CREATE_COMPENSATION_PLAN_PKG.CREATE_PLAN(
    P_PLAN_JSON => :p_plan_json,
    P_PLAN_ID   => l_plan_id
  );
  IF l_plan_id IS NOT NULL THEN
    COMP.PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN(l_plan_id);
  END IF;
  :p_plan_id := l_plan_id;
END;
`;

/* Re-sync after criteria change (e.g. business_units) so COMP_PLAN_EMP_ASSIGNMENT
   reflects job family, grade, position, employment type, and BU rules. */
const UPDATE_PLAN_SQL = `
DECLARE
  l_plan_id NUMBER;
BEGIN
  COMP.UPDATE_COMPENSATION_PLAN_PKG.UPDATE_PLAN(
    P_PLAN_JSON => :p_plan_json
  );
  BEGIN
    SELECT p.plan_id
      INTO l_plan_id
      FROM comp.comp_plans p
     WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      l_plan_id := NULL;
  END;
  IF l_plan_id IS NOT NULL THEN
    COMP.PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN(l_plan_id);
  END IF;
END;
`;

const DELETE_PLAN_SQL = `
BEGIN
  COMP.DELETE_COMPENSATION_PLAN_PKG.DELETE_PLAN(
    P_PLAN_GUID  => HEXTORAW(:p_plan_guid),
    P_DELETED_BY => :p_deleted_by
  );
END;
`;

const ADVANCED_COMPONENT_FLAG_KEYS = [
  'prorated_flag',
  'taxable_flag',
  'pensionable_flag',
  'statutory_flag',
  'include_in_ctc_flag',
  'optional_flag'
];

function normalizeYnFlag(value) {
  if (value === undefined || value === null) return 'N';
  const s = String(value).trim().toUpperCase();
  if (!s) return 'N';
  if (s === 'Y' || s.startsWith('Y')) return 'Y';
  if (s === 'N' || s.startsWith('N')) return 'N';
  return 'N';
}

function normalizeAdvancedComponentFlags(component) {
  if (component == null || typeof component !== 'object' || Array.isArray(component)) return component;
  const out = { ...component };
  ADVANCED_COMPONENT_FLAG_KEYS.forEach((k) => {
    out[k] = normalizeYnFlag(component[k]);
  });
  return out;
}

function normalizePayloadComponentsAdvancedFlags(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'components')) return payload;
  if (payload.components == null) return payload;
  if (!Array.isArray(payload.components)) return payload;
  return { ...payload, components: payload.components.map(normalizeAdvancedComponentFlags) };
}

/**
 * UPDATE_COMPENSATION_PLAN_PKG.UPDATE_PLAN does not reliably persist `components`
 * into COMP.COMP_PLAN_COMPONENTS. When the client sends `components`, mirror the
 * intended list with MERGE + DELETE (same transaction as UPDATE_PLAN).
 * Set COMP_PLAN_SKIP_COMPONENTS_NODE_SYNC=true to skip (e.g. if the DB package is fixed later).
 */
const SKIP_PLAN_COMPONENTS_NODE_SYNC =
  String(process.env.COMP_PLAN_SKIP_COMPONENTS_NODE_SYNC || '')
    .trim()
    .toLowerCase() === 'true' ||
  String(process.env.COMP_PLAN_SKIP_COMPONENTS_NODE_SYNC || '').trim() === '1';

// Base sync SQL (works even if advanced flag columns don't exist).
const SYNC_PLAN_COMPONENTS_SQL = `
DECLARE
  l_plan_id NUMBER;
  l_actor   VARCHAR2(200);
BEGIN
  SELECT p.plan_id
    INTO l_plan_id
    FROM comp.comp_plans p
   WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);

  l_actor := NVL(SUBSTR(:actor, 1, 200), 'SYSTEM');
  MERGE INTO comp.comp_plan_components t
  USING (
    SELECT l_plan_id AS plan_id,
           j.component_id,
           NVL(j.display_sequence, 1) AS display_sequence,
           CASE
             WHEN UPPER(TRIM(j.mandatory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS mandatory_flag,
           CASE
             WHEN UPPER(TRIM(j.active_flag)) LIKE 'N%' THEN 'N'
             ELSE 'Y'
           END AS active_flag,
           NVL(SUBSTR(TRIM(j.created_by), 1, 200), l_actor) AS row_created_by
      FROM JSON_TABLE(
             :components_json,
             '$[*]'
             COLUMNS (
               component_id       NUMBER         PATH '$.component_id',
               display_sequence   NUMBER         PATH '$.display_sequence',
               mandatory_flag     VARCHAR2(10) PATH '$.mandatory_flag',
               active_flag        VARCHAR2(10) PATH '$.active_flag',
               created_by         VARCHAR2(200) PATH '$.created_by'
             )
           ) j
     WHERE j.component_id IS NOT NULL
  ) s
  ON (t.plan_id = s.plan_id AND t.component_id = s.component_id)
  WHEN MATCHED THEN
    UPDATE SET
      t.display_sequence   = s.display_sequence,
      t.mandatory_flag     = s.mandatory_flag,
      t.active_flag        = s.active_flag,
      t.last_updated_by    = l_actor,
      t.last_update_date   = SYSDATE
  WHEN NOT MATCHED THEN
    INSERT (
      plan_component_id,
      plan_id,
      component_id,
      display_sequence,
      mandatory_flag,
      active_flag,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      comp.comp_plan_components_seq.NEXTVAL,
      s.plan_id,
      s.component_id,
      s.display_sequence,
      s.mandatory_flag,
      s.active_flag,
      s.row_created_by,
      SYSDATE,
      l_actor,
      SYSDATE
    );

  DELETE FROM comp.comp_plan_components t
   WHERE t.plan_id = l_plan_id
     AND NOT EXISTS (
           SELECT 1
             FROM JSON_TABLE(
                    :components_json,
                    '$[*]'
                    COLUMNS (component_id NUMBER PATH '$.component_id')
                  ) j
            WHERE j.component_id IS NOT NULL
              AND j.component_id = t.component_id
         );
END;
`;

const SYNC_PLAN_COMPONENTS_WITH_FREQUENCY_SQL = `
DECLARE
  l_plan_id NUMBER;
  l_actor   VARCHAR2(200);
BEGIN
  SELECT p.plan_id
    INTO l_plan_id
    FROM comp.comp_plans p
   WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);

  l_actor := NVL(SUBSTR(:actor, 1, 200), 'SYSTEM');

  MERGE INTO comp.comp_plan_components t
  USING (
    SELECT l_plan_id AS plan_id,
           j.component_id,
           NVL(j.display_sequence, 1) AS display_sequence,
           CASE
             WHEN UPPER(TRIM(j.mandatory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS mandatory_flag,
           CASE
             WHEN UPPER(TRIM(j.active_flag)) LIKE 'N%' THEN 'N'
             ELSE 'Y'
           END AS active_flag,
           NULLIF(UPPER(TRIM(j.frequency_code)), '') AS frequency_code,
           NVL(SUBSTR(TRIM(j.created_by), 1, 200), l_actor) AS row_created_by
      FROM JSON_TABLE(
             :components_json,
             '$[*]'
             COLUMNS (
               component_id       NUMBER         PATH '$.component_id',
               display_sequence   NUMBER         PATH '$.display_sequence',
               mandatory_flag     VARCHAR2(10) PATH '$.mandatory_flag',
               active_flag        VARCHAR2(10) PATH '$.active_flag',
               frequency_code     VARCHAR2(30) PATH '$.frequency_code',
               created_by         VARCHAR2(200) PATH '$.created_by'
             )
           ) j
     WHERE j.component_id IS NOT NULL
  ) s
  ON (t.plan_id = s.plan_id AND t.component_id = s.component_id)
  WHEN MATCHED THEN
    UPDATE SET
      t.display_sequence   = s.display_sequence,
      t.mandatory_flag     = s.mandatory_flag,
      t.active_flag        = s.active_flag,
      t.frequency_code     = s.frequency_code,
      t.last_updated_by    = l_actor,
      t.last_update_date   = SYSDATE
  WHEN NOT MATCHED THEN
    INSERT (
      plan_component_id,
      plan_id,
      component_id,
      display_sequence,
      mandatory_flag,
      active_flag,
      frequency_code,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      comp.comp_plan_components_seq.NEXTVAL,
      s.plan_id,
      s.component_id,
      s.display_sequence,
      s.mandatory_flag,
      s.active_flag,
      s.frequency_code,
      s.row_created_by,
      SYSDATE,
      l_actor,
      SYSDATE
    );

  DELETE FROM comp.comp_plan_components t
   WHERE t.plan_id = l_plan_id
     AND NOT EXISTS (
           SELECT 1
             FROM JSON_TABLE(
                    :components_json,
                    '$[*]'
                    COLUMNS (component_id NUMBER PATH '$.component_id')
                  ) j
            WHERE j.component_id IS NOT NULL
              AND j.component_id = t.component_id
         );
END;
`;

// Advanced sync SQL (requires the new advanced flag columns to exist).
const SYNC_PLAN_COMPONENTS_ADV_SQL = `
DECLARE
  l_plan_id NUMBER;
  l_actor   VARCHAR2(200);
BEGIN
  SELECT p.plan_id
    INTO l_plan_id
    FROM comp.comp_plans p
   WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);

  l_actor := NVL(SUBSTR(:actor, 1, 200), 'SYSTEM');
  MERGE INTO comp.comp_plan_components t
  USING (
    SELECT l_plan_id AS plan_id,
           j.component_id,
           NVL(j.display_sequence, 1) AS display_sequence,
           CASE
             WHEN UPPER(TRIM(j.mandatory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS mandatory_flag,
           CASE
             WHEN UPPER(TRIM(j.active_flag)) LIKE 'N%' THEN 'N'
             ELSE 'Y'
           END AS active_flag,
           CASE
             WHEN UPPER(TRIM(j.prorated_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS prorated_flag,
           CASE
             WHEN UPPER(TRIM(j.taxable_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS taxable_flag,
           CASE
             WHEN UPPER(TRIM(j.pensionable_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS pensionable_flag,
           CASE
             WHEN UPPER(TRIM(j.statutory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS statutory_flag,
           CASE
             WHEN UPPER(TRIM(j.include_in_ctc_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS include_in_ctc_flag,
           CASE
             WHEN UPPER(TRIM(j.optional_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS optional_flag,
           NVL(SUBSTR(TRIM(j.created_by), 1, 200), l_actor) AS row_created_by
      FROM JSON_TABLE(
             :components_json,
             '$[*]'
             COLUMNS (
               component_id        NUMBER         PATH '$.component_id',
               display_sequence    NUMBER         PATH '$.display_sequence',
               mandatory_flag      VARCHAR2(10) PATH '$.mandatory_flag',
               active_flag         VARCHAR2(10) PATH '$.active_flag',
               prorated_flag       VARCHAR2(10) PATH '$.prorated_flag',
               taxable_flag        VARCHAR2(10) PATH '$.taxable_flag',
               pensionable_flag    VARCHAR2(10) PATH '$.pensionable_flag',
               statutory_flag      VARCHAR2(10) PATH '$.statutory_flag',
               include_in_ctc_flag VARCHAR2(10) PATH '$.include_in_ctc_flag',
               optional_flag       VARCHAR2(10) PATH '$.optional_flag',
               created_by          VARCHAR2(200) PATH '$.created_by'
             )
           ) j
     WHERE j.component_id IS NOT NULL
  ) s
  ON (t.plan_id = s.plan_id AND t.component_id = s.component_id)
  WHEN MATCHED THEN
    UPDATE SET
      t.display_sequence    = s.display_sequence,
      t.mandatory_flag      = s.mandatory_flag,
      t.active_flag         = s.active_flag,
      t.prorated_flag       = s.prorated_flag,
      t.taxable_flag        = s.taxable_flag,
      t.pensionable_flag    = s.pensionable_flag,
      t.statutory_flag      = s.statutory_flag,
      t.include_in_ctc_flag = s.include_in_ctc_flag,
      t.optional_flag       = s.optional_flag,
      t.last_updated_by     = l_actor,
      t.last_update_date    = SYSDATE
  WHEN NOT MATCHED THEN
    INSERT (
      plan_component_id,
      plan_id,
      component_id,
      display_sequence,
      mandatory_flag,
      active_flag,
      prorated_flag,
      taxable_flag,
      pensionable_flag,
      statutory_flag,
      include_in_ctc_flag,
      optional_flag,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      comp.comp_plan_components_seq.NEXTVAL,
      s.plan_id,
      s.component_id,
      s.display_sequence,
      s.mandatory_flag,
      s.active_flag,
      s.prorated_flag,
      s.taxable_flag,
      s.pensionable_flag,
      s.statutory_flag,
      s.include_in_ctc_flag,
      s.optional_flag,
      s.row_created_by,
      SYSDATE,
      l_actor,
      SYSDATE
    );

  DELETE FROM comp.comp_plan_components t
   WHERE t.plan_id = l_plan_id
     AND NOT EXISTS (
           SELECT 1
             FROM JSON_TABLE(
                    :components_json,
                    '$[*]'
                    COLUMNS (component_id NUMBER PATH '$.component_id')
                  ) j
            WHERE j.component_id IS NOT NULL
              AND j.component_id = t.component_id
         );
END;
`;

const SYNC_PLAN_COMPONENTS_WITH_FREQUENCY_ADV_SQL = `
DECLARE
  l_plan_id NUMBER;
  l_actor   VARCHAR2(200);
BEGIN
  SELECT p.plan_id
    INTO l_plan_id
    FROM comp.comp_plans p
   WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);

  l_actor := NVL(SUBSTR(:actor, 1, 200), 'SYSTEM');

  MERGE INTO comp.comp_plan_components t
  USING (
    SELECT l_plan_id AS plan_id,
           j.component_id,
           NVL(j.display_sequence, 1) AS display_sequence,
           CASE
             WHEN UPPER(TRIM(j.mandatory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS mandatory_flag,
           CASE
             WHEN UPPER(TRIM(j.active_flag)) LIKE 'N%' THEN 'N'
             ELSE 'Y'
           END AS active_flag,
           NULLIF(UPPER(TRIM(j.frequency_code)), '') AS frequency_code,
           CASE
             WHEN UPPER(TRIM(j.prorated_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS prorated_flag,
           CASE
             WHEN UPPER(TRIM(j.taxable_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS taxable_flag,
           CASE
             WHEN UPPER(TRIM(j.pensionable_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS pensionable_flag,
           CASE
             WHEN UPPER(TRIM(j.statutory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS statutory_flag,
           CASE
             WHEN UPPER(TRIM(j.include_in_ctc_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS include_in_ctc_flag,
           CASE
             WHEN UPPER(TRIM(j.optional_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS optional_flag,
           NVL(SUBSTR(TRIM(j.created_by), 1, 200), l_actor) AS row_created_by
      FROM JSON_TABLE(
             :components_json,
             '$[*]'
             COLUMNS (
               component_id        NUMBER         PATH '$.component_id',
               display_sequence    NUMBER         PATH '$.display_sequence',
               mandatory_flag      VARCHAR2(10) PATH '$.mandatory_flag',
               active_flag         VARCHAR2(10) PATH '$.active_flag',
               frequency_code      VARCHAR2(30) PATH '$.frequency_code',
               prorated_flag       VARCHAR2(10) PATH '$.prorated_flag',
               taxable_flag        VARCHAR2(10) PATH '$.taxable_flag',
               pensionable_flag    VARCHAR2(10) PATH '$.pensionable_flag',
               statutory_flag      VARCHAR2(10) PATH '$.statutory_flag',
               include_in_ctc_flag VARCHAR2(10) PATH '$.include_in_ctc_flag',
               optional_flag       VARCHAR2(10) PATH '$.optional_flag',
               created_by          VARCHAR2(200) PATH '$.created_by'
             )
           ) j
     WHERE j.component_id IS NOT NULL
  ) s
  ON (t.plan_id = s.plan_id AND t.component_id = s.component_id)
  WHEN MATCHED THEN
    UPDATE SET
      t.display_sequence    = s.display_sequence,
      t.mandatory_flag      = s.mandatory_flag,
      t.active_flag         = s.active_flag,
      t.frequency_code      = s.frequency_code,
      t.prorated_flag       = s.prorated_flag,
      t.taxable_flag        = s.taxable_flag,
      t.pensionable_flag    = s.pensionable_flag,
      t.statutory_flag      = s.statutory_flag,
      t.include_in_ctc_flag = s.include_in_ctc_flag,
      t.optional_flag       = s.optional_flag,
      t.last_updated_by     = l_actor,
      t.last_update_date    = SYSDATE
  WHEN NOT MATCHED THEN
    INSERT (
      plan_component_id,
      plan_id,
      component_id,
      display_sequence,
      mandatory_flag,
      active_flag,
      frequency_code,
      prorated_flag,
      taxable_flag,
      pensionable_flag,
      statutory_flag,
      include_in_ctc_flag,
      optional_flag,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      comp.comp_plan_components_seq.NEXTVAL,
      s.plan_id,
      s.component_id,
      s.display_sequence,
      s.mandatory_flag,
      s.active_flag,
      s.frequency_code,
      s.prorated_flag,
      s.taxable_flag,
      s.pensionable_flag,
      s.statutory_flag,
      s.include_in_ctc_flag,
      s.optional_flag,
      s.row_created_by,
      SYSDATE,
      l_actor,
      SYSDATE
    );

  DELETE FROM comp.comp_plan_components t
   WHERE t.plan_id = l_plan_id
     AND NOT EXISTS (
           SELECT 1
             FROM JSON_TABLE(
                    :components_json,
                    '$[*]'
                    COLUMNS (component_id NUMBER PATH '$.component_id')
                  ) j
            WHERE j.component_id IS NOT NULL
              AND j.component_id = t.component_id
         );
END;
`;

let cachedHasPlanComponentFrequencyCode = null;

async function hasPlanComponentFrequencyCodeColumn(connection) {
  if (cachedHasPlanComponentFrequencyCode !== null) return cachedHasPlanComponentFrequencyCode;
  const result = await connection.execute(
    `
      SELECT COUNT(*) AS cnt
        FROM all_tab_columns c
       WHERE c.owner = 'COMP'
         AND c.table_name = 'COMP_PLAN_COMPONENTS'
         AND c.column_name = 'FREQUENCY_CODE'
    `
  );
  const cnt = result?.rows?.[0]?.[0] ?? result?.rows?.[0]?.CNT ?? 0;
  cachedHasPlanComponentFrequencyCode = Number(cnt) > 0;
  return cachedHasPlanComponentFrequencyCode;
}

let cachedHasPlanComponentAdvancedFlags = null;

async function hasPlanComponentAdvancedFlagColumns(connection) {
  if (cachedHasPlanComponentAdvancedFlags !== null) return cachedHasPlanComponentAdvancedFlags;
  const result = await connection.execute(
    `
      SELECT COUNT(*) AS cnt
        FROM all_tab_columns c
       WHERE c.owner = 'COMP'
         AND c.table_name = 'COMP_PLAN_COMPONENTS'
         AND c.column_name IN (
           'PRORATED_FLAG',
           'TAXABLE_FLAG',
           'PENSIONABLE_FLAG',
           'STATUTORY_FLAG',
           'INCLUDE_IN_CTC_FLAG',
           'OPTIONAL_FLAG'
         )
    `
  );
  const cnt = result?.rows?.[0]?.[0] ?? result?.rows?.[0]?.CNT ?? 0;
  cachedHasPlanComponentAdvancedFlags = Number(cnt) === 6;
  return cachedHasPlanComponentAdvancedFlags;
}

function pickComponentsSyncSql({ hasFreq, hasAdvanced }) {
  if (hasAdvanced) {
    return hasFreq ? SYNC_PLAN_COMPONENTS_WITH_FREQUENCY_ADV_SQL : SYNC_PLAN_COMPONENTS_ADV_SQL;
  }
  return hasFreq ? SYNC_PLAN_COMPONENTS_WITH_FREQUENCY_SQL : SYNC_PLAN_COMPONENTS_SQL;
}

const EXEC_OPTS = { autoCommit: false };

/**
 * Below this size (chars), bind plan JSON as STRING (faster than a CLOB).
 * Set env `DB_PLAN_JSON_STRING_MAX=0` to always use CLOB (e.g. if Oracle rejects large VARCHAR2 binds).
 */
const PLAN_JSON_STRING_MAX = (() => {
  const raw = process.env.DB_PLAN_JSON_STRING_MAX;
  if (raw === undefined || raw === '') return 30000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
})();

// Small in-memory TTL cache for plan component reads.
// Big win for repeated UI refreshes; safe because updates/deletes invalidate.
const PLAN_COMPONENTS_CACHE_TTL_MS = (() => {
  const raw = process.env.COMP_PLAN_COMPONENTS_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return 15000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 15000;
  return n;
})();

/** @type {Map<string, { expiresAt: number, value: any }>} */
const planComponentsCache = new Map();

function cacheGetPlan(planGuidHex) {
  if (PLAN_COMPONENTS_CACHE_TTL_MS <= 0) return null;
  const hit = planComponentsCache.get(planGuidHex);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    planComponentsCache.delete(planGuidHex);
    return null;
  }
  return hit.value;
}

function cacheSetPlan(planGuidHex, value) {
  if (PLAN_COMPONENTS_CACHE_TTL_MS <= 0) return;
  // prevent unbounded growth if many different plan guids are requested
  if (planComponentsCache.size > 500) planComponentsCache.clear();
  planComponentsCache.set(planGuidHex, { value, expiresAt: Date.now() + PLAN_COMPONENTS_CACHE_TTL_MS });
}

function cacheInvalidatePlan(planGuidHex) {
  if (!planGuidHex) return;
  planComponentsCache.delete(planGuidHex);
}

function getOracleErrorMessage(error) {
  if (!error) return 'Unknown Oracle error';
  return error.message || String(error);
}

/**
 * One stringify; use VARCHAR2-style bind for typical payloads to cut LOB round-trips.
 * @param {object} payload
 */
function payloadToPlanJsonBind(payload) {
  const json = JSON.stringify(payload);
  if (PLAN_JSON_STRING_MAX > 0 && json.length <= PLAN_JSON_STRING_MAX) {
    return { val: json, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

/**
 * Runs work in a transaction: commit on success, rollback on failure, always closes the connection.
 * @param {(connection: import('oracledb').Connection) => Promise<unknown>} fn
 */
async function withPlanConnection(fn) {
  const connection = await db.getConnection();
  try {
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw new Error(getOracleErrorMessage(error), { cause: error });
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {object} payload
 * @returns {Promise<number | null>} new plan_id or null
 */
export async function createCompensationPlan(payload) {
  return withPlanConnection(async (connection) => {
    const normalizedPayload = normalizePayloadComponentsAdvancedFlags(payload);
    const result = await connection.execute(
      CREATE_PLAN_SQL,
      {
        p_plan_json: payloadToPlanJsonBind(normalizedPayload),
        p_plan_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      EXEC_OPTS
    );

    const planId = result?.outBinds?.p_plan_id ?? null;
    return planId != null ? Number(planId) : null;
  });
}

/**
 * @param {object} payload
 */
export async function updateCompensationPlan(payload) {
  const body = { ...payload };
  if (body.plan_guid != null) {
    body.plan_guid = String(body.plan_guid).trim().toUpperCase();
  }
  const normalizedBody = normalizePayloadComponentsAdvancedFlags(body);
  const planGuidHex = normalizePlanGuidHex(body.plan_guid);
  if (!planGuidHex) {
    throw new Error(PLAN_GUID_VALIDATION_MESSAGE);
  }

  const syncComponentsRequested =
    !SKIP_PLAN_COMPONENTS_NODE_SYNC &&
    Object.prototype.hasOwnProperty.call(payload, 'components');
  if (syncComponentsRequested && payload.components != null && !Array.isArray(payload.components)) {
    throw new Error('components must be an array when provided');
  }

  return withPlanConnection(async (connection) => {
    await connection.execute(
      UPDATE_PLAN_SQL,
      {
        p_plan_json: payloadToPlanJsonBind(normalizedBody),
        plan_guid_hex: { val: planGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING }
      },
      EXEC_OPTS
    );

    if (syncComponentsRequested && Array.isArray(payload.components)) {
      const actor = String(
        body.last_updated_by ?? body.updated_by ?? body.created_by ?? 'SYSTEM'
      ).trim();
      const hasFreq = await hasPlanComponentFrequencyCodeColumn(connection);
      const hasAdvanced = await hasPlanComponentAdvancedFlagColumns(connection);
      const sql = pickComponentsSyncSql({ hasFreq, hasAdvanced });
      const normalizedComponents = normalizedBody.components || [];
      await connection.execute(
        sql,
        {
          plan_guid_hex: { val: planGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING },
          components_json: payloadToPlanJsonBind(normalizedComponents),
          actor: { val: actor || 'SYSTEM', dir: oracledb.BIND_IN, type: oracledb.STRING }
        },
        EXEC_OPTS
      );
    }

    // ensure subsequent reads don't serve stale plan/components
    cacheInvalidatePlan(planGuidHex);
  });
}

/**
 * Shared JSON subquery: plan component lines + component master (tenant = enterprise).
 * @param {string} enterpriseSqlExpr e.g. `v.enterprise_id` or `p.enterprise_id` (caller-controlled, not user input)
 * @param {string} planIdSqlExpr e.g. `v.plan_id` or `p.plan_id`
 */
function sqlPlanComponentsJsonSubquery(enterpriseSqlExpr, planIdSqlExpr) {
  return `
       (
         SELECT NVL(
           JSON_ARRAYAGG(
             JSON_OBJECT(
               'component_id' VALUE c.component_id,
               'component_guid' VALUE UPPER(RAWTOHEX(c.component_guid)),
               'component_code' VALUE c.component_code,
               'component_name' VALUE c.component_name,
               'description' VALUE c.description,
               'component_type_code' VALUE c.component_type_code,
               'comp_category_code' VALUE c.comp_category_code,
               'min_value' VALUE c.min_value,
               'max_value' VALUE c.max_value,
               'display_sequence' VALUE pc.display_sequence,
               'mandatory_flag' VALUE pc.mandatory_flag,
               'active_flag' VALUE pc.active_flag
             )
             ORDER BY NVL(pc.display_sequence, 999999), pc.plan_component_id
             RETURNING CLOB
           ),
           '[]'
         )
           FROM comp.comp_plan_components pc
           JOIN comp.comp_components c
             ON c.component_id = pc.component_id
            AND c.tenant_id = ${enterpriseSqlExpr}
          WHERE pc.plan_id = ${planIdSqlExpr}
       ) AS components_json`;
}

const ELIGIBLE_PLANS_FOR_EMPLOYEE_SQL = `
SELECT v.enterprise_id,
       v.plan_id,
       UPPER(RAWTOHEX(v.plan_guid)) AS plan_guid,
       v.plan_code,
       v.plan_name,
       v.plan_type_code,
       ${sqlPlanComponentsJsonSubquery('v.enterprise_id', 'v.plan_id')}
  FROM comp.v_employee_eligible_plans v
 WHERE v.employee_guid = HEXTORAW(:employee_guid_hex)
 ORDER BY v.plan_id
`;

const PLAN_COMPONENTS_BY_PLAN_GUID_SQL = `
SELECT p.enterprise_id,
       p.plan_id,
       UPPER(RAWTOHEX(p.plan_guid)) AS plan_guid,
       p.plan_code,
       p.plan_name,
       p.plan_type_code,
       ${sqlPlanComponentsJsonSubquery('p.enterprise_id', 'p.plan_id')}
  FROM comp.comp_plans p
 WHERE p.plan_guid = HEXTORAW(:plan_guid_hex)
`;

function parsePlanComponentsJson(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw !== 'string') {
    return Array.isArray(raw) ? raw : [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedPlanComponentsFromRow(rawJson) {
  return parsePlanComponentsJson(rawJson).map(normalizeComponentForGetResponse);
}

/**
 * @param {object} r Oracle row (upper or lower column keys)
 * @returns {{ enterprise_id: *, plan_id: *, plan_guid: *, plan_code: *, plan_name: *, plan_type_code: *, components: object[] }}
 */
function mapPlanRowWithComponents(r) {
  return {
    enterprise_id: r.ENTERPRISE_ID ?? r.enterprise_id,
    plan_id: r.PLAN_ID ?? r.plan_id,
    plan_guid: r.PLAN_GUID ?? r.plan_guid,
    plan_code: r.PLAN_CODE ?? r.plan_code,
    plan_name: r.PLAN_NAME ?? r.plan_name,
    plan_type_code: r.PLAN_TYPE_CODE ?? r.plan_type_code,
    components: normalizedPlanComponentsFromRow(r.COMPONENTS_JSON ?? r.components_json)
  };
}

/**
 * Rows from COMP.V_EMPLOYEE_ELIGIBLE_PLANS (feature/compensation/plans/sql/create_view_v_employee_eligible_plans.sql).
 * Plan lines from COMP.COMP_PLAN_COMPONENTS + COMP.COMP_COMPONENTS (tenant_id = enterprise_id).
 * @param {string} employeeGuidHex 32-char uppercase hex (no 0x), for HEXTORAW
 * @returns {Promise<object[]>}
 */
export async function getEligiblePlansForEmployee(employeeGuidHex) {
  const result = await executeQuery(ELIGIBLE_PLANS_FOR_EMPLOYEE_SQL, {
    employee_guid_hex: employeeGuidHex
  });
  const rows = result.rows ?? [];
  return rows.map(mapPlanRowWithComponents);
}

/**
 * Plan lines from COMP.COMP_PLAN_COMPONENTS + COMP.COMP_COMPONENTS (tenant_id = enterprise_id).
 * @param {string} planGuidHex 32-char uppercase hex (no 0x), for HEXTORAW
 * @returns {Promise<object | null>} plan header + components, or null if no plan row
 */
export async function getPlanComponentsByPlanGuid(planGuidHex) {
  const cached = cacheGetPlan(planGuidHex);
  if (cached !== null) return cached;

  const result = await executeQuery(PLAN_COMPONENTS_BY_PLAN_GUID_SQL, {
    plan_guid_hex: planGuidHex
  });
  const r = result.rows?.[0];
  if (!r) return null;
  const mapped = mapPlanRowWithComponents(r);
  cacheSetPlan(planGuidHex, mapped);
  return mapped;
}

export async function deleteCompensationPlan(planGuid, deletedBy) {
  const hex = normalizePlanGuidHex(planGuid);
  if (!hex) {
    throw new Error(PLAN_GUID_VALIDATION_MESSAGE);
  }

  return withPlanConnection(async (connection) => {
    await connection.execute(
      DELETE_PLAN_SQL,
      {
        p_plan_guid: { val: hex, dir: oracledb.BIND_IN, type: oracledb.STRING },
        p_deleted_by: { val: String(deletedBy ?? 'SYSTEM'), dir: oracledb.BIND_IN, type: oracledb.STRING }
      },
      EXEC_OPTS
    );

    cacheInvalidatePlan(hex);
  });
}
