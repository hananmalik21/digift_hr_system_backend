/**
 * @swagger
 * tags:
 *   - name: Payroll Element Eligibility Rules
 *     description: Element eligibility rules via PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG (reads from PAY.V_PAY_ELEMENT_ELIGIBILITY_RULES)
 *
 * @swagger
 * /api/pay/element-eligibility-rules:
 *   get:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: List element eligibility rules with criteria
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: eligibility_rule_guid
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: effective_end_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *   post:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: Create element eligibility rule with criteria
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enterprise_id
 *               - rule_name
 *               - criteria
 *             properties:
 *               enterprise_id: { type: integer }
 *               rule_name: { type: string }
 *               criteria:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [criteria_type_code]
 *                   properties:
 *                     criteria_type_code:
 *                       type: string
 *                       enum: [EMPLOYMENT_TYPE, GRADE, POSITION, LEGAL_EMPLOYER, BUSINESS_UNIT, DEPARTMENT, LOCATION]
 *                     criteria_value: { type: string }
 *                     criteria_values:
 *                       type: array
 *                       items: { type: string }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date }
 *               status: { type: string, enum: [ACTIVE, INACTIVE], default: ACTIVE }
 *
 * @swagger
 * /api/pay/element-eligibility-rules/{eligibilityRuleGuid}:
 *   get:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: Get element eligibility rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eligibilityRuleGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: Update element eligibility rule with criteria
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eligibilityRuleGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enterprise_id: { type: integer }
 *               rule_name: { type: string }
 *               criteria:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     criteria_type_code:
 *                       type: string
 *                       enum: [EMPLOYMENT_TYPE, GRADE, POSITION, LEGAL_EMPLOYER, BUSINESS_UNIT, DEPARTMENT, LOCATION]
 *                     criteria_value: { type: string }
 *                     criteria_values:
 *                       type: array
 *                       items: { type: string }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *   delete:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: Delete element eligibility rule
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eligibilityRuleGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: hard_delete
 *         schema: { type: string, enum: [Y, N], default: N }
 *
 * @swagger
 * /api/pay/element-eligibility-rules/{eligibilityRuleGuid}/status:
 *   patch:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: Set element eligibility rule status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eligibilityRuleGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *
 * @swagger
 * /api/pay/eligibility-criteria-values:
 *   get:
 *     tags: [Payroll Element Eligibility Rules]
 *     summary: List eligibility criteria values for dropdown
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: criteria_type_code
 *         required: true
 *         schema:
 *           type: string
 *           enum: [EMPLOYMENT_TYPE, GRADE, POSITION, LEGAL_EMPLOYER, BUSINESS_UNIT, DEPARTMENT, LOCATION]
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 */
