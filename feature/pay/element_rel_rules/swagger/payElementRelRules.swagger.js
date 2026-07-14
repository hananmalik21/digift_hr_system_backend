/**
 * @swagger
 * tags:
 *   - name: Payroll Element Relationship Rules
 *     description: Element relationship rules via PAY.PAY_ELEMENT_REL_RULES_PKG (reads from PAY.V_PAY_ELEMENT_REL_RULES)
 *
 * @swagger
 * components:
 *   schemas:
 *     PayElementRelRuleOrgUnitHierarchyNode:
 *       type: object
 *       properties:
 *         name: { type: string, example: Software Development }
 *         level_code: { type: string, example: DEPARTMENT }
 *     PayElementRelRule:
 *       type: object
 *       properties:
 *         rule_id: { type: integer }
 *         rule_guid: { type: string }
 *         element_id: { type: integer }
 *         element_guid: { type: string }
 *         element_code: { type: string }
 *         element_name: { type: string }
 *         element_description: { type: string, nullable: true }
 *         category_code: { type: string, nullable: true }
 *         classification_code: { type: string, nullable: true }
 *         secondary_classification: { type: string, nullable: true }
 *         legislative_data_group: { type: string, nullable: true }
 *         effective_start_date: { type: string, format: date, nullable: true }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         enterprise_id: { type: integer }
 *         scope_configuration_code: { type: string }
 *         scope_configuration_name: { type: string, nullable: true }
 *         payroll_id: { type: integer, nullable: true }
 *         payroll_display: { type: string }
 *         org_unit_guid: { type: string, nullable: true, description: Lowercase hex GUID; null when rule applies to all org units }
 *         org_unit_display: { type: string, description: Org unit name, or "All" when unrestricted }
 *         org_unit_hierarchy:
 *           type: array
 *           description: Parsed parent hierarchy from ORG_UNIT_HIERARCHY_JSON; [] when unrestricted or invalid
 *           items:
 *             $ref: '#/components/schemas/PayElementRelRuleOrgUnitHierarchyNode'
 *         grade_id: { type: integer, nullable: true }
 *         grade_display: { type: string }
 *         position_guid: { type: string, nullable: true }
 *         position_display: { type: string }
 *         active_flag: { type: string, enum: [Y, N] }
 *         created_by: { type: string, nullable: true }
 *         creation_date: { type: string, format: date-time, nullable: true }
 *         last_updated_by: { type: string, nullable: true }
 *         last_update_date: { type: string, format: date-time, nullable: true }
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
 *     responses:
 *       200:
 *         description: Paginated relationship rules including org_unit_guid, org_unit_display, and parsed org_unit_hierarchy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PayElementRelRule'
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
 *     responses:
 *       200:
 *         description: Single relationship rule with org-unit hierarchy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   $ref: '#/components/schemas/PayElementRelRule'
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
