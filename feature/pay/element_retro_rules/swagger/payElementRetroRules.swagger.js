/**
 * @swagger
 * tags:
 *   - name: Payroll Element Retro Rules
 *     description: One retro rule per element via PAY.PAY_ELEMENT_RETRO_RULES_PKG (reads from PAY.V_PAY_ELEMENT_RETRO_RULES)
 *
 * @swagger
 * /api/pay/element-retro-rules:
 *   get:
 *     tags: [Payroll Element Retro Rules]
 *     summary: List element retro rules
 *     description: Reads from PAY.V_PAY_ELEMENT_RETRO_RULES with pagination, filtering, and search.
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
 *         name: category_code
 *         schema: { type: string }
 *       - in: query
 *         name: enable_retro_flag
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
 *         schema: { type: string, enum: [element_code, enable_retro_flag, creation_date] }
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *   post:
 *     tags: [Payroll Element Retro Rules]
 *     summary: Create element retro rule
 *     description: Only one retro rule per element is allowed (UNIQUE ELEMENT_ID).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id]
 *             properties:
 *               element_id: { type: integer }
 *               enable_retro_flag: { type: string, enum: [Y, N] }
 *               auto_recalculate_flag: { type: string, enum: [Y, N] }
 *               generate_retro_entries_flag: { type: string, enum: [Y, N] }
 *               create_notification_flag: { type: string, enum: [Y, N] }
 *               salary_change_flag: { type: string, enum: [Y, N] }
 *               grade_change_flag: { type: string, enum: [Y, N] }
 *               position_change_flag: { type: string, enum: [Y, N] }
 *               assignment_change_flag: { type: string, enum: [Y, N] }
 *               element_update_flag: { type: string, enum: [Y, N] }
 *
 * @swagger
 * /api/pay/element-retro-rules/{guid}:
 *   get:
 *     tags: [Payroll Element Retro Rules]
 *     summary: Get element retro rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Retro Rules]
 *     summary: Update element retro rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     tags: [Payroll Element Retro Rules]
 *     summary: Delete element retro rule by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 */

export {};
