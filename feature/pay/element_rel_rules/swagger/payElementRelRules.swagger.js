/**
 * @swagger
 * tags:
 *   - name: Payroll Element Relationship Rules
 *     description: Element relationship rules via PAY.PAY_ELEMENT_REL_RULES_PKG (reads from PAY.V_PAY_ELEMENT_REL_RULES)
 *
 * @swagger
 * /api/pay/element-rel-rules:
 *   get:
 *     tags: [Payroll Element Relationship Rules]
 *     summary: List element relationship rules
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
 *         name: scope_configuration_code
 *         schema: { type: string }
 *       - in: query
 *         name: payroll_id
 *         schema: { type: integer }
 *       - in: query
 *         name: org_unit_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: grade_id
 *         schema: { type: integer }
 *       - in: query
 *         name: position_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: active_flag
 *         schema: { type: string, enum: [Y, N] }
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
 *     tags: [Payroll Element Relationship Rules]
 *     summary: Create element relationship rule
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, enterprise_id, scope_configuration_code]
 *             properties:
 *               element_id: { type: integer }
 *               enterprise_id: { type: integer }
 *               scope_configuration_code: { type: string }
 *               payroll_id: { type: integer }
 *               org_unit_id: { type: string, format: uuid }
 *               grade_id: { type: integer }
 *               position_id: { type: string, format: uuid }
 *               active_flag: { type: string, enum: [Y, N], default: Y }
 *
 * @swagger
 * /api/pay/element-rel-rules/{ruleGuid}:
 *   get:
 *     tags: [Payroll Element Relationship Rules]
 *     summary: Get element relationship rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ruleGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Element Relationship Rules]
 *     summary: Update element relationship rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ruleGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope_configuration_code]
 *             properties:
 *               scope_configuration_code: { type: string }
 *               payroll_id: { type: integer }
 *               org_unit_id: { type: string, format: uuid }
 *               grade_id: { type: integer }
 *               position_id: { type: string, format: uuid }
 *               active_flag: { type: string, enum: [Y, N] }
 *   delete:
 *     tags: [Payroll Element Relationship Rules]
 *     summary: Delete element relationship rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ruleGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: hard_delete
 *         schema: { type: string, enum: [Y, N], default: N }
 */

export {};
