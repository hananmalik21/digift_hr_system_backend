/**
 * Org-unit response mapping for PAY.V_PAY_ELEMENT_REL_RULES.
 */
import { mapGuidField, toStringOrNull, VIEW_LOG_TAG } from './payElementRelRulesViewUtils.js';

export const ALL_ORG_UNITS_DISPLAY = 'All';
const HEX32_RE = /^[0-9a-fA-F]{32}$/;

/**
 * True when Oracle ORG_UNIT_ID (RAW) is null / empty.
 * @param {unknown} value
 */
export function isNullOrgUnitId(value) {
  if (value == null) return true;
  if (Buffer.isBuffer(value) && value.length === 0) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Read Oracle CLOB / Lob / string / Buffer to text.
 * @param {unknown} value
 * @returns {Promise<string|null>}
 */
export async function readClobValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value.getData === 'function') {
    const p = value.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => value.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return null;
}

/**
 * Normalize one hierarchy node to `{ name, level_code }`.
 * @param {unknown} item
 * @returns {{ name: string|null, level_code: string|null }|null}
 */
export function normalizeOrgUnitHierarchyItem(item) {
  if (item == null || typeof item !== 'object' || Array.isArray(item)) return null;
  const name = toStringOrNull(item.name ?? item.NAME);
  const level_code = toStringOrNull(item.level_code ?? item.LEVEL_CODE);
  if (name == null && level_code == null) return null;
  return { name, level_code };
}

function mapHierarchyItems(items) {
  return items.map(normalizeOrgUnitHierarchyItem).filter(Boolean);
}

/**
 * Parse ORG_UNIT_HIERARCHY_JSON into hierarchy nodes.
 * On parse failure, logs the technical error and returns [].
 * @param {unknown} raw
 * @returns {Array<{ name: string|null, level_code: string|null }>}
 */
export function parseOrgUnitHierarchyJson(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return mapHierarchyItems(raw);
  if (typeof raw !== 'string') return [];

  const text = raw.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? mapHierarchyItems(parsed) : [];
  } catch (err) {
    console.error(`[${VIEW_LOG_TAG}] parseOrgUnitHierarchyJson failed`, err?.message || err);
    return [];
  }
}

/**
 * Read + parse org-unit hierarchy CLOB safely.
 * @param {unknown} value
 * @returns {Promise<Array<{ name: string|null, level_code: string|null }>>}
 */
export async function parseOrgUnitHierarchyFromDbValue(value) {
  if (Array.isArray(value)) return parseOrgUnitHierarchyJson(value);
  return parseOrgUnitHierarchyJson(await readClobValue(value));
}

/**
 * Prefer a friendly org-unit name; if display is a raw hex GUID, use the leaf hierarchy name.
 * @param {unknown} display
 * @param {Array<{ name: string|null, level_code: string|null }>} hierarchy
 */
export function resolveOrgUnitDisplay(display, hierarchy = []) {
  const current = toStringOrNull(display);
  const leafName =
    hierarchy.length > 0 ? toStringOrNull(hierarchy[hierarchy.length - 1]?.name) : null;
  if (current && HEX32_RE.test(current)) return leafName ?? current;
  return current ?? leafName;
}

/**
 * Public org-unit fields for a relationship-rule view row.
 * When ORG_UNIT_ID is null: guid null, display "All", hierarchy [].
 * @param {{
 *   orgUnitId: unknown,
 *   orgUnitGuid: unknown,
 *   orgUnitDisplay: unknown,
 *   hierarchyJson: unknown
 * }} fields
 */
export async function resolveOrgUnitApiFields({
  orgUnitId,
  orgUnitGuid,
  orgUnitDisplay,
  hierarchyJson
}) {
  if (isNullOrgUnitId(orgUnitId)) {
    return {
      org_unit_guid: null,
      org_unit_display: ALL_ORG_UNITS_DISPLAY,
      org_unit_hierarchy: []
    };
  }

  const hierarchy = await parseOrgUnitHierarchyFromDbValue(hierarchyJson);
  return {
    org_unit_guid: mapGuidField(orgUnitGuid),
    org_unit_display: resolveOrgUnitDisplay(orgUnitDisplay, hierarchy),
    org_unit_hierarchy: hierarchy
  };
}
