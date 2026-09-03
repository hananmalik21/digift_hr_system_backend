/**
 * @swagger
 * tags:
 *   - name: Payroll Flows
 *     description: Payroll flow definitions via PAY.PAY_PAYROLL_FLOWS_PKG. Oracle owns business rules.
 *
 * @swagger
 * components:
 *   schemas:
 *     PayrollFlowWrite:
 *       type: object
 *       required: [enterprise_id, flow_name, flow_code]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         flow_name: { type: string, example: Digify Simplified Payroll Cycle KW }
 *         flow_code: { type: string, example: SIMPLIFIED_PAYROLL_KW }
 *         description: { type: string, example: Simplified Kuwait payroll processing cycle }
 *         default_run_type_code: { type: string, example: REGULAR }
 *         default_run_mode_code: { type: string, example: NORMAL }
 *         default_schedule_code: { type: string, example: ASAP }
 *         status: { type: string, enum: [ACTIVE, INACTIVE], example: ACTIVE }
 *
 * @swagger
 * /api/payroll/flows:
 *   get:
 *     tags: [Payroll Flows]
 *     summary: List payroll flows (LIST_FLOWS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *   post:
 *     tags: [Payroll Flows]
 *     summary: Create payroll flow (CREATE_FLOW)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollFlowWrite' }
 *     responses:
 *       201:
 *         description: Flow created from Oracle O_RESULT_JSON
 *
 * @swagger
 * /api/payroll/flows/{flowId}:
 *   get:
 *     tags: [Payroll Flows]
 *     summary: Get payroll flow (GET_FLOW)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Flows]
 *     summary: Update payroll flow (UPDATE_FLOW)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollFlowWrite' }
 *   delete:
 *     tags: [Payroll Flows]
 *     summary: Delete payroll flow (DELETE_FLOW)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *
 * @swagger
 * /api/payroll/flows/{flowId}/status:
 *   patch:
 *     tags: [Payroll Flows]
 *     summary: Set payroll flow status (SET_STATUS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flowId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               enterprise_id: { type: integer, example: 1 }
 *               status: { type: string, enum: [ACTIVE, INACTIVE], example: INACTIVE }
 */
