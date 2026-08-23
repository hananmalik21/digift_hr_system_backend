import { ValidationError } from '../../utils/errors/ValidationError.js';
import { AppError } from '../../utils/errors/AppError.js';
import { ERROR_CODES } from '../constants/currency.constants.js';

export class CurrencyValidationError extends ValidationError {
  constructor(message) {
    super(message);
  }
}

export class ExchangeRateNotFoundError extends AppError {
  constructor(fromCurrency, toCurrency, conversionDate) {
    const message =
      `No exchange rate found for ${fromCurrency} to ${toCurrency} for ${conversionDate}.`;
    super(message, 404, ERROR_CODES.EXCHANGE_RATE_NOT_FOUND, message);
    this.fromCurrency = fromCurrency;
    this.toCurrency = toCurrency;
    this.conversionDate = conversionDate;
  }
}

export class CurrencyProviderError extends AppError {
  constructor(fromCurrency, toCurrency) {
    const message = `Unable to retrieve exchange rate for ${fromCurrency} to ${toCurrency}`;
    super(message, 502, ERROR_CODES.EXCHANGE_RATE_PROVIDER_ERROR, message);
    this.fromCurrency = fromCurrency;
    this.toCurrency = toCurrency;
  }
}
