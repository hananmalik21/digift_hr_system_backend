import { NotFoundError } from '../../../../utils/errors/index.js';
import {
  createLookupTypeViaPackage,
  createLookupValueViaPackage,
  createLookupValuesBulkViaPackage,
  deleteLookupTypeViaPackage,
  deleteLookupValueViaPackage,
  getLookupTypeByGuid,
  getLookupValueByGuid,
  getLookupValueByGuidForEnterprise,
  listLookupTypes,
  listLookupValues,
  updateLookupTypeViaPackage,
  updateLookupValueViaPackage
} from '../model/payLookupsModel.js';

const SUCCESS_MESSAGE = 'Operation completed successfully';

function assertLookupTypeExists(row) {
  if (!row) throw new NotFoundError('Lookup type not found.');
}

function assertLookupValueExists(row) {
  if (!row) throw new NotFoundError('Lookup value not found.');
}

/**
 * @param {Record<string, unknown>} filters
 * @param {Record<string, unknown>} pagination
 */
export async function fetchLookupTypes(filters, pagination) {
  const result = await listLookupTypes(filters, pagination);
  return {
    message: 'Lookup types fetched successfully',
    data: result.data,
    meta: { pagination: result.pagination }
  };
}

/**
 * @param {string} lookupTypeGuid
 */
export async function fetchLookupTypeByGuid(lookupTypeGuid) {
  const row = await getLookupTypeByGuid(lookupTypeGuid);
  assertLookupTypeExists(row);
  return {
    message: 'Lookup type fetched successfully',
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createLookupType(payload, createdBy) {
  const created = await createLookupTypeViaPackage(payload, createdBy);
  return {
    message: 'Lookup type created successfully',
    data: {
      lookup_type_guid: created.lookup_type_guid
    }
  };
}

/**
 * @param {string} lookupTypeGuid
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateLookupType(lookupTypeGuid, payload, updatedBy) {
  assertLookupTypeExists(await getLookupTypeByGuid(lookupTypeGuid));

  await updateLookupTypeViaPackage(lookupTypeGuid, payload, updatedBy);
  const updated = await getLookupTypeByGuid(lookupTypeGuid);

  return {
    message: SUCCESS_MESSAGE,
    data: updated
  };
}

/**
 * @param {string} lookupTypeGuid
 */
export async function deleteLookupType(lookupTypeGuid) {
  assertLookupTypeExists(await getLookupTypeByGuid(lookupTypeGuid));

  await deleteLookupTypeViaPackage(lookupTypeGuid);
  return { message: 'Lookup type deleted successfully' };
}

/**
 * @param {Record<string, unknown>} filters
 * @param {Record<string, unknown>} pagination
 */
export async function fetchLookupValues(filters, pagination) {
  const result = await listLookupValues(filters, pagination);
  return {
    message: 'Lookup values fetched successfully',
    data: result.data,
    meta: { pagination: result.pagination }
  };
}

/**
 * @param {string} lookupValueGuid
 * @param {unknown} enterpriseId
 */
export async function fetchLookupValueByGuid(lookupValueGuid, enterpriseId) {
  const row = await getLookupValueByGuidForEnterprise(lookupValueGuid, enterpriseId);
  assertLookupValueExists(row);
  return {
    message: 'Lookup value fetched successfully',
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createLookupValue(payload, createdBy) {
  const created = await createLookupValueViaPackage(payload, createdBy);
  return {
    message: 'Lookup value created successfully',
    data: {
      lookup_value_guid: created.lookup_value_guid
    }
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createLookupValuesBulk(payload, createdBy) {
  const created = await createLookupValuesBulkViaPackage(payload, createdBy);
  return {
    message: 'Lookup values created successfully',
    data: {
      inserted_count: created.inserted_count,
      values: created.values
    }
  };
}

/**
 * @param {string} lookupValueGuid
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateLookupValue(lookupValueGuid, payload, updatedBy) {
  assertLookupValueExists(await getLookupValueByGuid(lookupValueGuid));

  await updateLookupValueViaPackage(lookupValueGuid, payload, updatedBy);
  const updated = await getLookupValueByGuid(lookupValueGuid);

  return {
    message: SUCCESS_MESSAGE,
    data: updated
  };
}

/**
 * @param {string} lookupValueGuid
 */
export async function deleteLookupValue(lookupValueGuid) {
  assertLookupValueExists(await getLookupValueByGuid(lookupValueGuid));

  await deleteLookupValueViaPackage(lookupValueGuid);
  return { message: 'Lookup value deleted successfully' };
}
