/**
 * @swagger
 * tags:
 *   - name: Payroll Element Proration Rules
 *     description: Element proration rules via PAY.PAY_ELEMENT_PRORATION_RULES_PKG (reads from PAY.V_PAY_ELEMENT_PRORATION_RULES)
 *
 * @swagger
 * /api/pay/element-proration-rules:
 *   get:
 *     tags: [Payroll Element Proration Rules]
 *     summary: List element proration rules
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: element_id
 *         schema: { type: integer }
 *       - in: query
 *         name: element_guid
 *         schema: { type: string }
 *       - in: query
 *         name: element_code
 *         schema: { type: string }
 *       - in: query
 *         name: element_name
 *         schema: { type: string }
 *       - in: query
 *         name: proration_method_code
 *         schema: { type: string }
 *       - in: query
 *         name: effective_date_rule
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
 *     tags: [Payroll Element Proration Rules]
 *     summary: Create element proration rule
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, proration_method_code, effective_date_rule]
 *             properties:
 *               element_id: { type: integer }
 *               proration_method_code: { type: string }
 *               proration_formula: { type: string }
 *               effective_date_rule: { type: string }
 *
 * @swagger
 * /api/pay/element-proration-rules/{prorationRuleGuid}:
 *   get:
 *     tags: [Payroll Element Proration Rules]
 *     summary: Get element proration rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: prorationRuleGuid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Proration Rules]
 *     summary: Update element proration rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: prorationRuleGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               proration_method_code: { type: string }
 *               proration_formula: { type: string }
 *               effective_date_rule: { type: string }
 *   delete:
 *     tags: [Payroll Element Proration Rules]
 *     summary: Delete element proration rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: prorationRuleGuid
 *         required: true
 *         schema: { type: string }
 */

export {};
