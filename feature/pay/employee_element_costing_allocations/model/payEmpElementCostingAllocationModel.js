/**
 * Payroll Employee Element Costing Allocations — Oracle DML + view reads.
 * Mutations: PAY.PAY_EMP_ELEMENT_COSTING_PKG
 * Reads:     PAY.V_PAY_EMP_ELEMENT_COSTING_ALLOCATIONS
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
import { readScalarCount } from '../../element_entries/utils/payElementEntriesViewUtils.js';

import {
  CREATE_RETRIEVE_FAILED_MESSAGE,
  GENERIC_TECHNICAL_ERROR,
  PKG,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  VIEW
} from '../constants/payEmpElementCostingAllocations.constants.js';

import { buildListBinds, COUNT_SQL, LIST_SQL } from '../utils/payEmpElementCostingAllocationsFilterBuilder.js';
import {
  mapEmpElementCostingDetailRow,
  mapEmpElementCostingGridRow,
  parseFlexfieldSegmentsDetailsJson,
  parseFlexfieldSegmentsJson
} from '../utils/payEmpElementCostingAllocationsViewUtils.js';

const LOG_TAG = 'payEmpElementCostingAllocationsModel';

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

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_ALLOCATION(
    P_ENTERPRISE_ID              => :enterprise_id,
    P_EMPLOYEE_ID                => :employee_id,
    P_ELEMENT_ID                 => :element_id,
    P_FLEXFIELD_SEGMENTS_JSON    => :flexfield_segments_json,
    P_EFFECTIVE_START_DATE       => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE         => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_ALLOCATION_PERCENTAGE      => :allocation_percentage,
    P_STATUS_CODE                => :status_code,
    P_COMMENTS                   => :comments,
    P_CREATED_BY                 => :created_by,
    P_EMP_ELEMENT_COSTING_ID     => :emp_element_costing_id,
    P_EMP_ELEMENT_COSTING_GUID   => :emp_element_costing_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_ALLOCATION(
    P_EMP_ELEMENT_COSTING_GUID   => :emp_element_costing_guid,
    P_ENTERPRISE_ID              => :enterprise_id,
    P_EMPLOYEE_ID                => :employee_id,
    P_ELEMENT_ID                 => :element_id,
    P_FLEXFIELD_SEGMENTS_JSON    => :flexfield_segments_json,
    P_EFFECTIVE_START_DATE       => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE         => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_ALLOCATION_PERCENTAGE      => :allocation_percentage,
    P_STATUS_CODE                => :status_code,
    P_COMMENTS                   => :comments,
    P_UPDATED_BY                 => :updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_ALLOCATION(
    P_EMP_ELEMENT_COSTING_GUID => :emp_element_costing_guid
  );
END;`;

function buildCreateBinds(payload, createdBy) {
  return {
    enterprise_id: numberInBind(payload.enterprise_id),
    employee_id: numberInBind(payload.employee_id),
    element_id: numberInBind(payload.element_id),
    flexfield_segments_json: clobJsonInBind(payload.flexfield_segments),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    allocation_percentage: numberInBind(payload.allocation_percentage),
    status_code: varcharInBind(payload.status_code, 50),
    comments: varcharInBind(payload.comments, 4000),
    created_by: auditInBind(createdBy),
    emp_element_costing_id: outNumberBind(),
    emp_element_costing_guid: outGuidHexBind()
  };
}

function buildUpdateBinds(payload, empElementCostingGuid, updatedBy) {
  return {
    emp_element_costing_guid: guidHexInBind(empElementCostingGuid),
    enterprise_id: numberInBind(payload.enterprise_id),
    employee_id: numberInBind(payload.employee_id),
    element_id: numberInBind(payload.element_id),
    flexfield_segments_json: clobJsonInBind(payload.flexfield_segments),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    allocation_percentage: numberInBind(payload.allocation_percentage),
    status_code: varcharInBind(payload.status_code, 50),
    comments: varcharInBind(payload.comments, 4000),
    updated_by: auditInBind(updatedBy)
  };
}

function buildDeleteBinds(empElementCostingGuid) {
  return {
    emp_element_costing_guid: guidHexInBind(empElementCostingGuid)
  };
}

async function createEmpElementCostingAllocationViaPackage(payload, createdBy) {
  const binds = buildCreateBinds(payload, createdBy);
  const outBindsKeys = ['emp_element_costing_id', 'emp_element_costing_guid'];
  const outBinds = await executePackageMutation(CREATE_PLSQL, binds, { outBindsKeys });

  return {
    emp_element_costing_id: normalizeOutNumber(outBinds?.emp_element_costing_id),
    emp_element_costing_guid: normalizeOutGuidHex(outBinds?.emp_element_costing_guid)
  };
}

async function updateEmpElementCostingAllocationViaPackage(
  empElementCostingGuid,
  payload,
  updatedBy
) {
  await executePackageMutation(
    UPDATE_PLSQL,
    buildUpdateBinds(payload, empElementCostingGuid, updatedBy)
  );
}

async function deleteEmpElementCostingAllocationViaPackage(empElementCostingGuid) {
  await executePackageMutation(DELETE_PLSQL, buildDeleteBinds(empElementCostingGuid));
}

const GET_SQL = `
SELECT
  EMP_ELEMENT_COSTING_ID,
  EMP_ELEMENT_COSTING_GUID,
  ENTERPRISE_ID,
  EMPLOYEE_ID,
  EMPLOYEE_GUID,
  EMPLOYEE_NAME,
  ELEMENT_ID,
  ELEMENT_GUID,
  ELEMENT_CODE,
  ELEMENT_NAME,
  ELEMENT_DESCRIPTION,
  CATEGORY_CODE,
  CLASSIFICATION_CODE,
  SECONDARY_CLASSIFICATION,
  LEGISLATIVE_DATA_GROUP,
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
  AND LOWER(REPLACE(EMP_ELEMENT_COSTING_GUID, '-', '')) = LOWER(REPLACE(:guid, '-', ''))`;

const EXISTS_BY_GUID_SQL = `
SELECT 1 AS FOUND
FROM ${VIEW}
WHERE LOWER(REPLACE(EMP_ELEMENT_COSTING_GUID, '-', '')) = LOWER(REPLACE(:guid, '-', ''))
FETCH FIRST 1 ROW ONLY`;


export async function listEmpElementCostingAllocationsFromView(filters) {
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
            return mapEmpElementCostingGridRow(row, flexfield_segments_json, flexfield_segments_details_json);
          })
        ),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'listEmpElementCostingAllocationsFromView', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

export async function getEmpElementCostingAllocationFromViewByGuid(
  empElementCostingGuid,
  enterpriseId
) {
  const guid = normalizePayViewGuid(empElementCostingGuid);
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
      return mapEmpElementCostingDetailRow(row, flexfield_segments_json, flexfield_segments_details_json);
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'getEmpElementCostingAllocationFromViewByGuid', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}


export async function empElementCostingAllocationExistsByGuid(recordGuid) {
  const guid = normalizePayViewGuid(recordGuid);
  if (!guid) return false;

  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(EXISTS_BY_GUID_SQL, { guid }, PAY_VIEW_ROW_OBJECT);
      return Boolean(result?.rows?.[0]);
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'empElementCostingAllocationExistsByGuid', err);
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err);
  }
}

export async function createEmpElementCostingAllocation(payload, createdBy) {
  const pkg = await createEmpElementCostingAllocationViaPackage(payload, createdBy);
  if (!pkg?.emp_element_costing_guid) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  const row = await getEmpElementCostingAllocationFromViewByGuid(
    pkg.emp_element_costing_guid,
    payload.enterprise_id
  );
  if (!row) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return { success: true, message: '', data: row };
}

export async function updateEmpElementCostingAllocation(
  empElementCostingGuid,
  payload,
  updatedBy
) {
  await updateEmpElementCostingAllocationViaPackage(empElementCostingGuid, payload, updatedBy);

  const row = await getEmpElementCostingAllocationFromViewByGuid(
    empElementCostingGuid,
    payload.enterprise_id
  );
  if (!row) {
    return { success: false, message: UPDATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return { success: true, message: '', data: row };
}

export async function deleteEmpElementCostingAllocation(empElementCostingGuid) {
  await deleteEmpElementCostingAllocationViaPackage(empElementCostingGuid);
  return { success: true, message: '', data: null };
}
