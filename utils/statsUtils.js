import db from '../config/db.js';
import oracledb from 'oracledb';

/** Coerce Oracle aggregate/count values to a non-negative integer. */
export function toCount(value) {
  return Number(value ?? 0) || 0;
}

/** Compute fill rate percentage; returns 0 when total is zero. */
export function toFillRate(filled, total, decimals = 1) {
  const totalCount = toCount(total);
  if (totalCount <= 0) return 0;
  const filledCount = toCount(filled);
  const factor = 10 ** decimals;
  return Math.round((filledCount / totalCount) * 100 * factor) / factor;
}

/** Read a numeric column from an Oracle row (upper or lower case key). */
export function rowCount(row, column) {
  const upper = column.toUpperCase();
  const lower = column.toLowerCase();
  return toCount(row?.[upper] ?? row?.[lower]);
}

/** Execute a read-only stats query with object row output. */
export async function executeStatsQuery(sql, bindParams = []) {
  return db.executeQuery(sql, bindParams, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
}

/** Build position fill metrics from summed headcount values. */
export function buildPositionFillStats(totalPositions, filledPositions) {
  const total = toCount(totalPositions);
  const filled = toCount(filledPositions);
  const vacant = Math.max(total - filled, 0);

  return {
    total_positions: total,
    filled_positions: filled,
    vacant_positions: vacant,
    fill_rate: toFillRate(filled, total),
  };
}
