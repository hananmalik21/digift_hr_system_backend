/**
 * @swagger
 * tags:
 *   - name: Payroll Flow Submissions
 *     description: >
 *       Payroll flow submissions via PAY.PAY_PAYROLL_FLOW_SUBMISSIONS_PKG.
 *       POST create is DRAFT only. Submit does not initialize a payroll run.
 *       Initialize a run with POST /flow-submissions/{id}/initialize-run
 *       (PAY.PAYROLL_PROCESSING_PKG.INITIALIZE_RUN_FROM_SUBMISSION).
 *       Idempotent when the submission is already RUN_CREATED or COMPLETED.
 *       Persisted STATUS_CODE values: DRAFT, SUBMITTED, RUN_CREATED, COMPLETED,
 *       ROLLED_BACK, CANCELLED, ERROR.
 *
 * @swagger
 * components:
 *   schemas:
 *     PayrollFlowSubmissionStatusCode:
 *       type: string
 *       enum: [DRAFT, SUBMITTED, RUN_CREATED, COMPLETED, ROLLED_BACK, CANCELLED, ERROR]
 *     PayrollFlowSubmissionWrite:
 *       type: object
 *       required: [enterprise_id, flow_id]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         flow_id: { type: integer, example: 1 }
 *         schedule_code: { type: string, example: ASAP }
 *         scheduled_date: { type: string, format: date, nullable: true, example: null }
 *         scope_code: { type: string, example: ALL_EMPLOYEES }
 *         payroll_id: { type: integer, example: 15 }
 *         period_start_date: { type: string, format: date, example: '2026-09-01' }
 *         period_end_date: { type: string, format: date, example: '2026-09-30' }
 *         payment_date: { type: string, format: date, example: '2026-09-30' }
 *         consolidation_group_id: { type: integer, example: 1 }
 *         run_type_code:
 *           type: string
 *           enum: [REGULAR, SUPPLEMENTAL, RETRO, BONUS]
 *           example: REGULAR
 *           description: |
 *             REGULAR: Normal payroll-cycle entries.
 *             SUPPLEMENTAL: Supplemental/off-cycle payroll entries.
 *             RETRO: Retroactive adjustment entries.
 *             BONUS: Bonus payroll entries.
 *         payroll_group_id: { type: integer, nullable: true, example: null }
 *         process_start_date: { type: string, format: date, example: '2026-09-01' }
 *         process_end_date: { type: string, format: date, example: '2026-09-30' }
 *         date_earned: { type: string, format: date, example: '2026-09-30' }
 *         element_group_code: { type: string, nullable: true, example: null }
 *         report_category_code: { type: string, nullable: true, example: null }
 *         process_config_group_id: { type: integer, example: 1 }
 *         run_mode_code: { type: string, example: NORMAL }
 *
 * @swagger
 * /api/payroll/flow-submissions:
 *   get:
 *     tags: [Payroll Flow Submissions]
 *     summary: List flow submissions (LIST_SUBMISSIONS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status_code
 *         schema:
 *           $ref: '#/components/schemas/PayrollFlowSubmissionStatusCode'
 *         description: Includes ROLLED_BACK after ROLLBACK_RUN.
 *       - in: query
 *         name: payroll_id
 *         schema: { type: integer }
 *   post:
 *     tags: [Payroll Flow Submissions]
 *     summary: Create draft flow submission (CREATE_DRAFT)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollFlowSubmissionWrite' }
 *
 * @swagger
 * /api/payroll/flow-submissions/{flowSubmissionId}:
 *   get:
 *     tags: [Payroll Flow Submissions]
 *     summary: Get flow submission (GET_SUBMISSION)
 *     description: Returns the persisted submission, including STATUS_CODE = ROLLED_BACK after rollback.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowSubmissionId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Flow Submissions]
 *     summary: Update draft flow submission (UPDATE_DRAFT)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowSubmissionId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollFlowSubmissionWrite' }
 *   delete:
 *     tags: [Payroll Flow Submissions]
 *     summary: Delete draft flow submission (DELETE_DRAFT)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowSubmissionId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *
 * @swagger
 * /api/payroll/flow-submissions/{flowSubmissionId}/submit:
 *   post:
 *     tags: [Payroll Flow Submissions]
 *     summary: Submit flow (SUBMIT_FLOW). Does not initialize a payroll run.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowSubmissionId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enterprise_id: { type: integer, example: 1 }
 *
 * @swagger
 * /api/payroll/flow-submissions/{flowSubmissionId}/cancel:
 *   post:
 *     tags: [Payroll Flow Submissions]
 *     summary: Cancel flow submission (CANCEL_SUBMISSION)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowSubmissionId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enterprise_id: { type: integer, example: 1 }
 *
 * @swagger
 * /api/payroll/flow-submissions/{flowSubmissionId}/initialize-run:
 *   post:
 *     tags: [Payroll Flow Submissions]
 *     summary: Initialize payroll run from a SUBMITTED submission (INITIALIZE_RUN_FROM_SUBMISSION)
 *     description: >
 *       Oracle reads payroll_id, dates, run_type_code, and payment_date from the submission.
 *       Request body accepts enterprise_id only. Actor is the authenticated username.
 *       Idempotent if status is already RUN_CREATED or COMPLETED and a linked run exists.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowSubmissionId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enterprise_id: { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Nested persisted submission (RUN_CREATED) and run (IN_PROGRESS, flow_submission_id set)
 */
