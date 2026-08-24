import express from 'express';
import CurrenciesModel from '../model/currenciesModel.js';
import { normalizeCurrencySearch } from '../utils/currenciesQuery.js';
import {
  sendCurrenciesList,
  sendCurrenciesServerError
} from '../view/currenciesView.js';

const router = express.Router();

/**
 * GET /api/enterprise/currencies
 * List ENT.CURRENCIES codes alphabetically.
 *
 * @query search - Optional partial match on CURRENCY_CODE (case-insensitive)
 */
router.get('/', async (req, res) => {
  try {
    const search = normalizeCurrencySearch(req.query.search);
    const data = await CurrenciesModel.findAll(search != null ? { search } : {});
    return sendCurrenciesList(res, data);
  } catch (error) {
    return sendCurrenciesServerError(res, error);
  }
});

export default router;
