/**
 * Shared environment / runtime flags.
 *
 * Centralizing these prevents the same `process.env.NODE_ENV !== 'production'`
 * literal from being duplicated in every controller / model.
 *
 * Keep this module dependency-free so it can be imported from anywhere
 * (controllers, models, middleware, tests).
 */

const RAW_NODE_ENV = String(process.env.NODE_ENV || '').trim().toLowerCase();

/** True when running outside of production (used to gate verbose logging & raw error surfacing). */
export const IS_DEV_MODE = RAW_NODE_ENV !== 'production';

/** True when running in production. Convenience inverse of IS_DEV_MODE. */
export const IS_PROD_MODE = !IS_DEV_MODE;

/** Resolved NODE_ENV string (lower-cased, trimmed, empty string when unset). */
export const NODE_ENV = RAW_NODE_ENV;
