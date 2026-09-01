import { bufferToHex, normalizeApiGuidString } from '@digifyhr/common';

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return null;
}

function mapPoolGuid(row) {
  const raw = pick(row, 'POOL_GUID', 'pool_guid');
  return normalizeApiGuidString(raw) ?? bufferToHex(raw);
}

function mapCandidateCount(row) {
  const raw = pick(row, 'CANDIDATE_COUNT', 'candidate_count');
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapTalentPoolListRow(row) {
  return {
    pool_guid: mapPoolGuid(row),
    pool_name: pick(row, 'POOL_NAME', 'pool_name'),
    candidate_count: mapCandidateCount(row)
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapCandidateTalentPoolRow(row) {
  const selected = pick(row, 'SELECTED_FLAG', 'selected_flag');
  const flag = selected == null ? 'N' : String(selected).trim().toUpperCase().slice(0, 1);

  return {
    ...mapTalentPoolListRow(row),
    selected_flag: flag === 'Y' ? 'Y' : 'N'
  };
}
