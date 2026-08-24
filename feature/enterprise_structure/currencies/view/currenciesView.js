/** Currencies API response helpers — never leak Oracle/DB details. */

export function sendCurrenciesList(res, data) {
  return res.status(200).json({
    success: true,
    data: Array.isArray(data) ? data : []
  });
}

export function sendCurrenciesServerError(res, error = null) {
  if (error) {
    console.error('Failed to retrieve currencies:', error?.message || error);
  }

  return res.status(500).json({
    success: false,
    message: 'Failed to retrieve currencies'
  });
}
