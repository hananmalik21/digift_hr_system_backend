/**
 * @swagger
 * tags:
 *   - name: Payroll Element Entry Controls
 *     description: One entry control per element via PAY.PAY_ELEMENT_ENTRY_CONTROLS_PKG (reads from PAY.V_PAY_ELEMENT_ENTRY_CONTROLS)
 *
 * @swagger
 * /api/pay/element-entry-controls:
 *   get:
 *     tags: [Payroll Element Entry Controls]
 *     summary: List element entry controls
 *     description: Reads from PAY.V_PAY_ELEMENT_ENTRY_CONTROLS with pagination and filters.
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
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *   post:
 *     tags: [Payroll Element Entry Controls]
 *     summary: Create element entry controls
 *     description: Only one entry control per element is allowed (UNIQUE ELEMENT_ID).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, max_entries_allowed]
 *             properties:
 *               element_id: { type: integer }
 *               max_entries_allowed: { type: integer }
 *               min_value: { type: number }
 *               max_value: { type: number }
 *               default_value: { type: number }
 *               allow_multiple_entries_flag: { type: string, enum: [Y, N] }
 *               allow_override_flag: { type: string, enum: [Y, N] }
 *               user_enterable_flag: { type: string, enum: [Y, N] }
 *               mandatory_entry_flag: { type: string, enum: [Y, N] }
 *               require_approval_flag: { type: string, enum: [Y, N] }
 *               auto_generate_entry_flag: { type: string, enum: [Y, N] }
 *
 * @swagger
 * /api/pay/element-entry-controls/{guid}:
 *   get:
 *     tags: [Payroll Element Entry Controls]
 *     summary: Get element entry controls by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Entry Controls]
 *     summary: Update element entry controls by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     tags: [Payroll Element Entry Controls]
 *     summary: Delete element entry controls by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 */

export {};
