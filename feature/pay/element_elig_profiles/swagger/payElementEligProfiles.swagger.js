/**
 * @swagger
 * tags:
 *   - name: Payroll Element Eligibility Profiles
 *     description: Element eligibility profiles via PAY.PAY_ELEMENT_ELIG_PROFILES_PKG
 *
 * @swagger
 * /api/pay/element-elig-profiles:
 *   get:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: List element eligibility profiles with attached rules
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: profile_guid
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *   post:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Create element eligibility profile
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enterprise_id, profile_name, eligibility_rules]
 *             properties:
 *               enterprise_id: { type: integer }
 *               profile_name: { type: string }
 *               profile_description: { type: string }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               eligibility_rules:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                     - type: object
 *                       properties:
 *                         eligibility_rule_guid: { type: string }
 *
 * @swagger
 * /api/pay/element-elig-profiles/{profileGuid}:
 *   get:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Get element eligibility profile by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *   put:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Update element eligibility profile
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profile_name: { type: string }
 *               profile_description: { type: string }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               eligibility_rules:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                     - type: object
 *                       properties:
 *                         eligibility_rule_guid: { type: string }
 *   delete:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Delete element eligibility profile
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: hard_delete
 *         schema: { type: string, enum: [Y, N] }
 *
 * @swagger
 * /api/pay/element-elig-profiles/{profileGuid}/status:
 *   patch:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Set element eligibility profile status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *
 * @swagger
 * /api/pay/element-elig-profiles/{profileGuid}/elements:
 *   post:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Link a payroll element to an eligibility profile
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enterprise_id, element_guid]
 *             properties:
 *               enterprise_id: { type: integer }
 *               element_guid: { type: string }
 *
 * @swagger
 * /api/pay/element-elig-profiles/{profileGuid}/elements/{elementGuid}:
 *   delete:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Unlink a payroll element from an eligibility profile
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: elementGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 */
