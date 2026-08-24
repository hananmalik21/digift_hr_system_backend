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
 * List ENT.CURRENCIES (code + name), ordered by name then code.
 *
 * @query search - Optional partial match on CURRENCY_CODE or CURRENCY_NAME
 */
router.get('/', async (req, res) => {
  try {
    const data = await CurrenciesModel.findAll({
      search: normalizeCurrencySearch(req.query.search)
    });
    return sendCurrenciesList(res, data);
  } catch (error) {
    return sendCurrenciesServerError(res, error);
  }
});

export default router;
