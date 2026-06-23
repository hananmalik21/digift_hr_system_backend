/**
 * Payroll Elements — Swagger/OpenAPI JSDoc.
 * Canonical spec: docs/pay_elements_api.openapi.yaml
 *
 * @swagger
 * tags:
 *   - name: Payroll Elements
 *     description: Pay element CRUD via PAY.PAY_ELEMENTS_PKG (ELEMENT_GUID primary key)
 *
 * @swagger
 * components:
 *   schemas:
 *     PayElementCostingValue:
 *       type: object
 *       required: [segment_id, segment_value_id]
 *       properties:
 *         segment_id: { type: integer, example: 1 }
 *         segment_value_id: { type: integer, example: 10 }
 *     PayElementCostingValueDetail:
 *       type: object
 *       properties:
 *         segment_id: { type: integer, example: 1 }
 *         segment_name: { type: string, example: Cost Center }
 *         segment_value_id: { type: integer, example: 10 }
 *         segment_value_name: { type: string, example: IT }
 *     PayElementProcessingControls:
 *       type: object
 *       properties:
 *         recurring_flag: { type: string, enum: [Y, N] }
 *         costable_flag: { type: string, enum: [Y, N] }
 *         taxable_flag: { type: string, enum: [Y, N] }
 *         pensionable_flag: { type: string, enum: [Y, N] }
 *         retro_enabled_flag: { type: string, enum: [Y, N] }
 *         proration_enabled_flag: { type: string, enum: [Y, N] }
 *         priority: { type: integer, example: 100 }
 *         processing_frequency: { type: string, example: MONTHLY }
 *     PayElementCreateRequest:
 *       type: object
 *       required: [enterprise_id, element_code, element_name]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         element_code: { type: string, example: BASIC_SALARY }
 *         element_name: { type: string, example: Basic Salary }
 *         description: { type: string, example: Monthly Basic Salary }
 *         category_code: { type: string, example: EARNINGS }
 *         classification_code: { type: string, example: STANDARD_EARNINGS }
 *         secondary_classification: { type: string, example: REGULAR }
 *         legislative_data_group: { type: string, example: KUWAIT }
 *         effective_start_date: { type: string, format: date, example: '2026-01-01' }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         recurring_flag: { type: string, enum: [Y, N] }
 *         costable_flag: { type: string, enum: [Y, N] }
 *         taxable_flag: { type: string, enum: [Y, N] }
 *         pensionable_flag: { type: string, enum: [Y, N] }
 *         retro_enabled_flag: { type: string, enum: [Y, N] }
 *         proration_enabled_flag: { type: string, enum: [Y, N] }
 *         priority: { type: integer, example: 100 }
 *         processing_frequency: { type: string, example: MONTHLY }
 *         costing_values:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PayElementCostingValue'
 *     PayElementUpdateRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/PayElementCreateRequest'
 *     PayElement:
 *       type: object
 *       properties:
 *         element_id: { type: integer }
 *         element_guid: { type: string, example: A1B2C3D4E5F678901234567890ABCDEF }
 *         enterprise_id: { type: integer }
 *         element_code: { type: string }
 *         element_name: { type: string }
 *         description: { type: string }
 *         category_code: { type: string }
 *         classification_code: { type: string }
 *         secondary_classification: { type: string }
 *         legislative_data_group: { type: string }
 *         effective_start_date: { type: string, format: date }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         processing_controls:
 *           $ref: '#/components/schemas/PayElementProcessingControls'
 *         costing_values:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PayElementCostingValueDetail'
 *     PayElementCreateResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         message: { type: string, example: Element created successfully }
 *         data:
 *           type: object
 *           properties:
 *             element_id: { type: integer, example: 100 }
 *             element_guid: { type: string, example: A1B2C3D4E5F678901234567890ABCDEF }
 *
 * @swagger
 * /api/pay/elements:
 *   get:
 *     tags: [Payroll Elements]
 *     summary: List pay elements
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: element_code
 *         schema: { type: string }
 *       - in: query
 *         name: element_name
 *         schema: { type: string }
 *       - in: query
 *         name: category_code
 *         schema: { type: string }
 *       - in: query
 *         name: classification_code
 *         schema: { type: string }
 *       - in: query
 *         name: recurring_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: costable_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: taxable_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [element_code, element_name, creation_date] }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       '200':
 *         description: Paginated list
 *   post:
 *     tags: [Payroll Elements]
 *     summary: Create pay element
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayElementCreateRequest'
 *     responses:
 *       '200':
 *         description: Element created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayElementCreateResponse'
 *
 * @swagger
 * /api/pay/elements/{elementGuid}:
 *   get:
 *     tags: [Payroll Elements]
 *     summary: Get pay element by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: elementGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *     responses:
 *       '200':
 *         description: Element details
 *   put:
 *     tags: [Payroll Elements]
 *     summary: Update pay element
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: elementGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayElementUpdateRequest'
 *     responses:
 *       '200':
 *         description: Element updated
 *   delete:
 *     tags: [Payroll Elements]
 *     summary: Delete pay element
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: elementGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *     responses:
 *       '200':
 *         description: Element deleted
 */

export {};
