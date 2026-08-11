/**
 * Payment methods & bank accounts routes.
 * Mounted at /api/payroll → /employees/:employeeId/payment-methods, /payment-methods,
 * /payment-methods/:paymentMethodGuid/bank-accounts, /bank-accounts
 */

import express from 'express';
import {
  createBankAccountHandler,
  createPaymentMethodHandler,
  deleteBankAccountHandler,
  deletePaymentMethodHandler,
  getBankAccountHandler,
  getPaymentMethodHandler,
  listBankAccountsHandler,
  listPaymentMethodsHandler,
  rejectUnmaskedFieldsMiddleware,
  setBankAccountStatusHandler,
  setBankAccountVerificationHandler,
  setPrimaryPaymentMethodHandler,
  updateBankAccountHandler,
  updatePaymentMethodHandler
} from './paymentMethods.controller.js';

const router = express.Router();
const employeePaymentMethodsRouter = express.Router({ mergeParams: true });
const paymentMethodsRouter = express.Router({ mergeParams: true });
const bankAccountsRouter = express.Router({ mergeParams: true });

router.use(rejectUnmaskedFieldsMiddleware);

// Employee-scoped payment methods + bank accounts
employeePaymentMethodsRouter.get('/payment-methods', listPaymentMethodsHandler);
employeePaymentMethodsRouter.post('/payment-methods', createPaymentMethodHandler);
employeePaymentMethodsRouter.get('/bank-accounts', listBankAccountsHandler);
employeePaymentMethodsRouter.post('/bank-accounts', createBankAccountHandler);
router.use('/employees/:employeeId', employeePaymentMethodsRouter);

// Payment methods (by guid) + nested bank accounts
paymentMethodsRouter.get('/', listPaymentMethodsHandler);
paymentMethodsRouter.post('/', createPaymentMethodHandler);
paymentMethodsRouter.get('/:paymentMethodGuid', getPaymentMethodHandler);
paymentMethodsRouter.put('/:paymentMethodGuid', updatePaymentMethodHandler);
paymentMethodsRouter.delete('/:paymentMethodGuid', deletePaymentMethodHandler);
paymentMethodsRouter.patch('/:paymentMethodGuid/primary', setPrimaryPaymentMethodHandler);
paymentMethodsRouter.get('/:paymentMethodGuid/bank-accounts', listBankAccountsHandler);
paymentMethodsRouter.post('/:paymentMethodGuid/bank-accounts', createBankAccountHandler);
router.use('/payment-methods', paymentMethodsRouter);

// Bank accounts (by guid)
bankAccountsRouter.get('/:bankAccountGuid', getBankAccountHandler);
bankAccountsRouter.put('/:bankAccountGuid', updateBankAccountHandler);
bankAccountsRouter.patch('/:bankAccountGuid/verification', setBankAccountVerificationHandler);
bankAccountsRouter.patch('/:bankAccountGuid/status', setBankAccountStatusHandler);
bankAccountsRouter.delete('/:bankAccountGuid', deleteBankAccountHandler);
router.use('/bank-accounts', bankAccountsRouter);

export default router;
