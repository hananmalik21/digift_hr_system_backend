/**
 * @swagger
 * tags:
 *   - name: Payroll Element Processing Rules
 *     description: One processing rule per element via PAY.PAY_ELEMENT_PROCESSING_RULES_PKG (reads from PAY.V_PAY_ELEMENT_PROCESSING_RULES). Optional FORMULA_ID links PAY_FORMULAS.
 *
 * @swagger
 * components:
 *   schemas:
 *     PayElementProcessingRule:
 *       type: object
 *       properties:
 *         processing_rule_id: { type: integer }
 *         processing_rule_guid: { type: string }
 *         element_id: { type: integer }
 *         element_guid: { type: string, nullable: true }
 *         element_code: { type: string, nullable: true }
 *         element_name: { type: string, nullable: true }
 *         formula_id: { type: integer, nullable: true }
 *         formula_guid: { type: string, nullable: true }
 *         formula_code: { type: string, nullable: true }
 *         formula_name: { type: string, nullable: true }
 *         formula_type_code: { type: string, nullable: true }
 *         formula_engine_code: { type: string, nullable: true }
 *         return_type_code: { type: string, nullable: true }
 *         return_value_code: { type: string, nullable: true }
 *         formula_status: { type: string, nullable: true }
 *         processing_type_code:
 *           type: string
 *           enum: [RECURRING, NONRECURRING, INDIRECT, ONCE_EACH_PERIOD]
 *         priority: { type: number, nullable: true }
 *         processing_group_code: { type: string, nullable: true }
 *         effective_start_date: { type: string, format: date, nullable: true }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         legislative_data_group: { type: string, nullable: true }
 *         process_every_payroll_flag: { type: string, enum: [Y, N], nullable: true }
 *         retroactive_flag: { type: string, enum: [Y, N], nullable: true }
 *         proration_flag: { type: string, enum: [Y, N], nullable: true }
 *         process_separately_flag: { type: string, enum: [Y, N], nullable: true }
 *         include_quickpay_flag: { type: string, enum: [Y, N], nullable: true }
 *         include_simulation_flag: { type: string, enum: [Y, N], nullable: true }
 *
 * @swagger
 * /api/pay/element-processing-rules:
 *   get:
 *     tags: [Payroll Element Processing Rules]
 *     summary: List element processing rules
 *     description: Reads from PAY.V_PAY_ELEMENT_PROCESSING_RULES with pagination and filters. Formula fields are null when no formula is linked (LEFT JOIN).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: element_id
 *         schema: { type: integer }
 *       - in: query
 *         name: element_guid
 *         schema: { type: string }
 *       - in: query
 *         name: classification_code
 *         schema: { type: string }
 *       - in: query
 *         name: processing_type_code
 *         schema: { type: string, enum: [RECURRING, NONRECURRING, INDIRECT, ONCE_EACH_PERIOD] }
 *       - in: query
 *         name: processing_group_code
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of processing rules including optional formula metadata
 *   post:
 *     tags: [Payroll Element Processing Rules]
 *     summary: Create element processing rule
 *     description: Only one rule per element is allowed (UNIQUE ELEMENT_ID). Optional formula_id links a payroll formula from the same enterprise.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, processing_type_code, effective_start_date]
 *             properties:
 *               element_id: { type: integer }
 *               formula_id:
 *                 type: integer
 *                 nullable: true
 *                 description: Optional. Positive integer to link a formula, or null.
 *               processing_type_code:
 *                 type: string
 *                 enum: [RECURRING, NONRECURRING, INDIRECT, ONCE_EACH_PERIOD]
 *               priority: { type: integer }
 *               processing_group_code: { type: string }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date, nullable: true }
 *               legislative_data_group: { type: string }
 *               process_every_payroll_flag: { type: string, enum: [Y, N] }
 *               retroactive_flag: { type: string, enum: [Y, N] }
 *               proration_flag: { type: string, enum: [Y, N] }
 *               process_separately_flag: { type: string, enum: [Y, N] }
 *               include_quickpay_flag: { type: string, enum: [Y, N] }
 *               include_simulation_flag: { type: string, enum: [Y, N] }
 *
 * @swagger
 * /api/pay/element-processing-rules/{guid}:
 *   get:
 *     tags: [Payroll Element Processing Rules]
 *     summary: Get element processing rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Processing Rules]
 *     summary: Update element processing rule by GUID
 *     description: |
 *       PATCH-like partial update. Only supplied fields are changed.
 *       formula_id omitted keeps existing link; formula_id number links/changes; formula_id null unlinks.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               element_id: { type: integer }
 *               formula_id: { type: integer, nullable: true }
 *               processing_type_code:
 *                 type: string
 *                 enum: [RECURRING, NONRECURRING, INDIRECT, ONCE_EACH_PERIOD]
 *               priority: { type: number }
 *               processing_group_code: { type: string, nullable: true }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date, nullable: true }
 *               legislative_data_group: { type: string, nullable: true }
 *               process_every_payroll_flag: { type: string, enum: [Y, N] }
 *               retroactive_flag: { type: string, enum: [Y, N] }
 *               proration_flag: { type: string, enum: [Y, N] }
 *               process_separately_flag: { type: string, enum: [Y, N] }
 *               include_quickpay_flag: { type: string, enum: [Y, N] }
 *               include_simulation_flag: { type: string, enum: [Y, N] }
 *           examples:
 *             linkFormula:
 *               value: { formula_id: 9 }
 *             unlinkFormula:
 *               value: { formula_id: null }
 *             changePriorityOnly:
 *               value: { priority: 140 }
 *   delete:
 *     tags: [Payroll Element Processing Rules]
 *     summary: Delete element processing rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 */

export {};
