import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { toSnakeCaseDeep } from '../../shared/entDbClient.js';
import {
  buildCurrenciesListQuery,
  mapCurrencyRows
} from '../utils/currenciesQuery.js';

/**
 * Read-only model for ENT.CURRENCIES (no ENT package — shared pool SELECT).
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
   * @returns {Promise<Array<{ currency_code: string, currency_name: string }>>}
   */
  static async findAll(filters = {}) {
    const { sql, binds } = buildCurrenciesListQuery(filters);
    const result = await this.executeQuery(sql, binds);
    return mapCurrencyRows(result.rows);
  }
}

export default CurrenciesModel;
