/**
 * @swagger
 * tags:
 *   - name: Payroll Element Frequency Rules
 *     description: Element frequency rules via PAY.PAY_ELEMENT_FREQUENCY_RULES_PKG (reads from PAY.V_PAY_ELEMENT_FREQUENCY_RULES)
 *
 * @swagger
 * /api/pay/element-frequency-rules:
 *   get:
 *     tags: [Payroll Element Frequency Rules]
 *     summary: List element frequency rules
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: element_id
 *         schema: { type: integer }
 *       - in: query
 *         name: element_guid
 *         schema: { type: string }
 *       - in: query
 *         name: frequency_type_code
 *         schema: { type: string }
 *       - in: query
 *         name: effective_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: sort_by
 *         schema: { type: string }
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *   post:
 *     tags: [Payroll Element Frequency Rules]
 *     summary: Create element frequency rule
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, frequency_type_code, effective_date]
 *             properties:
 *               element_id: { type: integer }
 *               frequency_type_code: { type: string }
 *               frequency_formula: { type: string }
 *               effective_date: { type: string, format: date }
 *
 * @swagger
 * /api/pay/element-frequency-rules/{frequencyRuleGuid}:
 *   get:
 *     tags: [Payroll Element Frequency Rules]
 *     summary: Get element frequency rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: frequencyRuleGuid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Frequency Rules]
 *     summary: Update element frequency rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: frequencyRuleGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [frequency_type_code, effective_date]
 *             properties:
 *               frequency_type_code: { type: string }
 *               frequency_formula: { type: string }
 *               effective_date: { type: string, format: date }
 *   delete:
 *     tags: [Payroll Element Frequency Rules]
 *     summary: Delete element frequency rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: frequencyRuleGuid
 *         required: true
 *         schema: { type: string }
 */

export {};
