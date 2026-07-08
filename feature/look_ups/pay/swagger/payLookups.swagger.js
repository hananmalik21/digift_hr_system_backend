/**
 * Payroll Lookups — Swagger/OpenAPI JSDoc.
 * Canonical spec: docs/pay_lookups_api.openapi.yaml
 *
 * @swagger
 * tags:
 *   - name: Payroll Lookup Types
 *     description: Lookup types via PAY.V_PAY_LOOKUP_TYPES and PAY.PAY_LOOKUPS_PKG
 *   - name: Payroll Lookup Values
 *     description: Lookup values via PAY.V_PAY_LOOKUP_VALUES and PAY.PAY_LOOKUPS_PKG
 *
 * @swagger
 * /api/pay/lookups/types:
 *   get:
 *     tags: [Payroll Lookup Types]
 *     summary: List lookup types
 *     description: Reads PAY.V_PAY_LOOKUP_TYPES
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: active_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, enum: [type_code, type_name] }
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       '200':
 *         description: Paginated lookup types
 *   post:
 *     tags: [Payroll Lookup Types]
 *     summary: Create lookup type
 *     description: Calls PAY.PAY_LOOKUPS_PKG.CREATE_LOOKUP_TYPE
 *
 * @swagger
 * /api/pay/lookups/types/{guid}:
 *   get:
 *     tags: [Payroll Lookup Types]
 *     summary: Get lookup type by GUID
 *     description: Reads PAY.V_PAY_LOOKUP_TYPES
 *   put:
 *     tags: [Payroll Lookup Types]
 *     summary: Update lookup type
 *   delete:
 *     tags: [Payroll Lookup Types]
 *     summary: Delete lookup type
 *
 * @swagger
 * /api/pay/lookups/values:
 *   get:
 *     tags: [Payroll Lookup Values]
 *     summary: List lookup values
 *     description: |
 *       Reads PAY.V_PAY_LOOKUP_VALUES. Returns global (ENTERPRISE_ID IS NULL)
 *       and enterprise-specific values for the supplied enterprise_id.
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: type_code
 *         schema: { type: string }
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
 *     responses:
 *       '200':
 *         description: Global + enterprise lookup values
 *   post:
 *     tags: [Payroll Lookup Values]
 *     summary: Create lookup value
 *
 * @swagger
 * /api/pay/lookups/values/bulk:
 *   post:
 *     tags: [Payroll Lookup Values]
 *     summary: Bulk create lookup values
 *     description: |
 *       Calls PAY.PAY_LOOKUPS_PKG.CREATE_LOOKUP_VALUES_BULK.
 *       Top-level enterprise_id is the default for rows that omit enterprise_id.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type_code, enterprise_id, values]
 *             properties:
 *               type_code: { type: string }
 *               enterprise_id: { type: integer, nullable: true }
 *               values:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [value_code, value_name]
 *                   properties:
 *                     value_code: { type: string }
 *                     value_name: { type: string }
 *                     enterprise_id: { type: integer, nullable: true }
 *                     display_sequence: { type: integer }
 *     responses:
 *       '201':
 *         description: Bulk created
 *
 * @swagger
 * /api/pay/lookups/values/{guid}:
 *   get:
 *     tags: [Payroll Lookup Values]
 *     summary: Get lookup value by GUID
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Lookup Values]
 *     summary: Update lookup value
 *   delete:
 *     tags: [Payroll Lookup Values]
 *     summary: Delete lookup value
 */

export {};
