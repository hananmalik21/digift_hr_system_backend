export function isTruthyEnvFlag(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/** Opt-in: COMP_LOG_COMPONENT_FLAGS=1|true|yes logs edit payload rows before Oracle. */
export function shouldLogEmployeeCompEditComponents() {
  return isTruthyEnvFlag(process.env.COMP_LOG_COMPONENT_FLAGS);
}
