/**
 * Payroll Flexfield Segments — Swagger/OpenAPI JSDoc.
 * Canonical spec: docs/pay_flexfield_segments_api.openapi.yaml
 *
 * @swagger
 * tags:
 *   - name: Payroll Flexfield Segments
 *     description: Flexfield structure segment CRUD via PAY.PAY_FLEXFIELD_SEGMENTS_PKG (SEGMENT_GUID primary key)
 *
 * @swagger
 * components:
 *   schemas:
 *     PayFlexfieldSegmentCreateRequest:
 *       type: object
 *       required: [enterprise_id, segment_name, segment_code, data_type, max_length]
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         segment_name: { type: string, example: Product Line }
 *         segment_code: { type: string, example: PRODUCT_LINE }
 *         description: { type: string, example: Product hierarchy segment }
 *         data_type: { type: string, enum: [TEXT, NUMBER, DATE, LOV], example: TEXT }
 *         max_length: { type: integer, example: 30 }
 *         display_sequence: { type: integer, example: 1 }
 *         required_flag: { type: string, enum: [Y, N], example: Y }
 *         enabled_flag: { type: string, enum: [Y, N], example: Y }
 *     PayFlexfieldSegmentUpdateRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/PayFlexfieldSegmentCreateRequest'
 *     PayFlexfieldSegment:
 *       type: object
 *       properties:
 *         segment_id: { type: integer, example: 101 }
 *         segment_guid: { type: string, example: A8F4B9D2E6C14A56B7C891D4E3F5A621 }
 *         enterprise_id: { type: integer, example: 1 }
 *         segment_name: { type: string, example: Product Line }
 *         segment_code: { type: string, example: PRODUCT_LINE }
 *         description: { type: string }
 *         data_type: { type: string, enum: [TEXT, NUMBER, DATE, LOV] }
 *         max_length: { type: integer, example: 30 }
 *         display_sequence: { type: integer, example: 1 }
 *         required_flag: { type: string, enum: [Y, N] }
 *         required_flag_display: { type: string, example: Yes }
 *         enabled_flag: { type: string, enum: [Y, N] }
 *         enabled_flag_display: { type: string, example: Enabled }
 *         created_by: { type: string }
 *         creation_date: { type: string, format: date-time }
 *         last_updated_by: { type: string }
 *         last_update_date: { type: string, format: date-time }
 *     PayFlexfieldSegmentCreateResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         message: { type: string, example: Segment created successfully }
 *         data:
 *           type: object
 *           properties:
 *             segment_id: { type: integer, example: 101 }
 *             segment_guid: { type: string, example: A8F4B9D2E6C14A56B7C891D4E3F5A621 }
 *
 * @swagger
 * /api/pay/flexfield-segments:
 *   get:
 *     tags: [Payroll Flexfield Segments]
 *     summary: List flexfield segments
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: segment_guid
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *       - in: query
 *         name: segment_name
 *         schema: { type: string }
 *       - in: query
 *         name: segment_code
 *         schema: { type: string }
 *       - in: query
 *         name: data_type
 *         schema: { type: string, enum: [TEXT, NUMBER, DATE, LOV] }
 *       - in: query
 *         name: required_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: enabled_flag
 *         schema: { type: string, enum: [Y, N] }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [segment_name, segment_code, display_sequence, creation_date] }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated list
 *   post:
 *     tags: [Payroll Flexfield Segments]
 *     summary: Create flexfield segment
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayFlexfieldSegmentCreateRequest'
 *     responses:
 *       200:
 *         description: Create outcome
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayFlexfieldSegmentCreateResponse'
 *
 * @swagger
 * /api/pay/flexfield-segments/{segmentGuid}:
 *   get:
 *     tags: [Payroll Flexfield Segments]
 *     summary: Get segment by GUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: segmentGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *     responses:
 *       200:
 *         description: Segment detail
 *       404:
 *         description: Not found
 *   put:
 *     tags: [Payroll Flexfield Segments]
 *     summary: Update flexfield segment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: segmentGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayFlexfieldSegmentUpdateRequest'
 *     responses:
 *       200:
 *         description: Update outcome
 *   delete:
 *     tags: [Payroll Flexfield Segments]
 *     summary: Delete flexfield segment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: segmentGuid
 *         required: true
 *         schema: { type: string, pattern: '^[0-9A-Fa-f]{32}$' }
 *     responses:
 *       200:
 *         description: Delete outcome
 */

export {};
