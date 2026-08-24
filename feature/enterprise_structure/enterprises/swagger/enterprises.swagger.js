/**
 * Enterprise APIs — Swagger/OpenAPI JSDoc.
 * Backed by ENT.ENT_ENTERPRISES_PKG.INVOKE.
 *
 * @swagger
 * tags:
 *   - name: Enterprises
 *     description: Enterprise CRUD via ENT.ENT_ENTERPRISES_PKG
 *
 * @swagger
 * components:
 *   schemas:
 *     EnterpriseCurrencyCode:
 *       type: string
 *       minLength: 3
 *       maxLength: 3
 *       example: KWD
 *       description: Enterprise default ISO-style three-letter currency code
 *     Enterprise:
 *       type: object
 *       properties:
 *         enterprise_id: { type: integer, example: 3 }
 *         enterprise_code: { type: string, example: DIGIFY_SOLUTIONS_LLC }
 *         enterprise_name: { type: string, example: Digify Solutions LLC }
 *         currency_code:
 *           $ref: '#/components/schemas/EnterpriseCurrencyCode'
 *         subdomain_slug: { type: string, example: digify-solutions-llc }
 *         is_active: { type: string, enum: [Y, N], example: Y }
 *         career_portal_enabled_flag: { type: string, enum: [Y, N], example: Y }
 *         main_application_url: { type: string, nullable: true }
 *         career_portal_url: { type: string, nullable: true }
 *     EnterpriseCreateRequest:
 *       type: object
 *       required:
 *         - enterprise_code
 *         - enterprise_name
 *         - currency_code
 *       properties:
 *         enterprise_code: { type: string, example: DIGIFY }
 *         enterprise_name: { type: string, example: Digify Solutions }
 *         currency_code:
 *           $ref: '#/components/schemas/EnterpriseCurrencyCode'
 *         is_active: { type: string, enum: [Y, N], example: Y }
 *         career_portal_enabled_flag: { type: string, enum: [Y, N], example: Y }
 *         subdomain_slug: { type: string, example: digify-solutions }
 *     EnterpriseUpdateRequest:
 *       type: object
 *       properties:
 *         enterprise_code: { type: string }
 *         enterprise_name: { type: string }
 *         currency_code:
 *           $ref: '#/components/schemas/EnterpriseCurrencyCode'
 *         is_active: { type: string, enum: [Y, N] }
 *         career_portal_enabled_flag: { type: string, enum: [Y, N] }
 *         subdomain_slug: { type: string, nullable: true }
 *     EnterpriseContextResponse:
 *       type: object
 *       properties:
 *         enterprise_id: { type: integer, example: 3 }
 *         enterprise_code: { type: string, example: DIGIFY_SOLUTIONS_LLC }
 *         enterprise_name: { type: string, example: Digify Solutions LLC }
 *         currency_code:
 *           $ref: '#/components/schemas/EnterpriseCurrencyCode'
 *         subdomain_slug: { type: string, example: digify-solutions-llc }
 *         portal_type: { type: string, enum: [MAIN, CAREER], example: MAIN }
 *         is_active: { type: string, enum: [Y, N], example: Y }
 *         main_application_url: { type: string, nullable: true }
 *         career_portal_url: { type: string, nullable: true }
 *
 * @swagger
 * /api/enterprises:
 *   get:
 *     tags: [Enterprises]
 *     summary: List enterprises (LIST)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: enterprise_code
 *         schema: { type: string }
 *       - in: query
 *         name: currency_code
 *         schema:
 *           $ref: '#/components/schemas/EnterpriseCurrencyCode'
 *         description: Filter by enterprise default currency
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Enterprises fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Enterprise'
 *   post:
 *     tags: [Enterprises]
 *     summary: Create enterprise (CREATE)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EnterpriseCreateRequest'
 *     responses:
 *       201:
 *         description: Enterprise created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Enterprise'
 *
 * @swagger
 * /api/enterprises/{id}:
 *   get:
 *     tags: [Enterprises]
 *     summary: Get enterprise (GET)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Enterprise fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Enterprise'
 *   put:
 *     tags: [Enterprises]
 *     summary: Update enterprise (UPDATE)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EnterpriseUpdateRequest'
 *     responses:
 *       200:
 *         description: Enterprise updated successfully
 *   patch:
 *     tags: [Enterprises]
 *     summary: Partial update enterprise (UPDATE)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EnterpriseUpdateRequest'
 *     responses:
 *       200:
 *         description: Enterprise updated successfully
 *
 * @swagger
 * /api/public/enterprise-context:
 *   get:
 *     tags: [Enterprises]
 *     summary: Resolve enterprise context from hostname (RESOLVE_SUBDOMAIN)
 *     responses:
 *       200:
 *         description: Enterprise context for the tenant hostname
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/EnterpriseContextResponse'
 */
