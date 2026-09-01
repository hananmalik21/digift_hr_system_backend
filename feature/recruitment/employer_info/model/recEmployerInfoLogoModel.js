/**
 * Logo BLOB reads from REC.EMPLOYER_INFO (not the view).
 */

import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '@digifyhr/common';
import { TABLE } from '../utils/recEmployerInfoConstants.js';
import { MESSAGES, compactEmployerInfoGuid, withConnection } from '../utils/recEmployerInfoDb.js';

/**
 * @param {string} employerInfoGuidHex — validated 32-char hex
 * @returns {Promise<{ logo: Buffer, logo_file_name: string, logo_mime_type: string }|null>}
 */
export async function getEmployerInfoLogoByGuid(employerInfoGuidHex) {
  const hex = compactEmployerInfoGuid(employerInfoGuidHex);

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        `SELECT LOGO, LOGO_FILE_NAME, LOGO_MIME_TYPE
         FROM ${TABLE}
         WHERE EMPLOYER_INFO_GUID = :guid
         FETCH FIRST 1 ROWS ONLY`,
        {
          guid: {
            val: hexToRawBuffer(hex),
            dir: oracledb.BIND_IN,
            type: oracledb.BUFFER,
            maxSize: 16
          }
        },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchInfo: { LOGO: { type: oracledb.BUFFER } }
        }
      );

      const row = result.rows?.[0];
      if (!row) return null;

      const logo = row.LOGO ?? row.logo;
      if (logo == null) return null;

      return {
        logo: Buffer.isBuffer(logo) ? logo : Buffer.from(logo),
        logo_file_name:
          String(row.LOGO_FILE_NAME ?? row.logo_file_name ?? 'logo').trim() || 'logo',
        logo_mime_type:
          String(row.LOGO_MIME_TYPE ?? row.logo_mime_type ?? 'application/octet-stream').trim() ||
          'application/octet-stream'
      };
    });
  } catch (err) {
    throw new DatabaseError(MESSAGES.LOGO_FETCH_FAIL, err, MESSAGES.LOGO_FETCH_FAIL);
  }
}
