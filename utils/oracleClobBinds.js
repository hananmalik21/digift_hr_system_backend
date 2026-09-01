import oracledb from 'oracledb';
import { textClobBind as textClobBindCommon, nullableTextClobBind as nullableTextClobBindCommon } from '@digifyhr/common';

export { readClobOut, parseJsonClobOut } from '@digifyhr/common';

const JSON_STRING_MAX = (() => {
  const raw = process.env.DB_COMP_COMPONENTS_JSON_MAX;
  if (raw === undefined || raw === '') return 30000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
})();

const TEXT_CLOB_THRESHOLD = (() => {
  const raw = process.env.DB_TEXT_CLOB_THRESHOLD;
  if (raw === undefined || raw === '') return 32000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 32000;
  return n;
})();

/** Compensation components JSON — env-tuned STRING vs CLOB. */
export function componentsJsonClobBind(jsonString) {
  if (JSON_STRING_MAX > 0 && jsonString.length <= JSON_STRING_MAX) {
    return { val: jsonString, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: jsonString, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

export function textClobBind(value) {
  return textClobBindCommon(value, TEXT_CLOB_THRESHOLD);
}

export function nullableTextClobBind(value) {
  return nullableTextClobBindCommon(value, TEXT_CLOB_THRESHOLD);
}
