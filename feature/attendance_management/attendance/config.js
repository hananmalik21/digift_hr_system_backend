/**
 * Attendance feature config.
 * source_type must be one of: SYSTEM, ROSTER, API, IMPORT (default API).
 * log_type for location must be CHECK_IN or CHECK_OUT.
 */
export const ALLOWED_SOURCE_TYPES = ['SYSTEM', 'ROSTER', 'API', 'IMPORT'];
export const ALLOWED_LOG_TYPES = ['CHECK_IN', 'CHECK_OUT'];
export const DEFAULT_SOURCE_TYPE = 'API';
