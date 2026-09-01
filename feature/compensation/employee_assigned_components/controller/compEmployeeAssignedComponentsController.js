import express from 'express';
import { z } from 'zod';
import { executeQuery } from '../../../../config/db.js';
import { asyncHandler } from '@digifyhr/common';
import { sendSuccess } from '@digifyhr/common';
import { convertKeysToSnakeCase } from '@digifyhr/common';
import { parseBulkEmployeeAssignedComponentsQuery, parseBulkEmployeeAssignedComponentsBody } from '../validation/bulkEmployeeAssignedComponentsQuery.js';
import { queryEmployeeAssignedComponents } from '../utils/buildEmployeeAssignedComponentsSql.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  SERVER_ERROR: 500
};

function sendFailure(res, statusCode, message) {
  return res.status(statusCode).json({ status: false, message, data: null });
}

const querySchema = z.object({
  employee_guid: z.preprocess(
    (v) => (v === undefined || v === null ? '' : String(v).trim()),
    z
      .string()
      .min(1, { message: 'employee_guid is required' })
      .transform((s) => s.replace(/-/g, '').toUpperCase())
      .refine((s) => /^[0-9A-F]{32}$/.test(s), {
        message: 'employee_guid must be a 32-character hexadecimal string'
      })
  )
});

function firstIssueMessage(zodError, fallback) {
  return zodError?.issues?.[0]?.message || fallback;
}

function logQueryError(tag, err) {
  console.error(
    tag,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
}

async function fetchEmployeesAssignedComponents(employee_guids) {
  const result = await queryEmployeeAssignedComponents(
    executeQuery,
    { employee_guids_json: JSON.stringify(employee_guids) },
    { employeeFilter: 'bulk' }
  );
  const rows = convertKeysToSnakeCase(result?.rows || []);

  return {
    rows,
    meta: {
      employee_count: employee_guids.length,
      row_count: rows.length,
      employee_guids
    }
  };
}

/**
 * GET /api/comp/employee-assigned-components?employee_guid=...
 *
 * Active assigned compensation component lines for one employee (from COMP.COMP_EMP_ASSIGNED_COMPONENTS_V).
 */
router.get(
  '/employee-assigned-components',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendFailure(res, HTTP.BAD_REQUEST, firstIssueMessage(parsed.error, 'Invalid query'));
    }

    const { employee_guid } = parsed.data;

    try {
      const result = await queryEmployeeAssignedComponents(
        executeQuery,
        { employee_guid },
        { employeeFilter: 'single' }
      );
      return sendSuccess(res, {
        message: 'Fetched successfully',
        data: convertKeysToSnakeCase(result?.rows || []),
        statusCode: HTTP.OK
      });
    } catch (err) {
      logQueryError('[compEmployeeAssignedComponents] listEmployeeAssignedComponents', err);
      return sendFailure(
        res,
        HTTP.SERVER_ERROR,
        'Failed to fetch employee assigned compensation components'
      );
    }
  })
);

/**
 * GET /api/comp/employees-assigned-components?employee_guids=HEX1,HEX2,...
 * POST /api/comp/employees-assigned-components  body: { "employee_guids": ["HEX1", "HEX2"] }
 *
 * Prefer POST for multiple IDs — cleaner JSON array, no URL length limits.
 */
async function handleEmployeesAssignedComponents(req, res, parseInput) {
  const parsed = parseInput();
  if (!parsed.ok) {
    return sendFailure(res, HTTP.BAD_REQUEST, parsed.message);
  }

  const { employee_guids } = parsed;

  try {
    const { rows, meta } = await fetchEmployeesAssignedComponents(employee_guids);
    return sendSuccess(res, {
      message: 'Fetched successfully',
      data: rows,
      meta,
      statusCode: HTTP.OK
    });
  } catch (err) {
    logQueryError('[compEmployeeAssignedComponents] listEmployeesAssignedComponents', err);
    return sendFailure(
      res,
      HTTP.SERVER_ERROR,
      'Failed to fetch employee assigned compensation components'
    );
  }
}

router.get(
  '/employees-assigned-components',
  asyncHandler((req, res) =>
    handleEmployeesAssignedComponents(req, res, () =>
      parseBulkEmployeeAssignedComponentsQuery(req.query)
    )
  )
);

router.post(
  '/employees-assigned-components',
  asyncHandler((req, res) =>
    handleEmployeesAssignedComponents(req, res, () =>
      parseBulkEmployeeAssignedComponentsBody(req.body)
    )
  )
);

export default router;
