/**
 * @swagger
 * tags:
 *   - name: TM Payroll Transfer Batches
 *     description: >
 *       TM → PAY transfer lifecycle via TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG.
 *       Oracle owns create/reopen, preview, validate, transfer, reconcile, lock, and reverse.
 *       For OVERTIME_REQUEST, Oracle eligibility is STATUS = 'APPROVED' only
 *       (HR_VALIDATED_BY / MANAGER_APPROVED_BY are not required).
 *       After each package call the API re-reads persisted batch + lines and returns
 *       `{ summary, batch, lines }` — it does not calculate OT hours, multiplier, divisor, or hourly rate,
 *       and does not filter OT eligibility in Node.
 *
 * @swagger
 * components:
 *   schemas:
 *     TmTransferBatchCreateRequest:
 *       type: object
 *       required: [enterprise_id, payroll_id, period_start_date, period_end_date]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         payroll_id: { type: integer, example: 15 }
 *         period_start_date: { type: string, format: date, example: '2026-08-01' }
 *         period_end_date: { type: string, format: date, example: '2026-08-31' }
 *         transfer_batch_number: { type: string, nullable: true, example: null }
 *     TmTransferBatchPersisted:
 *       type: object
 *       description: Persisted Oracle transfer batch row.
 *       properties:
 *         payroll_transfer_batch_id: { type: integer, example: 23 }
 *         transfer_batch_number: { type: string }
 *         enterprise_id: { type: integer, example: 1 }
 *         payroll_id: { type: integer, example: 15 }
 *         payroll_code: { type: string, example: KW_MONTHLY }
 *         payroll_name: { type: string }
 *         period_start_date: { type: string, format: date, example: '2026-08-01' }
 *         period_end_date: { type: string, format: date, example: '2026-08-31' }
 *         status_code: { type: string, example: PREVIEWED }
 *         total_source_records: { type: integer }
 *         total_transfer_lines: { type: integer }
 *         validated_transfer_lines: { type: integer }
 *         transferred_transfer_lines: { type: integer }
 *         error_transfer_lines: { type: integer }
 *         reversed_transfer_lines: { type: integer }
 *         total_hours: { type: number }
 *         total_days: { type: number }
 *         total_amount: { type: number }
 *         reconciliation_status_code: { type: string, example: NOT_RECONCILED }
 *         locked_flag: { type: string, example: N }
 *     TmTransferLinePersisted:
 *       type: object
 *       description: Persisted Oracle transfer line (hours/multiplier/rate from Oracle, not Node).
 *       properties:
 *         payroll_transfer_line_id: { type: integer, example: 123 }
 *         payroll_source_mapping_id: { type: integer }
 *         employee_id: { type: integer, example: 293 }
 *         source_type_code: { type: string, example: OVERTIME_REQUEST }
 *         source_subtype_code: { type: string, example: WORKDAY }
 *         source_record_id: { type: integer, example: 65 }
 *         source_value_code: { type: string }
 *         source_transaction_date: { type: string, format: date }
 *         payroll_element_id: { type: integer, example: 71 }
 *         element_code: { type: string, example: OVERTIME }
 *         element_name: { type: string }
 *         transfer_quantity: { type: number, example: 1 }
 *         transfer_unit_code: { type: string, example: HOURS }
 *         rate_multiplier: { type: number, example: 1.25 }
 *         hourly_rate: { type: number, example: 12.692308 }
 *         hourly_rate_source_code: { type: string }
 *         hourly_rate_source_reference: { type: string }
 *         transfer_amount: { type: number }
 *         currency_code: { type: string, example: USD }
 *         status_code: { type: string, example: PREVIEWED }
 *         validation_message: { type: string, nullable: true }
 *         input_values_json: { type: object, nullable: true }
 *         payroll_element_entry_id: { type: integer, nullable: true }
 *         payroll_source_reference: { type: string, nullable: true }
 *         reversed_flag: { type: string, example: N }
 *     TmTransferLifecycleResponse:
 *       type: object
 *       required: [success, message, data]
 *       properties:
 *         success: { type: boolean }
 *         message: { type: string }
 *         data:
 *           type: object
 *           required: [summary, batch, lines]
 *           properties:
 *             summary: { type: object }
 *             batch: { $ref: '#/components/schemas/TmTransferBatchPersisted' }
 *             lines:
 *               type: array
 *               items: { $ref: '#/components/schemas/TmTransferLinePersisted' }
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Create or reopen transfer batch (CREATE_TRANSFER_BATCH)
 *     description: |
 *       Calls TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG.CREATE_TRANSFER_BATCH.
 *       Same-period REVERSED batches are reopened by Oracle (same ID → DRAFT).
 *       Do not pre-reject same-period existence as HTTP 409.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TmTransferBatchCreateRequest'
 *           examples:
 *             createOrReopen:
 *               value:
 *                 enterprise_id: 1
 *                 payroll_id: 15
 *                 period_start_date: '2026-08-01'
 *                 period_end_date: '2026-08-31'
 *                 transfer_batch_number: null
 *     responses:
 *       201:
 *         description: New DRAFT batch created
 *       200:
 *         description: Existing REVERSED batch reopened to DRAFT
 *       409:
 *         description: Same-period batch exists in a non-REVERSED state
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches/{batchId}/preview:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Preview transfer batch (PREVIEW_TRANSFER_BATCH)
 *     description: >
 *       Calls TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG.PREVIEW_TRANSFER_BATCH, then returns OUT counts
 *       plus refreshed persisted batch and lines. Oracle selects eligible OVERTIME_REQUEST rows with
 *       STATUS = 'APPROVED' (HR_VALIDATED_BY may be null). Do not re-implement eligibility in the API.
 *       Hourly rate / multiplier / quantity come from Oracle transfer lines.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Preview completed with persisted batch/lines
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TmTransferLifecycleResponse'
 *             examples:
 *               overtimePreview:
 *                 value:
 *                   success: true
 *                   message: Transfer preview completed. Source records=1, transfer lines=1.
 *                   data:
 *                     summary: { source_records: 1, transfer_lines: 1 }
 *                     batch:
 *                       payroll_transfer_batch_id: 23
 *                       status_code: PREVIEWED
 *                       total_source_records: 1
 *                       total_transfer_lines: 1
 *                     lines:
 *                       - payroll_transfer_line_id: 123
 *                         source_record_id: 65
 *                         transfer_quantity: 1
 *                         rate_multiplier: 1.25
 *                         hourly_rate: 12.692308
 *                         currency_code: USD
 *                         status_code: PREVIEWED
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches/{batchId}/validate:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Validate transfer batch (VALIDATE_TRANSFER_BATCH)
 *     description: Returns OUT passed/failed counts plus refreshed batch and lines (including validation_message).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Validation completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TmTransferLifecycleResponse'
 *             examples:
 *               validated:
 *                 value:
 *                   success: true
 *                   message: Transfer validation completed. Passed=1, Failed=0.
 *                   data:
 *                     summary: { passed: 1, failed: 0 }
 *                     batch: { payroll_transfer_batch_id: 23, status_code: VALIDATED }
 *                     lines:
 *                       - payroll_transfer_line_id: 123
 *                         status_code: VALIDATED
 *                         validation_message: Transfer line validation passed.
 *                         hourly_rate: 12.692308
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches/{batchId}/transfer:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Transfer batch to payroll (TRANSFER_BATCH_TO_PAYROLL)
 *     description: >
 *       Oracle creates PAY element entries. Response includes persisted lines with
 *       payroll_element_entry_id, input_values_json, and transfer status.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Transfer completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TmTransferLifecycleResponse'
 *             examples:
 *               transferred:
 *                 value:
 *                   success: true
 *                   message: Payroll transfer completed. Transferred=1, Failed=0.
 *                   data:
 *                     summary: { transferred: 1, failed: 0 }
 *                     batch: { payroll_transfer_batch_id: 23, status_code: TRANSFERRED }
 *                     lines:
 *                       - payroll_transfer_line_id: 123
 *                         status_code: TRANSFERRED
 *                         payroll_element_entry_id: 999
 *                         input_values_json:
 *                           HOURS: 1
 *                           MULTIPLIER: 1.25
 *                           HOURLY RATE: 12.692308
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches/{batchId}/reconcile:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Reconcile transfer batch (RECONCILE_TRANSFER_BATCH)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Reconciliation completed with refreshed batch/lines
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TmTransferLifecycleResponse'
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches/{batchId}/lock:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Lock transfer batch (LOCK_TRANSFER_BATCH)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Batch locked; returns refreshed batch/lines
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TmTransferLifecycleResponse'
 *
 * @swagger
 * /api/payroll/time-management/transfer-batches/{batchId}/reverse:
 *   post:
 *     tags: [TM Payroll Transfer Batches]
 *     summary: Reverse transfer batch (REVERSE_TRANSFER_BATCH)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reversal_reason]
 *             properties:
 *               reversal_reason: { type: string }
 *     responses:
 *       200:
 *         description: Batch reversed; returns refreshed batch/lines
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TmTransferLifecycleResponse'
 */
export {};
