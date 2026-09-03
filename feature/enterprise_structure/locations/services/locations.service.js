import { listActiveLocationsFromView } from '../repository/locations.repository.js';
import { mapLocationRows } from '../utils/locationsQuery.js';

/**
 * @returns {Promise<Array<{ location_id: number|null, country_code: string|null, location_name: string|null }>>}
 */
export async function listActiveLocationsService() {
  const rows = await listActiveLocationsFromView();
  return mapLocationRows(rows);
}
