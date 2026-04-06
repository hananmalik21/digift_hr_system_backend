/**
 * @param {object} query - req.query
 * @returns {number}
 * @throws {Error} If enterprise_id is missing or invalid
 */
export function parseRequiredEnterpriseId(query) {
  const entRaw = query?.enterprise_id;
  if (entRaw === undefined || entRaw === null || String(entRaw).trim() === '') {
    throw new Error('enterprise_id is required');
  }
  const enterprise_id = parseInt(String(entRaw), 10);
  if (Number.isNaN(enterprise_id) || enterprise_id < 1) {
    throw new Error('enterprise_id must be a valid positive integer');
  }
  return enterprise_id;
}
