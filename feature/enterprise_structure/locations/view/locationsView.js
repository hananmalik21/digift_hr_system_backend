/** Locations API response helpers — never leak Oracle/DB details. */

export function sendLocationsList(res, data) {
  return res.status(200).json({
    success: true,
    data: Array.isArray(data) ? data : []
  });
}

export function sendLocationsServerError(res, error = null) {
  if (error) {
    console.error('Failed to retrieve locations:', error?.message || error);
  }

  return res.status(500).json({
    success: false,
    message: 'Failed to retrieve locations'
  });
}
