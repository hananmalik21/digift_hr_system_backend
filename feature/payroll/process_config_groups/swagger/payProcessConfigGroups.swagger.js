/**
 * @swagger
 * tags:
 *   - name: Payroll Process Configuration Groups
 *     description: Process configuration groups via PAY.PAY_PROCESS_CONFIG_GROUPS_PKG. Oracle owns business rules.
 *
 * @swagger
 * components:
 *   schemas:
 *     PayrollProcessConfigGroupWrite:
 *       type: object
 *       required: [enterprise_id, group_name, group_code]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         group_name: { type: string, example: Kuwait Standard Payroll Processing }
 *         group_code: { type: string, example: KW_STANDARD_PROCESS }
 *         description: { type: string, example: Standard process configuration group for Kuwait payroll processing }
 *         status: { type: string, enum: [ACTIVE, INACTIVE], example: ACTIVE }
 *
 * @swagger
 * /api/payroll/process-configuration-groups:
 *   get:
 *     tags: [Payroll Process Configuration Groups]
 *     summary: List process configuration groups (LIST_GROUPS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *   post:
 *     tags: [Payroll Process Configuration Groups]
 *     summary: Create process configuration group (CREATE_GROUP)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollProcessConfigGroupWrite' }
 *
 * @swagger
 * /api/payroll/process-configuration-groups/{groupId}:
 *   get:
 *     tags: [Payroll Process Configuration Groups]
 *     summary: Get process configuration group (GET_GROUP)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Process Configuration Groups]
 *     summary: Update process configuration group (UPDATE_GROUP)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollProcessConfigGroupWrite' }
 *   delete:
 *     tags: [Payroll Process Configuration Groups]
 *     summary: Delete process configuration group (DELETE_GROUP)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *
 * @swagger
 * /api/payroll/process-configuration-groups/{groupId}/status:
 *   patch:
 *     tags: [Payroll Process Configuration Groups]
 *     summary: Set process configuration group status (SET_STATUS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
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
 *               status: { type: string, enum: [ACTIVE, INACTIVE], example: ACTIVE }
 */
