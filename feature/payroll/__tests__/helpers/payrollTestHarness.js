/**
 * Shared harness for DigifyHR payroll API tests.
 * Boots an Express app with payroll routes + test auth/enterprise context.
 */

import express from 'express';
import db from '../../../../config/db.js';
import payrollRoutes from '../../routes/payroll.routes.js';

export const TEST_ENTERPRISE_ID = 1;
export const FIXTURES = {
  enterpriseId: TEST_ENTERPRISE_ID,
  runId: 163,
  payrollId: 13,
  employeeId: 293,
  paymentBatchId: 1,
  journalId: 2,
  payslipId: 1,
  arrearId: 1,
  retroEventId: 2,
  approvalRequestId: 3,
  filingId: 1,
  operationRunId: 2,
  certificationId: 2,
  formulaGuid: '583a83abdf9a754de0631718000af43b'
};

let app;
let server;
let baseUrl;
let poolReady = false;

export async function ensurePool() {
  if (poolReady) return;
  await db.createPool();
  poolReady = true;
}

export async function startPayrollTestServer() {
  await ensurePool();
  if (server) return { app, baseUrl };

  app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, _res, next) => {
    req.enterprise = {
      enterpriseId: TEST_ENTERPRISE_ID,
      enterpriseCode: 'TEST',
      enterpriseGuid: null
    };
    req.user = {
      user_id: 1,
      id: 1,
      username: 'PAYROLL_TEST',
      enterprise_id: TEST_ENTERPRISE_ID,
      admin_type: 'SYSTEM'
    };
    next();
  });
  app.use('/api/payroll', payrollRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  return { app, baseUrl };
}

export async function stopPayrollTestServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
    app = null;
    baseUrl = null;
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {{ query?: Record<string, unknown>, body?: unknown, headers?: Record<string, string> }} [opts]
 */
export async function api(method, path, opts = {}) {
  if (!baseUrl) await startPayrollTestServer();
  const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

export function assertSuccessList(result, label = 'list') {
  if (result.status !== 200) {
    throw new Error(`${label}: expected 200, got ${result.status}: ${result.text?.slice(0, 300)}`);
  }
  if (!result.json?.success) {
    throw new Error(`${label}: expected success=true: ${result.text?.slice(0, 300)}`);
  }
  if (!Array.isArray(result.json.data)) {
    throw new Error(`${label}: expected data array`);
  }
  const pag = result.json.meta?.pagination;
  if (!pag || typeof pag.page !== 'number' || typeof pag.pageSize !== 'number') {
    throw new Error(`${label}: missing meta.pagination {page,pageSize,...}`);
  }
  if (typeof pag.total !== 'number' || typeof pag.totalPages !== 'number') {
    throw new Error(`${label}: pagination missing total/totalPages`);
  }
  if (typeof pag.hasNext !== 'boolean' || typeof pag.hasPrevious !== 'boolean') {
    throw new Error(`${label}: pagination missing hasNext/hasPrevious`);
  }
}

export function assertSuccessObject(result, label = 'get') {
  if (result.status !== 200) {
    throw new Error(`${label}: expected 200, got ${result.status}: ${result.text?.slice(0, 300)}`);
  }
  if (!result.json?.success) {
    throw new Error(`${label}: expected success=true: ${result.text?.slice(0, 300)}`);
  }
  if (result.json.data == null) {
    throw new Error(`${label}: expected data payload`);
  }
}

export function assertClientError(result, label = 'validation') {
  if (result.status < 400 || result.status >= 500) {
    throw new Error(`${label}: expected 4xx, got ${result.status}: ${result.text?.slice(0, 300)}`);
  }
  if (result.json?.success !== false) {
    throw new Error(`${label}: expected success=false`);
  }
  if (!result.json?.message) {
    throw new Error(`${label}: expected error message`);
  }
}

export const qEnterprise = { enterprise_id: TEST_ENTERPRISE_ID, page: 1, page_size: 5 };
