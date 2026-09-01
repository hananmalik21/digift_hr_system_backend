import { asyncHandler } from '@digifyhr/common';
import { convertCurrency } from '../services/currency.service.js';
import { parseConvertBody } from '../validators/currency.validator.js';

export const convert = asyncHandler(async (req, res) => {
  const input = parseConvertBody(req.body || {});
  const data = await convertCurrency(input);
  return res.status(200).json({ success: true, data });
});
