/**
 * Payroll Element Entries — Swagger/OpenAPI JSDoc.
 * Canonical spec: docs/pay_element_entries_api.openapi.yaml
 *
 * @swagger
 * tags:
 *   - name: Payroll Element Entries
 *     description: Element entry lifecycle via PAY.PAY_ELEMENT_ENTRIES_PKG
 *
 * @swagger
 * components:
 *   schemas:
 *     PayElementEntryCreateRequest:
 *       type: object
 *       required:
 *         - enterprise_id
 *         - employee_id
 *         - component_id
 *         - effective_as_of_date
 *         - effective_start_date
 *         - pay_value
 *         - amount
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         employee_id: { type: integer, example: 1001 }
 *         payroll_id: { type: integer, example: 1 }
 *         component_id: { type: integer, example: 10 }
 *         element_classification_code: { type: string, example: STANDARD_EARNING }
 *         effective_as_of_date: { type: string, format: date, example: '2026-06-21' }
 *         effective_start_date: { type: string, format: date, example: '2026-06-01' }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         entry_type_code: { type: string, example: ELEMENT_ENTRY }
 *         source_code: { type: string, example: MANUAL_ENTRY }
 *         element_processing_type_code: { type: string, example: RECURRING }
 *         subpriority: { type: integer, example: 1 }
 *         creator_type_code: { type: string, example: USER }
 *         processed_flag: { type: string, enum: [Y, N], example: N }
 *         retroactive_flag: { type: string, enum: [Y, N], example: N }
 *         automatic_entry_flag: { type: string, enum: [Y, N], example: N }
 *         sequence_number: { type: integer, example: 1 }
 *         reason_text: { type: string, example: Monthly salary }
 *         pay_value:
 *           type: number
 *           description: Numeric payroll value (PAY_VALUE NUMBER(18,3))
 *           example: 500
 *         amount:
 *           type: number
 *           description: Payable amount (AMOUNT NUMBER(18,3))
 *           example: 500
 *         currency_code: { type: string, example: KWD }
 *         cost_allocation_keyflex_id:
 *           type: string
 *           maxLength: 100
 *           example: CC-HR-KWT
 *         costing_type_code: { type: string, example: COSTED }
 *         account_code: { type: string, example: 5000-100-100 }
 *         cost_center_code: { type: string, example: HR }
 *         context_segment_code: { type: string, example: BUSINESS_UNIT }
 *         context_value: { type: string, example: KUWAIT }
 *         approval_status_code: { type: string, example: DRAFT }
 *         comments: { type: string, example: Created manually }
 *         source_reference: { type: string, nullable: true }
 *         batch_id: { type: string, nullable: true }
 *     PayElementEntryUpdateRequest:
 *       type: object
 *       minProperties: 1
 *       properties:
 *         pay_value: { type: number, example: 600 }
 *         amount: { type: number, example: 600 }
 *         currency_code: { type: string, example: KWD }
 *         cost_allocation_keyflex_id: { type: string, example: CC-HR-KWT }
 *         comments: { type: string, example: Updated amount }
 *         effective_end_date: { type: string, format: date, example: '2026-12-31' }
 *
 * @swagger
 * /api/pay/element-entries:
 *   post:
 *     tags: [Payroll Element Entries]
 *     summary: Create element entry
 *     description: Calls PAY.PAY_ELEMENT_ENTRIES_PKG.CREATE_ELEMENT_ENTRY
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayElementEntryCreateRequest'
 *           example:
 *             enterprise_id: 1
 *             employee_id: 1001
 *             payroll_id: 1
 *             component_id: 10
 *             element_classification_code: STANDARD_EARNING
 *             effective_as_of_date: '2026-06-21'
 *             effective_start_date: '2026-06-01'
 *             effective_end_date: null
 *             entry_type_code: ELEMENT_ENTRY
 *             source_code: MANUAL_ENTRY
 *             element_processing_type_code: RECURRING
 *             subpriority: 1
 *             creator_type_code: USER
 *             processed_flag: N
 *             retroactive_flag: N
 *             automatic_entry_flag: N
 *             sequence_number: 1
 *             reason_text: Monthly salary
 *             pay_value: 500
 *             amount: 500
 *             currency_code: KWD
 *             cost_allocation_keyflex_id: CC-HR-KWT
 *             costing_type_code: COSTED
 *             account_code: 5000-100-100
 *             cost_center_code: HR
 *             context_segment_code: BUSINESS_UNIT
 *             context_value: KUWAIT
 *             approval_status_code: DRAFT
 *             comments: Created manually
 *             source_reference: null
 *             batch_id: null
 *
 * @swagger
 * /api/pay/element-entries/{guid}:
 *   put:
 *     tags: [Payroll Element Entries]
 *     summary: Update element entry
 *     description: Calls PAY.PAY_ELEMENT_ENTRIES_PKG.UPDATE_ELEMENT_ENTRY using element_entry_guid only.
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *         description: 32-character element_entry_guid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayElementEntryUpdateRequest'
 *           example:
 *             pay_value: 600
 *             amount: 600
 *             currency_code: KWD
 *             cost_allocation_keyflex_id: CC-HR-KWT
 *             comments: Updated amount
 *             effective_end_date: '2026-12-31'
 *   delete:
 *     tags: [Payroll Element Entries]
 *     summary: Delete element entry
 *     description: Calls PAY.PAY_ELEMENT_ENTRIES_PKG.DELETE_ELEMENT_ENTRY using element_entry_guid only.
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *         description: 32-character element_entry_guid
 */

export {};
