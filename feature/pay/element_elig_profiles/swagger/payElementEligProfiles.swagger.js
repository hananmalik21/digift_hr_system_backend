/**
 * @swagger
 * tags:
 *   - name: Payroll Element Eligibility Profiles
 *     description: Element eligibility profiles via PAY.PAY_ELEMENT_PROFILES_PKG (UPSERT_PROFILE + LINK_RULE)
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
 *     summary: Create/upsert eligibility profile and link rules
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enterprise_id, profile_code, profile_name, eligibility_rules_json]
 *             properties:
 *               enterprise_id: { type: integer }
 *               profile_code: { type: string }
 *               profile_name: { type: string }
 *               description: { type: string }
 *               match_logic_code: { type: string, enum: [ANY, ALL], default: ANY }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               eligibility_rules_json:
 *                 description: Array or JSON string of rules to LINK_RULE after UPSERT_PROFILE
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: object
 *                       required: [eligibility_rule_id]
 *                       properties:
 *                         eligibility_rule_id: { type: integer }
 *                         rule_sequence: { type: integer, default: 1 }
 *                         active_flag: { type: string, enum: [Y, N], default: Y }
 *                   - type: string
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
 *     summary: Update eligibility profile (optional LINK_RULE for provided rules; omitted rules are not unlinked)
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
 *               profile_code: { type: string }
 *               profile_name: { type: string }
 *               description: { type: string }
 *               match_logic_code: { type: string, enum: [ANY, ALL] }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               eligibility_rules_json:
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         eligibility_rule_id: { type: integer }
 *                         rule_sequence: { type: integer }
 *                         active_flag: { type: string, enum: [Y, N] }
 *                   - type: string
 *   delete:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Soft-delete profile (SET_STATUS INACTIVE)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: profileGuid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *
 * @swagger
 * /api/pay/element-elig-profiles/{profileGuid}/status:
 *   patch:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Set eligibility profile status
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
 *     summary: Link an element to a profile
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
 *             required: [element_guid, effective_start_date]
 *             properties:
 *               enterprise_id: { type: integer }
 *               element_guid: { type: string }
 *               effective_start_date: { type: string, format: date }
 *               effective_end_date: { type: string, format: date }
 *               status: { type: string, enum: [ACTIVE, INACTIVE], default: ACTIVE }
 *
 * @swagger
 * /api/pay/element-elig-profiles/{profileGuid}/elements/{elementGuid}:
 *   delete:
 *     tags: [Payroll Element Eligibility Profiles]
 *     summary: Unlink element from profile (set link INACTIVE)
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
 *         required: true
 *         schema: { type: integer }
 */
