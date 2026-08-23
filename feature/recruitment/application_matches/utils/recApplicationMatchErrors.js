/** Detect missing REC.REC_APPLICATION_MATCHES / V_APPLICATION_MATCH (ORA-00942 / ORA-00904). */
export function isMatchStoreUnavailableError(err) {
  const num = Number(err?.errorNum ?? err?.oracleError?.errorNum);
  const message = String(
    err?.technicalMessage ?? err?.oracleError?.message ?? err?.message ?? ''
  );
  const upper = message.toUpperCase();
  const mentionsStore =
    upper.includes('REC_APPLICATION_MATCHES') || upper.includes('V_APPLICATION_MATCH');
  if (num === 942 || upper.includes('ORA-00942')) return true;
  if (mentionsStore && (num === 904 || upper.includes('ORA-00904'))) return true;
  return false;
}
