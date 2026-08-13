/**
 * @swagger
 * tags:
 *   - name: TM Payroll Source Mappings
 *     description: >
 *       TM → PAY source mappings via TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG.CREATE_OR_UPDATE_SOURCE_MAPPING (V2).
 *       OVERTIME_REQUEST uses a simplified shared-data contract; Oracle normalizes transfer config and derives
 *       standard weekly hours from the published TM work pattern. Do not send TM OT config / schedule fields.
 *
 * @swagger
 * components:
 *   schemas:
 *     TmOvertimeSourceMappingCreate:
 *       type: object
 *       description: Simplified OVERTIME_REQUEST create/update body (V2). Oracle-owned fields are optional.
 *       required:
 *         - enterprise_id
 *         - source_type_code
 *         - payroll_element_id
 *         - effective_start_date
 *         - hours_input_value_name
 *         - multiplier_input_value_name
 *         - hourly_rate_input_value_name
 *         - hourly_rate_source_element_id
 *       properties:
 *         enterprise_id: { type: integer, example: 1 }
 *         source_type_code: { type: string, example: OVERTIME_REQUEST }
 *         source_subtype_code: { type: string, default: '*', example: '*' }
 *         payroll_id: { type: integer, example: 15, nullable: true }
 *         payroll_element_id: { type: integer, example: 71 }
 *         hours_input_value_name: { type: string, example: Hours }
 *         multiplier_input_value_name: { type: string, example: Multiplier }
 *         hourly_rate_input_value_name: { type: string, example: Hourly Rate }
 *         hourly_rate_source_element_id: { type: integer, example: 67 }
 *         hourly_rate_source_value_code: { type: string, default: PAY_VALUE, example: PAY_VALUE }
 *         effective_start_date: { type: string, format: date, example: '2026-08-01' }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         status_code: { type: string, default: ACTIVE, example: ACTIVE }
 *         description: { type: string, nullable: true }
 *         payroll_source_code:
 *           type: string
 *           description: Optional (backward compatible). Omitted → Oracle sets MANUAL_ENTRY for OVERTIME_REQUEST.
 *         calculation_owner_code:
 *           type: string
 *           description: Optional. Omitted → Oracle sets PAYROLL for OVERTIME_REQUEST.
 *         transfer_unit_code:
 *           type: string
 *           description: Optional for OVERTIME_REQUEST. Omitted → Oracle sets HOURS.
 *         sign_multiplier:
 *           type: number
 *           description: Optional for OVERTIME_REQUEST. Omitted → Oracle sets 1.
 *         hourly_rate_source_code:
 *           type: string
 *           description: Optional. Omitted → Oracle sets PAYROLL_ELEMENT_VALUE for OVERTIME_REQUEST.
 *         hourly_rate_fixed_value: { type: number, nullable: true }
 *         hourly_rate_divisor:
 *           type: number
 *           nullable: true
 *           description: Do not send for OVERTIME_REQUEST. Oracle derives divisor from published TM work pattern.
 *         hourly_rate_policy_id:
 *           type: integer
 *           nullable: true
 *           description: Not used for OVERTIME_REQUEST V2 shared-data path.
 *     TmGenericSourceMappingCreate:
 *       type: object
 *       description: Non-overtime / generic source mapping (legacy policy-capable path).
 *       required:
 *         - enterprise_id
 *         - source_type_code
 *         - payroll_element_id
 *         - transfer_unit_code
 *         - effective_start_date
 *       properties:
 *         enterprise_id: { type: integer }
 *         source_type_code: { type: string }
 *         source_subtype_code: { type: string, default: '*' }
 *         payroll_id: { type: integer, nullable: true }
 *         payroll_element_id: { type: integer }
 *         payroll_source_code: { type: string }
 *         calculation_owner_code: { type: string }
 *         transfer_unit_code: { type: string, example: HOURS }
 *         hours_input_value_name: { type: string }
 *         days_input_value_name: { type: string }
 *         multiplier_input_value_name: { type: string }
 *         rate_type_input_value_name: { type: string }
 *         source_date_input_value_name: { type: string }
 *         sign_multiplier: { type: number }
 *         default_currency_code: { type: string }
 *         effective_start_date: { type: string, format: date }
 *         effective_end_date: { type: string, format: date, nullable: true }
 *         status_code: { type: string, default: ACTIVE }
 *         description: { type: string }
 *         hourly_rate_input_value_name: { type: string }
 *         hourly_rate_source_code: { type: string }
 *         hourly_rate_fixed_value: { type: number, nullable: true }
 *         hourly_rate_source_element_id: { type: integer }
 *         hourly_rate_source_value_code: { type: string, default: PAY_VALUE }
 *         hourly_rate_divisor: { type: number, nullable: true }
 *     TmSourceMappingPersisted:
 *       type: object
 *       description: Persisted Oracle mapping (read-back). For OVERTIME_REQUEST includes V2-normalized values.
 *       properties:
 *         payroll_source_mapping_id: { type: integer, example: 123 }
 *         enterprise_id: { type: integer, example: 1 }
 *         source_type_code: { type: string, example: OVERTIME_REQUEST }
 *         source_subtype_code: { type: string, example: '*' }
 *         payroll_id: { type: integer, example: 15 }
 *         payroll_element_id: { type: integer, example: 71 }
 *         payroll_source_code: { type: string, example: MANUAL_ENTRY }
 *         calculation_owner_code: { type: string, example: PAYROLL }
 *         transfer_unit_code: { type: string, example: HOURS }
 *         hours_input_value_name: { type: string, example: HOURS }
 *         multiplier_input_value_name: { type: string, example: MULTIPLIER }
 *         hourly_rate_input_value_name: { type: string, example: HOURLY RATE }
 *         hourly_rate_source_code: { type: string, example: PAYROLL_ELEMENT_VALUE }
 *         hourly_rate_source_element_id: { type: integer, example: 67 }
 *         hourly_rate_source_value_code: { type: string, example: PAY_VALUE }
 *         hourly_rate_divisor: { type: number, nullable: true, example: null }
 *         hourly_rate_policy_id: { type: integer, nullable: true, example: null }
 *         sign_multiplier: { type: number, example: 1 }
 *         status_code: { type: string, example: ACTIVE }
 *
 * @swagger
 * /api/payroll/time-management/source-mappings:
 *   get:
 *     tags: [TM Payroll Source Mappings]
 *     summary: List payroll source mappings
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enterprise_id
 *         schema: { type: integer }
 *       - in: query
 *         name: payroll_id
 *         schema: { type: integer }
 *       - in: query
 *         name: source_type_code
 *         schema: { type: string, example: OVERTIME_REQUEST }
 *       - in: query
 *         name: status
 *         schema: { type: string, example: ACTIVE }
 *   post:
 *     tags: [TM Payroll Source Mappings]
 *     summary: Create source mapping (CREATE_OR_UPDATE_SOURCE_MAPPING)
 *     description: >
 *       For source_type_code=OVERTIME_REQUEST use the simplified shared-data body.
 *       Oracle normalizes payroll_source_code, calculation_owner_code, transfer_unit_code,
 *       sign_multiplier, hourly_rate_source_code, and leaves hourly_rate_divisor null
 *       (rate resolution uses published TM work-pattern weekly hours).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/TmOvertimeSourceMappingCreate'
 *               - $ref: '#/components/schemas/TmGenericSourceMappingCreate'
 *           examples:
 *             overtimeRequestV2:
 *               summary: OVERTIME_REQUEST simplified (V2)
 *               value:
 *                 enterprise_id: 1
 *                 source_type_code: OVERTIME_REQUEST
 *                 source_subtype_code: '*'
 *                 payroll_id: 15
 *                 payroll_element_id: 71
 *                 hours_input_value_name: Hours
 *                 multiplier_input_value_name: Multiplier
 *                 hourly_rate_input_value_name: Hourly Rate
 *                 hourly_rate_source_element_id: 67
 *                 hourly_rate_source_value_code: PAY_VALUE
 *                 effective_start_date: '2026-08-01'
 *                 effective_end_date: null
 *                 status_code: ACTIVE
 *                 description: Optional description
 *             genericMapping:
 *               summary: Non-overtime generic mapping
 *               value:
 *                 enterprise_id: 1
 *                 source_type_code: ATTENDANCE
 *                 source_subtype_code: '*'
 *                 payroll_id: 15
 *                 payroll_element_id: 10
 *                 transfer_unit_code: HOURS
 *                 hours_input_value_name: Hours
 *                 effective_start_date: '2026-08-01'
 *                 status_code: ACTIVE
 *     responses:
 *       201:
 *         description: Mapping created; data is the Oracle-persisted row (normalized for OT)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   $ref: '#/components/schemas/TmSourceMappingPersisted'
 *
 * @swagger
 * /api/payroll/time-management/source-mappings/{mappingId}:
 *   get:
 *     tags: [TM Payroll Source Mappings]
 *     summary: Get source mapping by id
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: mappingId
 *         required: true
 *         schema: { type: integer }
 *   put:
 *     tags: [TM Payroll Source Mappings]
 *     summary: Update source mapping (CREATE_OR_UPDATE_SOURCE_MAPPING)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: mappingId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/TmOvertimeSourceMappingCreate'
 *               - $ref: '#/components/schemas/TmGenericSourceMappingCreate'
 *           examples:
 *             overtimeRequestV2:
 *               summary: OVERTIME_REQUEST simplified update (V2)
 *               value:
 *                 source_type_code: OVERTIME_REQUEST
 *                 source_subtype_code: '*'
 *                 payroll_id: 15
 *                 payroll_element_id: 71
 *                 hours_input_value_name: Hours
 *                 multiplier_input_value_name: Multiplier
 *                 hourly_rate_input_value_name: Hourly Rate
 *                 hourly_rate_source_element_id: 67
 *                 hourly_rate_source_value_code: PAY_VALUE
 *                 effective_start_date: '2026-08-01'
 *                 status_code: ACTIVE
 *
 * @swagger
 * /api/payroll/time-management/source-mappings/{mappingId}/status:
 *   patch:
 *     tags: [TM Payroll Source Mappings]
 *     summary: Patch source mapping status (no hard-delete)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: mappingId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status_code]
 *             properties:
 *               status_code: { type: string, example: INACTIVE }
 */
export {};
