/**
 * Payroll Element Entries — Swagger/OpenAPI JSDoc.
 * Canonical spec: docs/pay_element_entries_api.openapi.yaml
 *
 * @swagger
 * tags:
 *   - name: Payroll Element Entries
 *     description: Element entry lifecycle via PAY.PAY_ELEMENT_ENTRIES_PKG (uses element_id, not component_id)
 *
 * @swagger
 * components:
 *   schemas:
 *     PayElementEntryCreateRequest:
 *       type: object
 *       required:
 *         - enterprise_id
 *         - employee_id
 *         - element_id
 *         - effective_as_of_date
 *         - effective_start_date
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         employee_id: { type: integer, example: 1001 }
 *         payroll_id: { type: integer, example: 1, nullable: true }
 *         element_id: { type: integer, example: 1001 }
 *         element_classification_code: { type: string, example: STANDARD_EARNING, nullable: true }
 *         sub_classification_code: { type: string, example: REGULAR_OVERTIME, nullable: true }
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
 *           nullable: true
 *           description: Optional numeric payroll value (PAY_VALUE NUMBER(18,3))
 *           example: 500
 *         amount:
 *           type: number
 *           nullable: true
 *           description: Optional payable amount (AMOUNT NUMBER(18,3))
 *           example: 500
 *         currency_code: { type: string, example: KWD, nullable: true }
 *         cost_allocation_keyflex_id:
 *           type: string
 *           maxLength: 100
 *           example: CC-HR-KWT
 *         costing_type_code: { type: string, example: COSTED }
 *         account_code: { type: string, example: 5000-100-100 }
 *         cost_center_code: { type: string, example: HR }
 *         context_segment_code: { type: string, example: BUSINESS_UNIT, nullable: true }
 *         context_value: { type: string, example: KUWAIT, nullable: true }
 *         approval_status_code: { type: string, example: DRAFT }
 *         comments: { type: string, example: Created manually }
 *         source_reference: { type: string, nullable: true }
 *         batch_id: { type: string, nullable: true }
 *     PayElementEntryUpdateRequest:
 *       type: object
 *       minProperties: 1
 *       description: |
 *         PATCH-style update. Omitted fields are preserved. Explicit null clears the stored value.
 *       properties:
 *         pay_value: { type: number, example: 600, nullable: true }
 *         amount: { type: number, example: 600, nullable: true }
 *         currency_code: { type: string, example: KWD, nullable: true }
 *         context_segment_code: { type: string, nullable: true }
 *         context_value: { type: string, nullable: true }
 *         sub_classification_code: { type: string, nullable: true }
 *         cost_allocation_keyflex_id: { type: string, example: CC-HR-KWT }
 *         comments: { type: string, example: Updated amount }
 *         effective_end_date: { type: string, format: date, example: '2026-12-31', nullable: true }
 *     PayElementEntryListItem:
 *       type: object
 *       properties:
 *         element_entry_id: { type: integer }
 *         element_entry_guid: { type: string }
 *         enterprise_id: { type: integer }
 *         employee_id: { type: integer }
 *         payroll_id: { type: integer }
 *         element_id: { type: integer }
 *         element_name: { type: string }
 *         primary_entry_value: { type: number }
 *         amount: { type: number }
 *         currency_code: { type: string }
 *         value_name: { type: string }
 *         source: { type: string }
 *         employment_level: { type: string }
 *         seq: { type: integer }
 *         reason: { type: string }
 *         classification: { type: string }
 *         ldg: { type: string }
 *         emp_number: { type: string }
 *         status: { type: string }
 *         effective_as_of_date: { type: string, format: date }
 *         effective_start_date: { type: string, format: date }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         entry_type_code: { type: string }
 *         element_processing_type_code: { type: string }
 *         processed_flag: { type: string, enum: [Y, N] }
 *         retroactive_flag: { type: string, enum: [Y, N] }
 *         automatic_entry_flag: { type: string, enum: [Y, N] }
 *         created_by: { type: string }
 *         creation_date: { type: string, format: date-time }
 *         last_updated_by: { type: string }
 *         last_update_date: { type: string, format: date-time }
 *     PayElementEntryListResponse:
 *       type: object
 *       required: [success, data, pagination]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PayElementEntryListItem'
 *         pagination:
 *           type: object
 *           properties:
 *             page: { type: integer, example: 1 }
 *             limit: { type: integer, example: 20 }
 *             total: { type: integer, example: 0 }
 *             total_pages: { type: integer, example: 0 }
 *             has_next: { type: boolean, example: false }
 *             has_previous: { type: boolean, example: false }
 *     PayElementEntryDetailResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           $ref: '#/components/schemas/PayElementEntryListItem'
 *
 * @swagger
 * /api/pay/element-entries:
 *   get:
 *     tags: [Payroll Element Entries]
 *     summary: List element entries
 *     description: |
 *       Reads from PAY.V_PAY_ELEMENT_ENTRIES for the Manage Element Entries list screen.
 *       enterprise_id is required. effective_date matches rows where the date falls between
 *       EFFECTIVE_START_DATE and EFFECTIVE_END_DATE (open-ended when EFFECTIVE_END_DATE is null).
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: employee_id
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: effective_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: element_id
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: classification
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Searches ELEMENT_NAME, EMP_NUMBER, CLASSIFICATION, and STATUS
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       '200':
 *         description: Paginated element entry list (empty array when no rows)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayElementEntryListResponse'
 *       '400':
 *         description: Validation error
 *       '500':
 *         description: Unexpected system error
 *
 * @swagger
 * /api/pay/element-entries/export:
 *   get:
 *     tags: [Payroll Element Entries]
 *     summary: Export element entries as Excel
 *     description: |
 *       Same filters as list (enterprise_id required). Returns all matching rows as an Excel
 *       download (no pagination). Nested entry/costing/context values are JSON-stringified.
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: employee_id
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: element_id
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: payroll_id
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: approval_status_code
 *         schema: { type: string }
 *       - in: query
 *         name: effective_start_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: effective_end_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [employee_id, element_id, effective_start_date, creation_date] }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [ASC, DESC] }
 *     responses:
 *       '200':
 *         description: Excel workbook (.xlsx) download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Validation error
 *       '404':
 *         description: No element entries found to export
 *       '500':
 *         description: Unexpected system error
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
 *           examples:
 *             minimalCreate:
 *               summary: Required fields only
 *               value:
 *                 enterprise_id: 1
 *                 employee_id: 292
 *                 element_id: 3
 *                 effective_as_of_date: '2026-07-15'
 *                 effective_start_date: '2026-07-15'
 *             fullCreate:
 *               summary: With optional value/context fields
 *               value:
 *                 enterprise_id: 1
 *                 employee_id: 292
 *                 element_id: 3
 *                 effective_as_of_date: '2026-07-15'
 *                 effective_start_date: '2026-07-15'
 *                 context_segment_code: OVERTIME_TYPE
 *                 context_value: WEEKEND
 *                 sub_classification_code: REGULAR_OVERTIME
 *                 currency_code: KWD
 *                 pay_value: 125.5
 *                 amount: 125.5
 *
 * @swagger
 * /api/pay/element-entries/{elementEntryGuid}:
 *   get:
 *     tags: [Payroll Element Entries]
 *     summary: Get element entry by GUID
 *     description: Returns one row from PAY.V_PAY_ELEMENT_ENTRIES by element_entry_guid.
 *     parameters:
 *       - in: path
 *         name: elementEntryGuid
 *         required: true
 *         schema: { type: string }
 *         description: 32-character element_entry_guid
 *     responses:
 *       '200':
 *         description: Element entry found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayElementEntryDetailResponse'
 *       '404':
 *         description: Element entry not found
 *       '400':
 *         description: Invalid GUID
 *       '500':
 *         description: Unexpected system error
 *   put:
 *     tags: [Payroll Element Entries]
 *     summary: Update element entry
 *     description: |
 *       Calls PAY.PAY_ELEMENT_ENTRIES_PKG.UPDATE_ELEMENT_ENTRY using element_entry_guid only.
 *       PATCH-style: omitted fields are preserved; explicit null clears stored values.
 *     parameters:
 *       - in: path
 *         name: elementEntryGuid
 *         required: true
 *         schema: { type: string }
 *         description: 32-character element_entry_guid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayElementEntryUpdateRequest'
 *           examples:
 *             partialAmount:
 *               summary: Change amount only
 *               value:
 *                 amount: 150
 *             clearOptionalFields:
 *               summary: Clear optional value/context fields
 *               value:
 *                 pay_value: null
 *                 amount: null
 *                 currency_code: null
 *                 context_segment_code: null
 *                 context_value: null
 *                 sub_classification_code: null
 *   delete:
 *     tags: [Payroll Element Entries]
 *     summary: Delete element entry
 *     description: Calls PAY.PAY_ELEMENT_ENTRIES_PKG.DELETE_ELEMENT_ENTRY using element_entry_guid only.
 *     parameters:
 *       - in: path
 *         name: elementEntryGuid
 *         required: true
 *         schema: { type: string }
 *         description: 32-character element_entry_guid
 */

export {};
