/**
 * FNDSEC Functions — Swagger/OpenAPI JSDoc.
 * Backed by FNDSEC.FNDSEC_FUNCTIONS_PKG (JSON P_RESPONSE on all operations).
 *
 * @swagger
 * tags:
 *   - name: Security Functions
 *     description: Function catalog CRUD via FNDSEC.FNDSEC_FUNCTIONS_PKG
 *
 * @swagger
 * components:
 *   schemas:
 *     FndsecFunctionPackageResponse:
 *       type: object
 *       properties:
 *         status: { type: boolean, example: true }
 *         message: { type: string, example: Function created successfully }
 *         data: { type: object }
 *     FndsecFunctionCreateRequest:
 *       type: object
 *       required:
 *         - module_guid
 *         - function_code
 *         - function_name
 *         - permission_key
 *         - created_by
 *       properties:
 *         enterprise_id:
 *           type: integer
 *           minimum: 1
 *           description: Accepted by the API for compatibility; not passed to FNDSEC_FUNCTIONS_PKG
 *           example: 1
 *         module_guid:
 *           type: string
 *           description: 32-char hex module GUID (dashes optional)
 *           example: A1B2C3D4E5F678901234567890ABCDEF
 *         function_code:
 *           type: string
 *           description: Stored uppercase by the API before calling Oracle
 *           example: EMP_VIEW
 *         function_name:
 *           type: string
 *           example: View Employees
 *         permission_key:
 *           type: string
 *           description: Mandatory and unique per enterprise. `"*"` is valid.
 *           example: EMP_VIEW
 *         function_type:
 *           type: string
 *           nullable: true
 *           description: Optional. Empty string is sent as NULL to Oracle.
 *           example: PAGE
 *         description:
 *           type: string
 *           nullable: true
 *         route_url:
 *           type: string
 *           nullable: true
 *           example: /employees
 *         display_order:
 *           type: integer
 *           nullable: true
 *         active_flag:
 *           type: string
 *           enum: [Y, N]
 *         is_system_flag:
 *           type: string
 *           enum: [Y, N]
 *         created_by:
 *           type: string
 *           example: ADMIN
 *     FndsecFunctionUpdateRequest:
 *       type: object
 *       properties:
 *         enterprise_id: { type: integer, minimum: 1 }
 *         module_guid: { type: string }
 *         function_code: { type: string }
 *         function_name: { type: string }
 *         permission_key:
 *           type: string
 *           description: Case preserved. `"*"` is valid.
 *         function_type:
 *           type: string
 *           nullable: true
 *           description: Optional. Empty string is sent as NULL to Oracle.
 *         description: { type: string, nullable: true }
 *         route_url: { type: string, nullable: true }
 *         display_order: { type: integer, nullable: true }
 *         active_flag: { type: string, enum: [Y, N] }
 *         is_system_flag: { type: string, enum: [Y, N] }
 *         updated_by: { type: string }
 *
 * @swagger
 * /api/security/functions:
 *   get:
 *     tags: [Security Functions]
 *     summary: List functions (GET_FUNCTIONS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Applied in Node after GET_FUNCTIONS (not a package parameter)
 *       - in: query
 *         name: function_id
 *         schema: { type: integer }
 *       - in: query
 *         name: module_id
 *         schema: { type: integer }
 *       - in: query
 *         name: function_code
 *         schema: { type: string }
 *       - in: query
 *         name: active_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       '200':
 *         description: Package JSON response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FndsecFunctionPackageResponse'
 *       '400':
 *         description: Package validation/business error
 *   post:
 *     tags: [Security Functions]
 *     summary: Create function (CREATE_FUNCTION)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FndsecFunctionCreateRequest'
 *     responses:
 *       '201':
 *         description: Function created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FndsecFunctionPackageResponse'
 *       '400':
 *         description: Package validation/business error (e.g. duplicate function_code or permission_key)
 *
 * @swagger
 * /api/security/functions/{functionGuid}:
 *   get:
 *     tags: [Security Functions]
 *     summary: Get function by GUID (GET_FUNCTION)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: functionGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f-]{32,36}$' }
 *     responses:
 *       '200':
 *         description: Package JSON response
 *       '400':
 *         description: Package validation/business error
 *   put:
 *     tags: [Security Functions]
 *     summary: Update function (UPDATE_FUNCTION)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: functionGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f-]{32,36}$' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FndsecFunctionUpdateRequest'
 *     responses:
 *       '200':
 *         description: Function updated
 *       '400':
 *         description: Package validation/business error
 *   delete:
 *     tags: [Security Functions]
 *     summary: Delete function (DELETE_FUNCTION)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: functionGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f-]{32,36}$' }
 *     responses:
 *       '200':
 *         description: Function deleted
 *       '400':
 *         description: Package validation/business error
 */
