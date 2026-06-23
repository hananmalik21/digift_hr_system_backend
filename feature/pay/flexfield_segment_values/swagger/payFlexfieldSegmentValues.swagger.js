/**
 * @swagger
 * tags:
 *   - name: Payroll Flexfield Segment Values
 *     description: Segment value CRUD via PAY.PAY_FLEXFIELD_VALUES_PKG (SEGMENT_CODE resolution)
 *
 * @swagger
 * /api/pay/flexfield-segment-values:
 *   get:
 *     tags: [Payroll Flexfield Segment Values]
 *     summary: List segment values
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     tags: [Payroll Flexfield Segment Values]
 *     summary: Create segment value
 *     security: [{ bearerAuth: [] }]
 *
 * @swagger
 * /api/pay/flexfield-segment-values/by-segment/{segmentCode}:
 *   get:
 *     tags: [Payroll Flexfield Segment Values]
 *     summary: Get value lookup list by segment code
 *     security: [{ bearerAuth: [] }]
 *
 * @swagger
 * /api/pay/flexfield-segment-values/{segmentValueGuid}:
 *   get:
 *     tags: [Payroll Flexfield Segment Values]
 *     summary: Get segment value by GUID
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     tags: [Payroll Flexfield Segment Values]
 *     summary: Update segment value
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     tags: [Payroll Flexfield Segment Values]
 *     summary: Delete segment value
 *     security: [{ bearerAuth: [] }]
 */

export {};
