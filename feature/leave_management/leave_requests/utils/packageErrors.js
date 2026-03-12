/**
 * Map Oracle ABS_LEAVE_REQUESTS_PKG errors to user-facing messages.
 * Package raises RAISE_APPLICATION_ERROR(-20401..-20499, '...') and -20001..-20004.
 * oracledb surfaces errorNum and message (often prefixed with ORA-xxxxx).
 */

const PKG_ERROR_MIN = 20001;
const PKG_ERROR_MAX = 20004;
const VAL_ERROR_MIN = 20401;
const VAL_ERROR_MAX = 20499;
/** ABS_LEAVE_REQUESTS_LIFECYCLE_PKG — not found / tenant / bad status */
const LIFECYCLE_ERROR_MIN = 20501;
const LIFECYCLE_ERROR_MAX = 20503;
const APPROVE_ERROR_MIN = 20601;
const APPROVE_ERROR_MAX = 20605;
const UPDATE_ERROR_MIN = 20701;
const UPDATE_ERROR_MAX = 20703;
/** ABS_LEAVE_REQUESTS_QUERY_PKG — invalid GUID */
const QUERY_ERROR_NUM = 20801;

/**
 * @param {Error} err - oracledb error from connection.execute
 * @returns {{ isPackageError: boolean, message: string, statusCode: number }}
 */
export function parseLeaveRequestPackageError(err) {
  const errorNum = err?.errorNum;
  const raw = (err?.message || '').replace(/\r?\n/g, ' ').trim();
  // Strip ORA-06512 etc.; keep first line often containing our text
  const firstLine = raw.split('ORA-06512')[0].replace(/^ORA-\d+:?\s*/i, '').trim();
  const message = firstLine || raw || 'Request could not be completed.';

  if (errorNum >= PKG_ERROR_MIN && errorNum <= PKG_ERROR_MAX) {
    return { isPackageError: true, message, statusCode: 400 };
  }
  if (errorNum >= VAL_ERROR_MIN && errorNum <= VAL_ERROR_MAX) {
    return { isPackageError: true, message, statusCode: 400 };
  }
  if (errorNum >= LIFECYCLE_ERROR_MIN && errorNum <= LIFECYCLE_ERROR_MAX) {
    return { isPackageError: true, message, statusCode: 400 };
  }
  if (errorNum >= APPROVE_ERROR_MIN && errorNum <= APPROVE_ERROR_MAX) {
    return { isPackageError: true, message, statusCode: 400 };
  }
  if (errorNum >= UPDATE_ERROR_MIN && errorNum <= UPDATE_ERROR_MAX) {
    return { isPackageError: true, message, statusCode: 400 };
  }
  if (errorNum === QUERY_ERROR_NUM) {
    return { isPackageError: true, message, statusCode: 400 };
  }
  // Stub / not deployed
  if (errorNum === 20998 || errorNum === 20999) {
    return { isPackageError: true, message, statusCode: 503 };
  }
  return { isPackageError: false, message, statusCode: 500 };
}
