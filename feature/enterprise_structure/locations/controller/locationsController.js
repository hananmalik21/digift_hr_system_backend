import { listActiveLocationsService } from '../services/locations.service.js';
import {
  sendLocationsList,
  sendLocationsServerError
} from '../view/locationsView.js';

/**
 * GET /api/locations
 * List active locations from ENT.V_ACTIVE_LOCATIONS, ordered by LOCATION_NAME ASC.
 */
export async function listLocationsHandler(req, res) {
  try {
    const data = await listActiveLocationsService();
    return sendLocationsList(res, data);
  } catch (error) {
    return sendLocationsServerError(res, error);
  }
}
