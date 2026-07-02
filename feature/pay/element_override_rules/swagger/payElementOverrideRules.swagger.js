/**
 * @swagger
 * tags:
 *   - name: Payroll Element Override Rules
 *     description: Element override rules via PAY.PAY_ELEMENT_OVERRIDE_RULES_PKG (reads from PAY.V_PAY_ELEMENT_OVERRIDE_RULES)
 *
 * @swagger
 * /api/pay/element-override-rules:
 *   get:
 *     tags: [Payroll Element Override Rules]
 *     summary: List element override rules
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
 *         name: approval_required_code
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
 *       - in: query
 *         name: sort_by
 *         schema: { type: string }
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *   post:
 *     tags: [Payroll Element Override Rules]
 *     summary: Create element override rule
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, approval_required_code]
 *             properties:
 *               element_id: { type: integer }
 *               max_override_percent: { type: number, minimum: 0, maximum: 100 }
 *               max_override_amount: { type: number, minimum: 0 }
 *               approval_required_code: { type: string }
 *
 * @swagger
 * /api/pay/element-override-rules/{overrideRuleGuid}:
 *   get:
 *     tags: [Payroll Element Override Rules]
 *     summary: Get element override rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: overrideRuleGuid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Override Rules]
 *     summary: Update element override rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: overrideRuleGuid
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     tags: [Payroll Element Override Rules]
 *     summary: Delete element override rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: overrideRuleGuid
 *         required: true
 *         schema: { type: string }
 */

export {};
