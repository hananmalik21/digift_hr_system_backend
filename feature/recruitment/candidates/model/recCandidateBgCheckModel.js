import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToHex, hexToRawBuffer } from '../../../../utils/guidUtils.js';

const PKG = 'REC.CANDIDATE_BG_CHECK_PKG';
const CREATE_PROC = `${PKG}.CREATE_BACKGROUND_CHECK`;

const GENERIC_ERROR_MESSAGE = 'Unable to process background check. Please try again.';

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

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function ynOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'Y' || s === 'N') return s;
  return s.slice(0, 1) === 'Y' ? 'Y' : 'N';
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeOutNumber(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutNumber(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeOutGuidHex(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutGuidHex(v[0]);
  return bufferToHex(v);
}

function parseCreateOut(outBinds) {
  const ob = outBinds || {};
  return {
    background_check_id: normalizeOutNumber(ob.p_background_check_id),
    background_check_guid: normalizeOutGuidHex(ob.p_background_check_guid),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id           => :p_enterprise_id,
    p_candidate_guid          => :p_candidate_guid,
    p_provider                => :p_provider,
    p_check_type              => :p_check_type,
    p_employment_ver_flag     => :p_employment_ver_flag,
    p_education_ver_flag      => :p_education_ver_flag,
    p_criminal_record_flag    => :p_criminal_record_flag,
    p_credit_check_flag       => :p_credit_check_flag,
    p_drug_testing_flag       => :p_drug_testing_flag,
    p_priority                => :p_priority,
    p_additional_notes        => :p_additional_notes,
    p_consent_obtained_flag   => :p_consent_obtained_flag,
    p_created_by              => :p_created_by,
    p_background_check_id     => :p_background_check_id,
    p_background_check_guid   => :p_background_check_guid,
    p_status                  => :p_status,
    p_message                 => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ background_check_id: number|null, background_check_guid: string|null, status: string, message: string }>}
 */
export async function createBackgroundCheckViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: {
      val: hexToRawBuffer(b.candidate_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_provider: { val: strOrNull(b.provider), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_check_type: { val: strOrNull(b.check_type), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_employment_ver_flag: {
      val: ynOrNull(b.employment_ver_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_education_ver_flag: {
      val: ynOrNull(b.education_ver_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_criminal_record_flag: {
      val: ynOrNull(b.criminal_record_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_credit_check_flag: {
      val: ynOrNull(b.credit_check_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_drug_testing_flag: {
      val: ynOrNull(b.drug_testing_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_priority: { val: strOrNull(b.priority), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 20 },
    p_additional_notes: {
      val: strOrNull(b.additional_notes),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_consent_obtained_flag: {
      val: ynOrNull(b.consent_obtained_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_background_check_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_background_check_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parseCreateOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidateBgCheckModel] CREATE_BACKGROUND_CHECK failed:', err?.errorNum ?? '', '[redacted]');
    return {
      background_check_id: null,
      background_check_guid: null,
      status: 'ERROR',
      message: GENERIC_ERROR_MESSAGE
    };
  }
}
