/**
 * @swagger
 * tags:
 *   - name: Payroll Runs
 *     description: >
 *       Payroll run lifecycle via PAY.PAYROLL_PROCESSING_PKG.
 *       Oracle persists STATUS_CODE. Effective values include
 *       IN_PROGRESS, READY_TO_FINALIZE, COMPLETED_WITH_ERRORS, COMPLETED,
 *       ROLLED_BACK, and ERROR. Node does not UPDATE run or flow-submission status.
 *
 * @swagger
 * components:
 *   schemas:
 *     PayrollRunStatusCode:
 *       type: string
 *       enum:
 *         - IN_PROGRESS
 *         - READY_TO_FINALIZE
 *         - COMPLETED_WITH_ERRORS
 *         - COMPLETED
 *         - ROLLED_BACK
 *         - ERROR
 *     PayrollRun:
 *       type: object
 *       properties:
 *         run_id: { type: integer, example: 123 }
 *         run_guid: { type: string }
 *         run_number: { type: string }
 *         status_code: { $ref: '#/components/schemas/PayrollRunStatusCode' }
 *         flow_submission_id: { type: integer, nullable: true, example: 123 }
 *     PayrollProcessRunResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         message: { type: string, example: Payroll run processing completed. }
 *         data:
 *           type: object
 *           properties:
 *             status: { $ref: '#/components/schemas/PayrollRunStatusCode', example: READY_TO_FINALIZE }
 *             run: { $ref: '#/components/schemas/PayrollRun' }
 *
 * @swagger
 * /api/payroll/runs:
 *   get:
 *     tags: [Payroll Runs]
 *     summary: List payroll runs
 *     description: Returns PAY.PAYROLL_RUNS rows including flow_submission_id and READY_TO_FINALIZE.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: payroll_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status_code
 *         schema: { $ref: '#/components/schemas/PayrollRunStatusCode' }
 *       - in: query
 *         name: status
 *         description: Alias for status_code
 *         schema: { $ref: '#/components/schemas/PayrollRunStatusCode' }
 *
 * @swagger
 * /api/payroll/runs/{runId}:
 *   get:
 *     tags: [Payroll Runs]
 *     summary: Get payroll run
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Persisted PAYROLL_RUNS row, including flow_submission_id and status_code
 *
 * @swagger
 * /api/payroll/runs/initialize:
 *   post:
 *     tags: [Payroll Runs]
 *     summary: Initialize payroll run (INITIALIZE_RUN)
 *     description: >
 *       Backward-compatible generic initialize. Oracle rejects PERIOD_END_DATE >= 4712-01-01.
 *       Prefer POST /api/payroll/flow-submissions/{id}/initialize-run for flow-driven payroll.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payroll_id, run_type_code, period_start_date, period_end_date, payment_date, run_number]
 *             properties:
 *               enterprise_id: { type: integer, example: 1 }
 *               payroll_id: { type: integer }
 *               run_type_code:
 *                 type: string
 *                 enum: [REGULAR, SUPPLEMENTAL, RETRO, BONUS]
 *                 example: REGULAR
 *                 description: |
 *                   REGULAR: Normal payroll-cycle entries.
 *                   SUPPLEMENTAL: Supplemental/off-cycle payroll entries.
 *                   RETRO: Retroactive adjustment entries.
 *                   BONUS: Bonus payroll entries.
 *               period_start_date: { type: string, format: date, example: '2026-08-01' }
 *               period_end_date: { type: string, format: date, example: '2026-08-31' }
 *               payment_date: { type: string, format: date, example: '2026-08-31' }
 *               run_number: { type: string }
 *
 * @swagger
 * /api/payroll/runs/{runId}/prepare-employees:
 *   post:
 *     tags: [Payroll Runs]
 *     summary: Prepare run employees (PREPARE_RUN_EMPLOYEES)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *
 * @swagger
 * /api/payroll/runs/{runId}/process:
 *   post:
 *     tags: [Payroll Runs]
 *     summary: Process payroll run (PROCESS_RUN)
 *     description: >
 *       After successful processing of all employee actions with no errors, Oracle persists
 *       STATUS_CODE = READY_TO_FINALIZE. Possible persisted statuses are IN_PROGRESS,
 *       READY_TO_FINALIZE, and COMPLETED_WITH_ERRORS. The API returns the persisted run status.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enterprise_id: { type: integer, example: 1 }
 *               stop_on_error: { type: string, enum: [Y, N], example: N }
 *     responses:
 *       200:
 *         description: Processing completed; data.status is the persisted PAYROLL_RUNS.STATUS_CODE
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PayrollProcessRunResponse' }
 *
 * @swagger
 * /api/payroll/runs/{runId}/employees/{employeeId}/retry:
 *   post:
 *     tags: [Payroll Runs]
 *     summary: Retry employee (RETRY_EMPLOYEE)
 *     description: >
 *       Oracle accepts IN_PROGRESS, READY_TO_FINALIZE, COMPLETED_WITH_ERRORS, and COMPLETED.
 *       After retry, Oracle recalculates run status. If the run has FLOW_SUBMISSION_ID,
 *       the linked submission is re-read (COMPLETED may become RUN_CREATED). Node does not UPDATE it.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema: { type: integer }
 *
 * @swagger
 * /api/payroll/runs/{runId}/finalize:
 *   post:
 *     tags: [Payroll Runs]
 *     summary: Finalize payroll run (FINALIZE_RUN)
 *     description: >
 *       Oracle requires STATUS_CODE = READY_TO_FINALIZE. If the run has FLOW_SUBMISSION_ID,
 *       Oracle also sets the linked flow submission RUN_CREATED → COMPLETED.
 *       Node does not UPDATE the submission table.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *
 * @swagger
 * /api/payroll/runs/{runId}/rollback:
 *   post:
 *     tags: [Payroll Runs]
 *     summary: Roll back payroll run (ROLLBACK_RUN)
 *     description: >
 *       Supported from IN_PROGRESS, READY_TO_FINALIZE, COMPLETED_WITH_ERRORS, and COMPLETED.
 *       Resulting run status is ROLLED_BACK. If FLOW_SUBMISSION_ID is set, Oracle also sets the
 *       linked submission to ROLLED_BACK. Node does not UPDATE either table.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 */
