/**
 * Payroll Position Costing Allocations — Oracle DML + view reads.
 * Mutations: PAY.PAY_POSITION_COSTING_ALLOCATIONS_PKG
 * Reads:     PAY.V_PAY_POSITION_COSTING_ALLOCATIONS
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
import {
  PAY_VIEW_ROW_OBJECT,
  logPayViewOracleError,
  normalizePayViewGuid,
  withPayViewConnection
} from '../../utils/payViewModelUtils.js';

import {
  CREATE_RETRIEVE_FAILED_MESSAGE,
  GENERIC_TECHNICAL_ERROR,
  PKG,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  VIEW
} from '../constants/payPositionCostingAllocations.constants.js';

import { buildListBinds, COUNT_SQL, LIST_SQL } from '../utils/payPositionCostingAllocationsFilterBuilder.js';
import {
  mapPositionCostingDetailRow,
  mapPositionCostingGridRow,
  parseFlexfieldSegmentsDetailsJson,
  parseFlexfieldSegmentsJson
} from '../utils/payPositionCostingAllocationsViewUtils.js';
import { readScalarCount } from '../../element_entries/utils/payElementEntriesViewUtils.js';

const LOG_TAG = 'payPositionCostingAllocationsModel';

function extractOracleApplicationMessage(err) {
  const msg = err?.message;
  if (!msg) return null;

  const appLine = msg.match(/ORA-20\d{3}:\s*([^\n\r]+)/i);
  if (appLine?.[1]) return String(appLine[1]).trim();
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
    P_POSITION_ID                 => :position_id,
    P_FLEXFIELD_SEGMENTS_JSON    => :flexfield_segments_json,
    P_EFFECTIVE_START_DATE       => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE         => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_ALLOCATION_PERCENTAGE      => :allocation_percentage,
    P_STATUS_CODE                => :status_code,
    P_COMMENTS                   => :comments,
    P_CREATED_BY                 => :created_by,
    P_POSITION_COSTING_ID        => :position_costing_id,
    P_POSITION_COSTING_GUID      => :position_costing_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_ALLOCATION(
    P_POSITION_COSTING_GUID   => :position_costing_guid,
    P_ENTERPRISE_ID           => :enterprise_id,
    P_POSITION_ID             => :position_id,
    P_FLEXFIELD_SEGMENTS_JSON=> :flexfield_segments_json,
    P_EFFECTIVE_START_DATE   => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE     => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_ALLOCATION_PERCENTAGE  => :allocation_percentage,
    P_STATUS_CODE            => :status_code,
    P_COMMENTS               => :comments,
    P_UPDATED_BY             => :updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_ALLOCATION(
    P_POSITION_COSTING_GUID => :position_costing_guid
  );
END;`;

function buildCreateBinds(payload, createdBy) {
  return {
    enterprise_id: numberInBind(payload.enterprise_id),
    position_id: guidHexInBind(payload.position_id),
    flexfield_segments_json: clobJsonInBind(payload.flexfield_segments),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    allocation_percentage: numberInBind(payload.allocation_percentage),
    status_code: varcharInBind(payload.status_code, 50),
    comments: varcharInBind(payload.comments, 4000),
    created_by: auditInBind(createdBy),
    position_costing_id: outNumberBind(),
    position_costing_guid: outGuidHexBind()
  };
}

function buildUpdateBinds(payload, positionCostingGuid, updatedBy) {
  return {
    position_costing_guid: guidHexInBind(positionCostingGuid),
    enterprise_id: numberInBind(payload.enterprise_id),
    position_id: guidHexInBind(payload.position_id),
    flexfield_segments_json: clobJsonInBind(payload.flexfield_segments),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    allocation_percentage: numberInBind(payload.allocation_percentage),
    status_code: varcharInBind(payload.status_code, 50),
    comments: varcharInBind(payload.comments, 4000),
    updated_by: auditInBind(updatedBy)
  };
}

function buildDeleteBinds(positionCostingGuid) {
  return {
    position_costing_guid: guidHexInBind(positionCostingGuid)
  };
}

async function createPositionCostingAllocationViaPackage(payload, createdBy) {
  const binds = buildCreateBinds(payload, createdBy);
  const outBindsKeys = ['position_costing_id', 'position_costing_guid'];
  const outBinds = await executePackageMutation(CREATE_PLSQL, binds, { outBindsKeys });

  return {
    position_costing_id: normalizeOutNumber(outBinds?.position_costing_id),
    position_costing_guid: normalizeOutGuidHex(outBinds?.position_costing_guid)
  };
}

async function updatePositionCostingAllocationViaPackage(
  positionCostingGuid,
  payload,
  updatedBy
) {
  await executePackageMutation(
    UPDATE_PLSQL,
    buildUpdateBinds(payload, positionCostingGuid, updatedBy)
  );
}

async function deletePositionCostingAllocationViaPackage(positionCostingGuid) {
  await executePackageMutation(DELETE_PLSQL, buildDeleteBinds(positionCostingGuid));
}

// ----------------------------
// Reads (view queries)
// ----------------------------

const GET_SQL = `
SELECT
  POSITION_COSTING_ID,
  POSITION_COSTING_GUID,
  ENTERPRISE_ID,
  POSITION_ID,
  POSITION_CODE,
  POSITION_TITLE,
  POSITION_TITLE_EN,
  POSITION_TITLE_AR,
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
  AND LOWER(REPLACE(POSITION_COSTING_GUID, '-', '')) = LOWER(REPLACE(:guid, '-', ''))`;

const EXISTS_BY_GUID_SQL = `
SELECT 1 AS FOUND
FROM ${VIEW}
WHERE LOWER(REPLACE(POSITION_COSTING_GUID, '-', '')) = LOWER(REPLACE(:guid, '-', ''))
FETCH FIRST 1 ROW ONLY`;


export async function listPositionCostingAllocationsFromView(filters) {
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
            return mapPositionCostingGridRow(row, flexfield_segments_json, flexfield_segments_details_json);
          })
        ),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'listPositionCostingAllocationsFromView', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

export async function getPositionCostingAllocationFromViewByGuid(positionCostingGuid, enterpriseId) {
  const guid = normalizePayViewGuid(positionCostingGuid);
  if (!guid) return null;

  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_SQL,
        { enterprise_id: enterpriseId, guid },
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
      return mapPositionCostingDetailRow(row, flexfield_segments_json, flexfield_segments_details_json);
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'getPositionCostingAllocationFromViewByGuid', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

// ----------------------------
// Convenience wrappers
// ----------------------------


export async function positionCostingAllocationExistsByGuid(recordGuid) {
  const guid = normalizePayViewGuid(recordGuid);
  if (!guid) return false;

  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(EXISTS_BY_GUID_SQL, { guid }, PAY_VIEW_ROW_OBJECT);
      return Boolean(result?.rows?.[0]);
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'positionCostingAllocationExistsByGuid', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

export async function createPositionCostingAllocation(payload, createdBy) {
  const pkg = await createPositionCostingAllocationViaPackage(payload, createdBy);
  if (!pkg?.position_costing_guid) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  const row = await getPositionCostingAllocationFromViewByGuid(
    pkg.position_costing_guid,
    payload.enterprise_id
  );
  if (!row) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return { success: true, message: '', data: row };
}

export async function updatePositionCostingAllocation(positionCostingGuid, payload, updatedBy) {
  await updatePositionCostingAllocationViaPackage(positionCostingGuid, payload, updatedBy);

  const row = await getPositionCostingAllocationFromViewByGuid(
    positionCostingGuid,
    payload.enterprise_id
  );
  if (!row) {
    return { success: false, message: UPDATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return { success: true, message: '', data: row };
}

export async function deletePositionCostingAllocation(positionCostingGuid) {
  await deletePositionCostingAllocationViaPackage(positionCostingGuid);
  return { success: true, message: '', data: null };
}

