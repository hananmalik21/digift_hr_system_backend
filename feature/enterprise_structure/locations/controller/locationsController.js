import { listActiveLocationsService } from '../services/locations.service.js';
import {
  sendLocationsList,
  sendLocationsServerError
} from '../view/locationsView.js';

/**
 * GET /api/locations
 * List active locations from ENT.V_LOCATIONS (ACTIVE_FLAG = 'Y'), ordered by LOCATION_NAME ASC.
 * Public — no JWT required.
 */
export async function listLocationsHandler(req, res) {
  try {
    const data = await listActiveLocationsService();
    return sendLocationsList(res, data);
  } catch (error) {
    return sendLocationsServerError(res, error);
  }
}
