/**
 * @swagger
 * tags:
 *   - name: Payroll Consolidation Groups
 *     description: Consolidation groups via PAY.PAY_CONSOLIDATION_GROUPS_PKG. Oracle owns business rules.
 *
 * @swagger
 * components:
 *   schemas:
 *     PayrollConsolidationGroupWrite:
 *       type: object
 *       required: [enterprise_id, group_name, group_code]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         group_name: { type: string, example: Kuwait Monthly Consolidation }
 *         group_code: { type: string, example: KW_MONTHLY_CONSOL }
 *         description: { type: string, example: Default consolidation group for Kuwait monthly payroll processing }
 *         status: { type: string, enum: [ACTIVE, INACTIVE], example: ACTIVE }
 *
 * @swagger
 * /api/payroll/consolidation-groups:
 *   get:
 *     tags: [Payroll Consolidation Groups]
 *     summary: List consolidation groups (LIST_GROUPS)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *   post:
 *     tags: [Payroll Consolidation Groups]
 *     summary: Create consolidation group (CREATE_GROUP)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PayrollConsolidationGroupWrite' }
 *
 * @swagger
 * /api/payroll/consolidation-groups/{groupId}:
 *   get:
 *     tags: [Payroll Consolidation Groups]
 *     summary: Get consolidation group (GET_GROUP)
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
 *     tags: [Payroll Consolidation Groups]
 *     summary: Update consolidation group (UPDATE_GROUP)
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
 *           schema: { $ref: '#/components/schemas/PayrollConsolidationGroupWrite' }
 *   delete:
 *     tags: [Payroll Consolidation Groups]
 *     summary: Delete consolidation group (DELETE_GROUP)
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
 * /api/payroll/consolidation-groups/{groupId}/status:
 *   patch:
 *     tags: [Payroll Consolidation Groups]
 *     summary: Set consolidation group status (SET_STATUS)
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
