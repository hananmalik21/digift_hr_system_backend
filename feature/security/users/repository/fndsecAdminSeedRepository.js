import oracledb from 'oracledb';
import db from '../../../../config/db.js';

const ADMIN_SEED_PKG = 'FNDSEC.FNDSEC_ADMIN_SEED_PKG';

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    const p = val.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => val.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return String(val);
}

function parseResultJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {object} input
 * @returns {Promise<{ ok: boolean, created: boolean, userGuid: string|null, message: string }>}
 */
export async function ensurePlatformAdminViaPackage(input) {
  const json = JSON.stringify(input ?? {});
  const plsql = `
BEGIN
  ${ADMIN_SEED_PKG}.ENSURE_PLATFORM_ADMIN(
    P_INPUT_JSON => :p_input_json,
    P_SUCCESS    => :p_success,
    P_MESSAGE    => :p_message,
    P_CREATED    => :p_created,
    P_USER_GUID  => :p_user_guid
  );
END;`;

  const result = await withConnection((connection) =>
    connection.execute(
      plsql,
      {
        p_input_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
        p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
        p_created: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
        p_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    )
  );

  const ob = result?.outBinds || {};
  const success = (normalizeOutString(ob.p_success) ?? 'N').toUpperCase() === 'Y';
  const created = (normalizeOutString(ob.p_created) ?? 'N').toUpperCase() === 'Y';
  const message = normalizeOutString(ob.p_message) ?? '';
  const userGuid = normalizeOutString(ob.p_user_guid);

  return {
    ok: success,
    created,
    userGuid: userGuid || null,
    message
  };
}

/**
 * @param {object} input
 * @returns {Promise<{ ok: boolean, message: string, enterpriseAdmin: object|null, superAdmin: object|null }>}
 */
export async function seedPlatformAdminsViaPackage(input) {
  const json = JSON.stringify(input ?? {});
  const plsql = `
BEGIN
  ${ADMIN_SEED_PKG}.SEED_PLATFORM_ADMINS(
    P_INPUT_JSON  => :p_input_json,
    P_SUCCESS     => :p_success,
    P_MESSAGE     => :p_message,
    P_RESULT_JSON => :p_result_json
  );
END;`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      plsql,
      {
        p_input_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
        p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
        p_result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
      },
      { autoCommit: true }
    );

    const ob = result?.outBinds || {};
    const success = (normalizeOutString(ob.p_success) ?? 'N').toUpperCase() === 'Y';
    const message = normalizeOutString(ob.p_message) ?? '';
    const resultJsonStr = await readClobOut(ob.p_result_json);
    const parsed = parseResultJson(resultJsonStr);

    const mapBlock = (block) => {
      if (!block || typeof block !== 'object') return null;
      return {
        ok: String(block.ok ?? 'N').toUpperCase() === 'Y',
        created: String(block.created ?? 'N').toUpperCase() === 'Y',
        userGuid: block.user_guid ?? block.userGuid ?? null,
        message: block.message ?? null
      };
    };

    return {
      ok: success,
      message,
      enterpriseAdmin: mapBlock(parsed?.enterprise_admin),
      superAdmin: mapBlock(parsed?.super_admin)
    };
  });
}

function mapEnterpriseBackfillRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    enterpriseId: row.enterprise_id ?? row.enterpriseId ?? null,
    ok: String(row.ok ?? 'N').toUpperCase() === 'Y',
    created: String(row.created ?? 'N').toUpperCase() === 'Y',
    userGuid: row.user_guid ?? row.userGuid ?? null,
    message: row.message ?? null
  };
}

/**
 * @param {object} input
 * @returns {Promise<{ ok: boolean, message: string, totalMissing: number, processed: number, created: number, failed: number, enterprises: object[] }>}
 */
export async function backfillEnterpriseAdminsViaPackage(input) {
  const json = JSON.stringify(input ?? {});
  const plsql = `
BEGIN
  ${ADMIN_SEED_PKG}.BACKFILL_ENTERPRISE_ADMINS(
    P_INPUT_JSON  => :p_input_json,
    P_SUCCESS     => :p_success,
    P_MESSAGE     => :p_message,
    P_RESULT_JSON => :p_result_json
  );
END;`;

  const result = await withConnection((connection) =>
    connection.execute(
      plsql,
      {
        p_input_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
        p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
        p_result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
      },
      { autoCommit: true }
    )
  );

  const ob = result?.outBinds || {};
  const success = (normalizeOutString(ob.p_success) ?? 'N').toUpperCase() === 'Y';
  const message = normalizeOutString(ob.p_message) ?? '';
  const resultJsonStr = await readClobOut(ob.p_result_json);
  const parsed = parseResultJson(resultJsonStr);
  const enterprises = Array.isArray(parsed?.enterprises)
    ? parsed.enterprises.map(mapEnterpriseBackfillRow).filter(Boolean)
    : [];

  return {
    ok: success,
    message,
    totalMissing: Number(parsed?.total_missing ?? 0),
    processed: Number(parsed?.processed ?? 0),
    created: Number(parsed?.created ?? 0),
    failed: Number(parsed?.failed ?? 0),
    activeOnly: String(parsed?.active_only ?? 'true').toLowerCase() !== 'false',
    enterprises
  };
}
