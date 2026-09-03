import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { toSnakeCaseDeep } from '../../shared/entDbClient.js';
import { LIST_ACTIVE_LOCATIONS_SQL } from '../utils/locationsQuery.js';

/**
 * Read-only repository for ENT.V_ACTIVE_LOCATIONS (no ENT package — shared pool SELECT).
 */
export async function listActiveLocationsFromView() {
  const result = await db.executeQuery(LIST_ACTIVE_LOCATIONS_SQL, {}, {
    outFormat: oracledb.OUT_FORMAT_OBJECT
  });
  if (!result.rows) return [];
  const rows = toSnakeCaseDeep(result.rows);
  return Array.isArray(rows) ? rows : [];
}
