/**
 * Acceptance tests for POST /api/payroll/admin/test-reset.
 * No live Oracle — the package executor is stubbed. Validation/auth/env use the real middleware.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DatabaseError } from '../../../utils/errors/index.js';
import {
  CONFIRMATION_CODE,
  PKG,
  RESET_ENTERPRISE_RUNTIME_PLSQL,
  RESET_PROCEDURE
} from '../admin/constants.js';
import { createTestResetHandler } from '../admin/controllers/payTestResetController.js';
import { resetEnterpriseRuntime } from '../admin/services/payTestResetService.js';
import {
  PayrollTestResetError,
  extractOracleErrorNum,
  isResetBusinessOracleError,
  mapResetOracleError,
  sanitizeOracleMessage
} from '../admin/utils/payTestResetErrors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../admin/services/payTestResetService.js');
const ROUTES_PATH = path.resolve(__dirname, '../routes/payroll.routes.js');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const routesSource = fs.readFileSync(ROUTES_PATH, 'utf8');

const SUCCESS_RESULT = {
  success: true,
  message: 'Payroll Initialize-to-Finalize runtime reset completed successfully.',
  data: {
    enterprise_id: 1,
    runs_reset: 3,
    source_entries_reset: 5,
    recurring_template_pointers_reset: 0,
    formula_steps_deleted: 12,
    balance_transactions_deleted: 75,
    balance_results_deleted: 40,
    element_results_deleted: 5,
    formula_logs_deleted: 2,
    recurring_generation_logs_deleted: 4,
    relation_actions_deleted: 1,
    generated_entry_contexts_deleted: 0,
    generated_entry_costing_deleted: 0,
    generated_entry_values_deleted: 0,
    generated_recurring_entries_deleted: 0,
    source_run_pointers_cleared: 0,
    reusable_source_entries: 5,
    remaining_runs: 0
  }
};

const EMPTY_RUNS_RESULT = {
  ...SUCCESS_RESULT,
  data: {
    ...SUCCESS_RESULT.data,
    runs_reset: 0,
    source_entries_reset: 0,
    reusable_source_entries: 0
  }
};

function ora(errorNum, message) {
  const err = new Error(`ORA-${errorNum}: ${message}\nORA-06512: at "${PKG}", line 10`);
  err.errorNum = errorNum;
  return err;
}

async function startApp({
  user = {},
  service = { resetEnterpriseRuntime: async () => SUCCESS_RESULT }
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const enterpriseId = user.enterprise_id ?? 1;
    req.user = {
      user_id: user.user_id ?? 10,
      id: user.user_id ?? 10,
      username: user.username ?? 'enterprise_admin',
      enterprise_id: enterpriseId,
      admin_type: Object.hasOwn(user, 'admin_type') ? user.admin_type : 'enterprise_admin'
    };
    req.enterprise = {
      enterpriseId: user.hostEnterpriseId ?? enterpriseId,
      enterpriseCode: 'TEST',
      enterpriseGuid: null
    };
    next();
  });
  app.post('/api/payroll/admin/test-reset', ...createTestResetHandler(service));

  const restoreConsole = silenceConsole();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      restoreConsole();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function postReset(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/payroll/admin/test-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
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

function validBody(overrides = {}) {
  return {
    enterprise_id: 1,
    confirmation: CONFIRMATION_CODE,
    ...overrides
  };
}

function silenceConsole() {
  const original = { info: console.info, error: console.error };
  console.info = () => {};
  console.error = () => {};
  return () => {
    console.info = original.info;
    console.error = original.error;
  };
}

async function withApp(opts, fn) {
  const ctx = await startApp(typeof opts === 'function' ? undefined : opts);
  const work = typeof opts === 'function' ? opts : fn;
  try {
    return await work(ctx);
  } finally {
    await ctx.close();
  }
}

async function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = Object.hasOwn(process.env, key) ? process.env[key] : undefined;
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('service calls PAY.PAYROLL_TEST_RESET_PKG.RESET_ENTERPRISE_RUNTIME with autoCommit false', async () => {
  assert.ok(RESET_ENTERPRISE_RUNTIME_PLSQL.includes(`${PKG}.${RESET_PROCEDURE}`));
  assert.ok(RESET_ENTERPRISE_RUNTIME_PLSQL.includes('P_ENTERPRISE_ID => :enterprise_id'));
  assert.ok(RESET_ENTERPRISE_RUNTIME_PLSQL.includes('P_CONFIRM_CODE  => :confirmation'));
  assert.ok(RESET_ENTERPRISE_RUNTIME_PLSQL.includes('O_RESULT_JSON   => :result_json'));
  assert.ok(serviceSource.includes('autoCommit: false'));
  assert.ok(routesSource.includes("router.use('/admin', payTestResetRoutes)"));
  assert.equal(/\bDELETE\b/i.test(serviceSource), false);
  assert.equal(/\bUPDATE\b/i.test(serviceSource), false);
  assert.equal(/DISABLE.*CONSTRAINT/i.test(serviceSource), false);
});

test('Valid enterprise + exact confirmation → 200, success=true', async () => {
  await withApp(async ({ baseUrl }) => {
    const r = await postReset(baseUrl, validBody());
    assert.equal(r.status, 200);
    assert.equal(r.json.success, true);
    assert.equal(r.json.data.runs_reset, 3);
    assert.equal(r.json.message, SUCCESS_RESULT.message);
  });
});

test('No payroll runs exist → 200, success=true, runs_reset=0', async () => {
  await withApp({ service: { resetEnterpriseRuntime: async () => EMPTY_RUNS_RESULT } }, async ({ baseUrl }) => {
    const r = await postReset(baseUrl, validBody());
    assert.equal(r.status, 200);
    assert.equal(r.json.success, true);
    assert.equal(r.json.data.runs_reset, 0);
  });
});

test('Missing enterprise_id → 400', async () => {
  await withApp(async ({ baseUrl }) => {
    const r = await postReset(baseUrl, { confirmation: CONFIRMATION_CODE });
    assert.equal(r.status, 400);
    assert.equal(r.json.success, false);
    assert.match(String(r.json.message), /enterprise_id/i);
  });
});

test('Invalid/zero/negative enterprise → 400', async () => {
  await withApp(async ({ baseUrl }) => {
    for (const enterprise_id of [0, -1, 1.5, 'abc']) {
      const r = await postReset(baseUrl, validBody({ enterprise_id }));
      assert.equal(r.status, 400, `enterprise_id=${enterprise_id}`);
      assert.equal(r.json.success, false, `enterprise_id=${enterprise_id}`);
    }
  });
});

test('Missing confirmation → 400', async () => {
  await withApp(async ({ baseUrl }) => {
    const r = await postReset(baseUrl, { enterprise_id: 1 });
    assert.equal(r.status, 400);
    assert.equal(r.json.success, false);
    assert.match(String(r.json.message), /confirmation/i);
  });
});

test('Wrong confirmation → 400', async () => {
  await withApp(async ({ baseUrl }) => {
    const r = await postReset(baseUrl, validBody({ confirmation: 'RESET' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.success, false);
    assert.match(String(r.json.message), /RESET_PAYROLL_TEST_DATA/);
  });
});

test('FK safety blocker from package → 409, no partial reset', async () => {
  let calls = 0;
  await withApp(
    {
      service: {
        resetEnterpriseRuntime: async () => {
          calls += 1;
          throw mapResetOracleError(
            ora(20991, 'Payroll reset blocked: one or more PAYROLL_RUNS foreign-key child sets remain.')
          );
        }
      }
    },
    async ({ baseUrl }) => {
      const r = await postReset(baseUrl, validBody());
      assert.equal(r.status, 409);
      assert.equal(r.json.success, false);
      assert.equal(r.json.message, 'Payroll runtime reset failed.');
      assert.equal(r.json.error.code, 'PAYROLL_TEST_RESET_FAILED');
      assert.equal(r.json.error.oracle_code, -20991);
      assert.match(r.json.error.oracle_message, /foreign-key child sets remain/i);
      assert.equal(r.json.error.oracle_message.includes('ORA-06512'), false);
      assert.equal(calls, 1);
    }
  );
});

test('Unexpected Oracle error → 500', async () => {
  await withApp(
    {
      service: {
        resetEnterpriseRuntime: async () => {
          throw mapResetOracleError(ora(942, 'table or view does not exist'));
        }
      }
    },
    async ({ baseUrl }) => {
      const r = await postReset(baseUrl, validBody());
      assert.equal(r.status, 500);
      assert.equal(r.json.success, false);
      assert.equal(r.json.error.code, 'PAYROLL_TEST_RESET_FAILED');
      assert.equal(r.json.error.oracle_code, -942);
      assert.equal(r.text.includes('connectString'), false);
      assert.equal(r.text.includes('password'), false);
    }
  );
});

test('Unauthorized enterprise → 403', async () => {
  await withApp({ user: { enterprise_id: 1, admin_type: 'enterprise_admin' } }, async ({ baseUrl }) => {
    const r = await postReset(baseUrl, validBody({ enterprise_id: 99 }));
    assert.equal(r.status, 403);
    assert.equal(r.json.success, false);
    assert.match(String(r.json.message), /enterprise access denied/i);
  });
});

test('Non-admin user is rejected with 403', async () => {
  await withApp(
    { user: { enterprise_id: 1, admin_type: null, username: 'payroll_user' } },
    async ({ baseUrl }) => {
      const r = await postReset(baseUrl, validBody());
      assert.equal(r.status, 403);
      assert.equal(r.json.success, false);
      assert.match(String(r.json.message), /administrator/i);
    }
  );
});

test('Production environment → endpoint blocked', async () => {
  await withEnv({ NODE_ENV: 'production', APP_ENV: undefined }, async () => {
    await withApp(async ({ baseUrl }) => {
      const r = await postReset(baseUrl, validBody());
      assert.ok([403, 404].includes(r.status), `status ${r.status}`);
      assert.equal(r.json.success, false);
    });
  });
});

test('APP_ENV=production also disables the endpoint', async () => {
  await withEnv({ APP_ENV: 'production' }, async () => {
    await withApp(async ({ baseUrl }) => {
      const r = await postReset(baseUrl, validBody());
      assert.ok([403, 404].includes(r.status), `status ${r.status}`);
      assert.equal(r.json.success, false);
    });
  });
});

test('service parses package JSON CLOB and does not retry on Oracle failure', async () => {
  let calls = 0;
  const executePayrollPackage = async (plsql, binds, options) => {
    calls += 1;
    assert.equal(plsql.trim(), RESET_ENTERPRISE_RUNTIME_PLSQL);
    assert.equal(options.autoCommit, false);
    assert.equal(binds.enterprise_id.val, 1);
    assert.equal(binds.confirmation.val, CONFIRMATION_CODE);
    assert.ok(binds.result_json);
    const parsed = await options.mapOut(
      { result_json: JSON.stringify(SUCCESS_RESULT) },
      { parseJsonClob: async (k) => JSON.parse(k === 'result_json' ? JSON.stringify(SUCCESS_RESULT) : 'null') }
    );
    return { success: true, data: parsed, outBinds: {} };
  };

  const result = await resetEnterpriseRuntime(
    { enterpriseId: 1, confirmation: CONFIRMATION_CODE },
    { executePayrollPackage }
  );
  assert.equal(result.success, true);
  assert.equal(result.data.runs_reset, 3);
  assert.equal(calls, 1);

  calls = 0;
  const failingExecute = async () => {
    calls += 1;
    throw new DatabaseError(
      'Payroll runtime reset failed.',
      ora(20991, 'Payroll reset blocked: one or more PAYROLL_RUNS foreign-key child sets remain.'),
      'Payroll reset blocked'
    );
  };
  await assert.rejects(
    () =>
      resetEnterpriseRuntime(
        { enterpriseId: 1, confirmation: CONFIRMATION_CODE },
        { executePayrollPackage: failingExecute }
      ),
    (err) => {
      assert.ok(err instanceof PayrollTestResetError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.oracleCode, -20991);
      return true;
    }
  );
  assert.equal(calls, 1);
});

test('error helpers map business Oracle codes to 409 without stack traces', () => {
  assert.equal(extractOracleErrorNum(ora(20980, 'blocked')), 20980);
  assert.equal(isResetBusinessOracleError(20980), true);
  assert.equal(isResetBusinessOracleError(20998), true);
  assert.equal(isResetBusinessOracleError(942), false);

  const mapped = mapResetOracleError(
    ora(20991, 'Payroll reset blocked: one or more PAYROLL_RUNS foreign-key child sets remain.')
  );
  assert.equal(mapped.statusCode, 409);
  assert.equal(mapped.oracleCode, -20991);
  assert.equal(
    mapped.oracleMessage,
    'Payroll reset blocked: one or more PAYROLL_RUNS foreign-key child sets remain.'
  );
  assert.equal(sanitizeOracleMessage(ora(20991, 'blocked')).includes('ORA-06512'), false);

  const unexpected = mapResetOracleError(ora(6502, 'PL/SQL: numeric or value error'));
  assert.equal(unexpected.statusCode, 500);
  assert.equal(unexpected.oracleCode, -6502);
});
