/**
 * @swagger
 * tags:
 *   - name: Payroll Element Input Values
 *     description: Element input value CRUD via PAY.PAY_ELEMENT_INPUT_VALUES_PKG (reads from PAY.V_PAY_ELEMENT_INPUT_VALUES)
 *
 * @swagger
 * /api/pay/element-input-values:
 *   get:
 *     tags: [Payroll Element Input Values]
 *     summary: List element input values
 *     description: Reads from PAY.V_PAY_ELEMENT_INPUT_VALUES with enterprise, element, classification, status, and search filters.
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
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Searches ELEMENT_CODE, ELEMENT_NAME, INPUT_VALUE_NAME, DATA_TYPE_CODE
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *   post:
 *     tags: [Payroll Element Input Values]
 *     summary: Create element input value
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [element_id, input_value_name, data_type_code]
 *             properties:
 *               element_id: { type: integer }
 *               input_value_name: { type: string }
 *               data_type_code: { type: string }
 *               default_value: { type: string }
 *               min_value: { type: number }
 *               max_value: { type: number }
 *               validation_formula: { type: string, nullable: true }
 *               required_flag: { type: string, enum: [Y, N] }
 *               user_enterable_flag: { type: string, enum: [Y, N] }
 *               display_sequence: { type: integer }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *
 * @swagger
 * /api/pay/element-input-values/{guid}:
 *   get:
 *     tags: [Payroll Element Input Values]
 *     summary: Get element input value by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   put:
 *     tags: [Payroll Element Input Values]
 *     summary: Update element input value by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     tags: [Payroll Element Input Values]
 *     summary: Delete element input value by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema: { type: string }
 */

export {};
