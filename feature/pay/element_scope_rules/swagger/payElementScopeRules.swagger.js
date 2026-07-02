/**
 * @swagger
 * tags:
 *   - name: Payroll Element Scope Rules
 *     description: Element scope rules via PAY.PAY_ELEMENT_SCOPE_RULES_PKG (reads from PAY.V_PAY_ELEMENT_SCOPE_RULES)
 *
 * @swagger
 * /api/pay/element-scope-rules:
 *   get:
 *     tags: [Payroll Element Scope Rules]
 *     summary: List element scope rules
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
 *         name: scope_level_code
 *         schema: { type: string, enum: [ASSIGNMENT, PAYROLL_RELATIONSHIP, LEGAL_EMPLOYER, ENTERPRISE] }
 *       - in: query
 *         name: payroll_id
 *         schema: { type: integer }
 *       - in: query
 *         name: legal_employer_id
 *         schema: { type: string, format: uuid }
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
 *     tags: [Payroll Element Scope Rules]
 *     summary: Create element scope rule
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, scope_level_code]
 *             properties:
 *               element_id: { type: integer }
 *               scope_level_code: { type: string, enum: [ASSIGNMENT, PAYROLL_RELATIONSHIP, LEGAL_EMPLOYER, ENTERPRISE] }
 *               payroll_id: { type: integer }
 *               legal_employer_id: { type: string, format: uuid }
 *               org_unit_id: { type: string, format: uuid }
 *               grade_id: { type: integer }
 *               position_id: { type: string, format: uuid }
 *
 * @swagger
 * /api/pay/element-scope-rules/{scopeRuleGuid}:
 *   get:
 *     tags: [Payroll Element Scope Rules]
 *     summary: Get element scope rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: scopeRuleGuid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Scope Rules]
 *     summary: Update element scope rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: scopeRuleGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope_level_code]
 *             properties:
 *               scope_level_code: { type: string, enum: [ASSIGNMENT, PAYROLL_RELATIONSHIP, LEGAL_EMPLOYER, ENTERPRISE] }
 *               payroll_id: { type: integer }
 *               legal_employer_id: { type: string, format: uuid }
 *               org_unit_id: { type: string, format: uuid }
 *               grade_id: { type: integer }
 *               position_id: { type: string, format: uuid }
 *   delete:
 *     tags: [Payroll Element Scope Rules]
 *     summary: Delete element scope rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: scopeRuleGuid
 *         required: true
 *         schema: { type: string }
 */

export {};
