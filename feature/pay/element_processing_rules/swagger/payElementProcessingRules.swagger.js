/**
 * @swagger
 * tags:
 *   - name: Payroll Element Processing Rules
 *     description: One processing rule per element via PAY.PAY_ELEMENT_PROCESSING_RULES_PKG (reads from PAY.V_PAY_ELEMENT_PROCESSING_RULES)
 *
 * @swagger
 * /api/pay/element-processing-rules:
 *   get:
 *     tags: [Payroll Element Processing Rules]
 *     summary: List element processing rules
 *     description: Reads from PAY.V_PAY_ELEMENT_PROCESSING_RULES with pagination and filters.
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
 *   post:
 *     tags: [Payroll Element Processing Rules]
 *     summary: Create element processing rule
 *     description: Only one rule per element is allowed (UNIQUE ELEMENT_ID).
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
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
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
