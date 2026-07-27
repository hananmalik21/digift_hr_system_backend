/**
 * Payroll Costing Allocations — Oracle DML + view reads.
 * Mutations: PAY.PAY_COSTING_ALLOCATIONS_PKG
 * Reads:     PAY.V_PAY_COSTING_ALLOCATIONS
 */
import db from '../../../../config/db.js';
import {
  auditInBind,
  clobJsonInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  numberInBind,
  outGuidHexBind,
  outNumberBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { withPayViewConnection, logPayViewOracleError, PAY_VIEW_ROW_OBJECT, normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

import {
  CREATE_RETRIEVE_FAILED_MESSAGE,
  GENERIC_TECHNICAL_ERROR,
  PKG,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  VIEW
} from '../constants/payCostingAllocations.constants.js';
import { buildListBinds, COUNT_SQL, LIST_SQL } from '../utils/payCostingAllocationsFilterBuilder.js';
import {
  mapCostingAllocationDetailRow,
  mapCostingAllocationGridRow,
  parseFlexfieldSegmentsDetailsJson,
  parseFlexfieldSegmentsJson
} from '../utils/payCostingAllocationsViewUtils.js';
import { readScalarCount } from '../../element_entries/utils/payElementEntriesViewUtils.js';

const LOG_TAG = 'payCostingAllocationsModel';

function extractOracleApplicationMessage(err) {
  const msg = err?.message;
  if (!msg) return null;

  // Prefer the actual ORA-20xxx line payload (user-defined errors from PL/SQL packages).
  const appLine = msg.match(/ORA-20\d{3}:\s*([^\n\r]+)/i);
  if (appLine?.[1]) return String(appLine[1]).trim();

  // For non-application Oracle errors, keep DatabaseError's built-in mapping.
  return null;
}

async function executePackageMutation(plsql, binds, { outBindsKeys = null } = {}) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    await connection.commit();

    if (!outBindsKeys) return result?.outBinds ?? {};
    return outBindsKeys.reduce((acc, k) => {
      acc[k] = result?.outBinds?.[k];
      return acc;
    }, {});
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}

    const userMessage = extractOracleApplicationMessage(err);
    const dbError = new DatabaseError(GENERIC_TECHNICAL_ERROR, err, userMessage);
    if (userMessage) {
      dbError.statusCode = /not found/i.test(userMessage) ? 404 : 400;
    }
    throw dbError;
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

// ----------------------------
// Mutations (package calls)
// ----------------------------

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_ALLOCATION(
    P_ENTERPRISE_ID               => :enterprise_id,
    P_EMPLOYEE_ID                 => :employee_id,
    P_FLEXFIELD_SEGMENTS_JSON    => :flexfield_segments_json,
    P_EFFECTIVE_START_DATE       => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE         => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_ALLOCATION_PERCENTAGE      => :allocation_percentage,
    P_STATUS_CODE                => :status_code,
    P_COMMENTS                   => :comments,
    P_CREATED_BY                 => :created_by,
    P_COSTING_ALLOCATION_ID     => :costing_allocation_id,
    P_COSTING_ALLOCATION_GUID   => :costing_allocation_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_ALLOCATION(
    P_COSTING_ALLOCATION_GUID  => :costing_allocation_guid,
    P_ENTERPRISE_ID             => :enterprise_id,
    P_EMPLOYEE_ID               => :employee_id,
    P_FLEXFIELD_SEGMENTS_JSON  => :flexfield_segments_json,
    P_EFFECTIVE_START_DATE     => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE       => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_ALLOCATION_PERCENTAGE     => :allocation_percentage,
    P_STATUS_CODE              => :status_code,
    P_COMMENTS                 => :comments,
    P_UPDATED_BY               => :updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_ALLOCATION(
    P_COSTING_ALLOCATION_GUID => :costing_allocation_guid
  );
END;`;

function buildCreateBinds(payload, createdBy) {
  return {
    enterprise_id: numberInBind(payload.enterprise_id),
    employee_id: numberInBind(payload.employee_id),
    flexfield_segments_json: clobJsonInBind(payload.flexfield_segments),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    allocation_percentage: numberInBind(payload.allocation_percentage),
    status_code: varcharInBind(payload.status_code, 50),
    comments: varcharInBind(payload.comments, 4000),
    created_by: auditInBind(createdBy),
    costing_allocation_id: outNumberBind(),
    costing_allocation_guid: outGuidHexBind()
  };
}

function buildUpdateBinds(payload, costingAllocationGuid, updatedBy) {
  return {
    costing_allocation_guid: guidHexInBind(costingAllocationGuid),
    enterprise_id: numberInBind(payload.enterprise_id),
    employee_id: numberInBind(payload.employee_id),
    flexfield_segments_json: clobJsonInBind(payload.flexfield_segments),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    allocation_percentage: numberInBind(payload.allocation_percentage),
    status_code: varcharInBind(payload.status_code, 50),
    comments: varcharInBind(payload.comments, 4000),
    updated_by: auditInBind(updatedBy)
  };
}

function buildDeleteBinds(costingAllocationGuid) {
  return {
    costing_allocation_guid: guidHexInBind(costingAllocationGuid)
  };
}

async function createCostingAllocationViaPackage(payload, createdBy) {
  const binds = buildCreateBinds(payload, createdBy);
  const outBindsKeys = ['costing_allocation_id', 'costing_allocation_guid'];
  const outBinds = await executePackageMutation(CREATE_PLSQL, binds, { outBindsKeys });

  return {
    costing_allocation_id: normalizeOutNumber(outBinds?.costing_allocation_id),
    costing_allocation_guid: normalizeOutGuidHex(outBinds?.costing_allocation_guid)
  };
}

async function updateCostingAllocationViaPackage(costingAllocationGuid, payload, updatedBy) {
  await executePackageMutation(
    UPDATE_PLSQL,
    buildUpdateBinds(payload, costingAllocationGuid, updatedBy)
  );
}

async function deleteCostingAllocationViaPackage(costingAllocationGuid) {
  await executePackageMutation(DELETE_PLSQL, buildDeleteBinds(costingAllocationGuid));
}

// ----------------------------
// Reads (view queries)
// ----------------------------

const GET_SQL = `
SELECT
  COSTING_ALLOCATION_ID,
  COSTING_ALLOCATION_GUID,
  ENTERPRISE_ID,
  EMPLOYEE_ID,
  EMPLOYEE_GUID,
  EMPLOYEE_NAME,
  ASSIGNMENT_ID,
  ASSIGNMENT_NUMBER,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  ALLOCATION_PERCENTAGE,
  STATUS_CODE,
  COMMENTS,
  CREATED_BY,
  CREATION_DATE,
  LAST_UPDATED_BY,
  LAST_UPDATE_DATE
FROM ${VIEW}
WHERE ENTERPRISE_ID = :enterprise_id
  AND LOWER(REPLACE(COSTING_ALLOCATION_GUID, '-', '')) = LOWER(REPLACE(:guid, '-', ''))`;

const EXISTS_BY_GUID_SQL = `
SELECT 1 AS FOUND
FROM ${VIEW}
WHERE LOWER(REPLACE(COSTING_ALLOCATION_GUID, '-', '')) = LOWER(REPLACE(:guid, '-', ''))
FETCH FIRST 1 ROW ONLY`;


export async function listCostingAllocationsFromView(filters) {
  const listBinds = buildListBinds(filters);
  const binds = {
    ...listBinds,
    offset: filters.offset,
    limit: filters.limit
  };

  try {
    return await withPayViewConnection(async (connection) => {
      const [countResult, dataResult] = await Promise.all([
        connection.execute(COUNT_SQL, listBinds, PAY_VIEW_ROW_OBJECT),
        connection.execute(LIST_SQL, binds, PAY_VIEW_ROW_OBJECT)
      ]);

      return {
        rows: await Promise.all(
          (dataResult.rows || []).map(async (row) => {
            const flexfield_segments_json = await parseFlexfieldSegmentsJson(
              row.FLEXFIELD_SEGMENTS_JSON ?? row.flexfield_segments_json
            );
            const flexfield_segments_details_json = await parseFlexfieldSegmentsDetailsJson(
              row.FLEXFIELD_SEGMENTS_DETAILS_JSON ?? row.flexfield_segments_details_json
            );
            return mapCostingAllocationGridRow(row, flexfield_segments_json, flexfield_segments_details_json);
          })
        ),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'listCostingAllocationsFromView', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

export async function getCostingAllocationFromViewByGuid(costingAllocationGuid, enterpriseId) {
  const guid = normalizePayViewGuid(costingAllocationGuid);
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_SQL,
        {
          enterprise_id: enterpriseId,
          guid
        },
        PAY_VIEW_ROW_OBJECT
      );
      const row = result?.rows?.[0];
      if (!row) return null;

      const flexfield_segments_json = await parseFlexfieldSegmentsJson(
        row.FLEXFIELD_SEGMENTS_JSON ?? row.flexfield_segments_json
      );
      const flexfield_segments_details_json = await parseFlexfieldSegmentsDetailsJson(
        row.FLEXFIELD_SEGMENTS_DETAILS_JSON ?? row.flexfield_segments_details_json
      );
      return mapCostingAllocationDetailRow(row, flexfield_segments_json, flexfield_segments_details_json);
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'getCostingAllocationFromViewByGuid', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

// ----------------------------
// Convenience helpers
// ----------------------------


export async function costingAllocationExistsByGuid(recordGuid) {
  const guid = normalizePayViewGuid(recordGuid);
  if (!guid) return false;

  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(EXISTS_BY_GUID_SQL, { guid }, PAY_VIEW_ROW_OBJECT);
      return Boolean(result?.rows?.[0]);
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'costingAllocationExistsByGuid', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

export async function createCostingAllocation(payload, createdBy, { retrieveFromView = true } = {}) {
  const pkg = await createCostingAllocationViaPackage(payload, createdBy);
  if (!pkg?.costing_allocation_guid) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  if (!retrieveFromView) {
    return {
      success: true,
      message: '',
      data: {
        costing_allocation_id: pkg.costing_allocation_id,
        costing_allocation_guid: normalizePayViewGuid(pkg.costing_allocation_guid)
      }
    };
  }

  const row = await getCostingAllocationFromViewByGuid(pkg.costing_allocation_guid, payload.enterprise_id);
  if (!row) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return { success: true, message: '', data: row };
}

export async function updateCostingAllocation(costingAllocationGuid, payload, updatedBy) {
  await updateCostingAllocationViaPackage(costingAllocationGuid, payload, updatedBy);
  const row = await getCostingAllocationFromViewByGuid(
    costingAllocationGuid,
    payload.enterprise_id
  );
  if (!row) {
    return { success: false, message: UPDATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }
  return { success: true, message: '', data: row };
}

export async function deleteCostingAllocation(costingAllocationGuid) {
  await deleteCostingAllocationViaPackage(costingAllocationGuid);
  return { success: true, message: '', data: null };
}

