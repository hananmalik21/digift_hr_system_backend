/**
 * @swagger
 * tags:
 *   - name: TM Overtime Requests
 *     description: >
 *       Overtime request lifecycle via TM.TM_OT_REQUESTS_PKG.
 *       Normal flow: DRAFT → SUBMITTED → APPROVED.
 *       APPROVED is final and eligible for TM→PAY (STATUS = 'APPROVED').
 *       HR validation is optional audit only — not required for payroll transfer.
 *
 * @swagger
 * components:
 *   schemas:
 *     TmOtRequestStatus:
 *       type: string
 *       description: >
 *         Authoritative Oracle status. Normal workflow uses DRAFT, SUBMITTED, APPROVED,
 *         REJECTED, WITHDRAWN. MANAGER_APPROVED is legacy only.
 *       enum: [DRAFT, SUBMITTED, APPROVED, REJECTED, WITHDRAWN, MANAGER_APPROVED]
 *     TmOtRequestPersisted:
 *       type: object
 *       description: Persisted Oracle overtime request (audit fields do not override status).
 *       properties:
 *         ot_request_id: { type: integer, example: 69 }
 *         ot_request_guid: { type: string }
 *         status: { $ref: '#/components/schemas/TmOtRequestStatus', example: APPROVED }
 *         manager_approved_by: { type: string, nullable: true, example: manager.user }
 *         manager_approved_date: { type: string, nullable: true }
 *         hr_validated_by:
 *           type: string
 *           nullable: true
 *           description: Optional audit only. Null does not block TM→PAY when status is APPROVED.
 *         hr_validated_date: { type: string, nullable: true }
 *
 * @swagger
 * /api/tm/overtime/requests/{ot_request_guid}/submit:
 *   post:
 *     tags: [TM Overtime Requests]
 *     summary: Submit overtime request (SUBMIT_REQUEST)
 *     description: DRAFT → SUBMITTED via TM.TM_OT_REQUESTS_PKG.SUBMIT_REQUEST. Returns persisted Oracle row.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ot_request_guid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenant_id, actor]
 *             properties:
 *               tenant_id: { type: integer, example: 1 }
 *               actor: { type: string, example: john.doe }
 *     responses:
 *       200:
 *         description: Submitted; status is SUBMITTED
 *
 * @swagger
 * /api/tm/overtime/requests/{ot_request_guid}/approve:
 *   post:
 *     tags: [TM Overtime Requests]
 *     summary: Approve overtime request (APPROVE_REQUEST)
 *     description: >
 *       SUBMITTED → APPROVED via TM.TM_OT_REQUESTS_PKG.APPROVE_REQUEST.
 *       APPROVED is final for TM→PAY. No separate HR-validation step is required.
 *       Returns the persisted Oracle request (including manager_approved_* audit fields when set).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: ot_request_guid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenant_id, actor]
 *             properties:
 *               tenant_id: { type: integer, example: 1 }
 *               actor: { type: string, example: manager.user }
 *     responses:
 *       200:
 *         description: Approved; status is APPROVED
 *         content:
 *           application/json:
 *             examples:
 *               approved:
 *                 value:
 *                   status: true
 *                   message: Overtime request approved successfully.
 *                   data:
 *                     ot_request_id: 69
 *                     status: APPROVED
 *                     manager_approved_by: manager.user
 *                     manager_approved_date: '2026-08-13 03:41:54'
 *                     hr_validated_by: null
 */
