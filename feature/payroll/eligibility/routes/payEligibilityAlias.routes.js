/**
 * Eligibility path aliases under /api/payroll/eligibility/*
 * Reuses existing DigifyHR eligibility rule/profile/evaluate handlers and adds
 * PAY.PAY_ELEMENT_ELIGIBILITY_ENGINE_PKG.EVALUATE_ELEMENT.
 */
import express from 'express';
import oracledb from 'oracledb';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementEligibilityRuleHandler,
  deleteElementEligibilityRuleHandler,
  getElementEligibilityRuleByGuidHandler,
  getElementEligibilityRulesHandler,
  setElementEligibilityRuleStatusHandler,
  updateElementEligibilityRuleHandler
} from '../../../pay/element_eligibility_rules/controllers/payElementEligibilityRules.controller.js';
import {
  createElementEligProfileHandler,
  deleteElementEligProfileHandler,
  getElementEligProfileByGuidHandler,
  getElementEligProfilesHandler,
  linkElementToEligProfileHandler,
  setElementEligProfileStatusHandler,
  unlinkElementFromEligProfileHandler,
  updateElementEligProfileHandler
} from '../../../pay/element_elig_profiles/controllers/payElementEligProfiles.controller.js';
import { evaluateEmployeeEligibilityHandler } from '../../../pay/eligibility/controller/payEligibilityController.js';
import {
  assertEnterpriseAccess,
  dateBind,
  executePayrollPackage,
  numberBind,
  okGet,
  optionalDate,
  requirePositiveInt,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../../shared/index.js';

const router = express.Router();

function mapRuleGuidParam(req, _res, next) {
  if (req.params.ruleGuid) req.params.eligibilityRuleGuid = req.params.ruleGuid;
  next();
}

router.get('/rules', ...getElementEligibilityRulesHandler);
router.get('/rules/:ruleGuid', mapRuleGuidParam, ...getElementEligibilityRuleByGuidHandler);
router.post('/rules', ...createElementEligibilityRuleHandler);
router.put('/rules/:ruleGuid', mapRuleGuidParam, ...updateElementEligibilityRuleHandler);
router.patch('/rules/:ruleGuid/status', mapRuleGuidParam, ...setElementEligibilityRuleStatusHandler);
router.delete('/rules/:ruleGuid', mapRuleGuidParam, ...deleteElementEligibilityRuleHandler);

router.get('/profiles', ...getElementEligProfilesHandler);
router.get('/profiles/:profileGuid', ...getElementEligProfileByGuidHandler);
router.post('/profiles', ...createElementEligProfileHandler);
router.put('/profiles/:profileGuid', ...updateElementEligProfileHandler);
router.patch('/profiles/:profileGuid/status', ...setElementEligProfileStatusHandler);
router.delete('/profiles/:profileGuid', ...deleteElementEligProfileHandler);
router.post('/profiles/:profileGuid/elements', ...linkElementToEligProfileHandler);
router.delete(
  '/profiles/:profileGuid/elements/:elementGuid',
  ...unlinkElementFromEligProfileHandler
);

router.post('/evaluate', ...evaluateEmployeeEligibilityHandler);

router.post(
  '/evaluate-element',
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const enterpriseId = resolveEnterpriseId(req, req.body?.enterprise_id);
      assertEnterpriseAccess(req, enterpriseId);
      const employeeId = requirePositiveInt(req.body?.employee_id, 'employee_id');
      const elementId = requirePositiveInt(req.body?.element_id, 'element_id');
      const asOf = optionalDate(req.body?.as_of_date, 'as_of_date') || new Date();

      const result = await executePayrollPackage(
        `BEGIN
           PAY.PAY_ELEMENT_ELIGIBILITY_ENGINE_PKG.EVALUATE_ELEMENT(
             P_ENTERPRISE_ID => :p_enterprise_id,
             P_EMPLOYEE_ID   => :p_employee_id,
             P_ELEMENT_ID    => :p_element_id,
             P_AS_OF_DATE    => :p_as_of_date,
             P_ELIGIBLE_FLAG => :p_eligible_flag,
             P_RESULT_JSON   => :p_result_json,
             P_SUCCESS       => :p_success,
             P_MESSAGE       => :p_message
           );
         END;`,
        {
          p_enterprise_id: numberBind(enterpriseId),
          p_employee_id: numberBind(employeeId),
          p_element_id: numberBind(elementId),
          p_as_of_date: dateBind(asOf),
          p_eligible_flag: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
          p_result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
          p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
          p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
        },
        {
          autoCommit: false,
          mapOut: async (_out, h) => ({
            eligible: String(h.str('p_eligible_flag') || '').toUpperCase() === 'Y',
            employee_id: employeeId,
            element_id: elementId,
            result: await h.parseJsonClob('p_result_json')
          })
        }
      );

      if (!result.success) {
        return sendOutcome(res, {
          success: false,
          httpStatus: 400,
          message: result.message,
          data: result.data
        });
      }

      return sendOutcome(res, okGet('Element eligibility evaluated successfully.', result.data));
    })
  )
);

export default router;
