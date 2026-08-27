import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { toSnakeCaseDeep } from '../../shared/entDbClient.js';
import {
  buildCurrencyByCodeQuery,
  buildCurrenciesListQuery,
  mapCurrencyRows
} from '../utils/currenciesQuery.js';

/**
 * Read-only model for ENT.CURRENCIES (no ENT package — shared pool SELECT).
 * Source of truth for currency_code, currency_name, and decimal_places.
 */
class CurrenciesModel {
  static async executeQuery(query, bindParams = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    if (result.rows) {
      result.rows = toSnakeCaseDeep(result.rows);
    }
    return result;
  }

  /**
   * @param {{ search?: string }} [filters]
   * @returns {Promise<Array<{ currency_code: string|null, currency_name: string|null, decimal_places: number|null }>>}
   */
  static async findAll(filters = {}) {
    const { sql, binds } = buildCurrenciesListQuery(filters);
    const result = await this.executeQuery(sql, binds);
    return mapCurrencyRows(result.rows);
  }

  /**
   * Exact match on CURRENCY_CODE (bind variable only).
   * @param {string} currencyCode
   * @returns {Promise<{ currency_code: string|null, currency_name: string|null, decimal_places: number|null }|null>}
   */
  static async findByCode(currencyCode) {
    if (currencyCode == null || String(currencyCode).trim() === '') {
      return null;
    }
    const { sql, binds } = buildCurrencyByCodeQuery(currencyCode);
    const result = await this.executeQuery(sql, binds);
    const rows = mapCurrencyRows(result.rows);
    return rows[0] ?? null;
  }

  /**
   * Decimal precision for monetary formatting. Returns null when unknown or NULL in DB.
   * @param {string} currencyCode
   * @returns {Promise<number|null>}
   */
  static async getDecimalPlaces(currencyCode) {
    const row = await this.findByCode(currencyCode);
    return row?.decimal_places ?? null;
  }
}

export default CurrenciesModel;
