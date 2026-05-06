import oracledb from 'oracledb';
import { getFaceOracleConnection } from '../../../../config/oracleFacePool.js';
import {
  DatabaseError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../../../utils/errors/index.js';

function mapFaceDbError(error, fallbackMessage) {
  const msg = error?.message || '';
  if (error?.errorNum === 20010 || msg.includes('ORA-20010')) {
    return new NotFoundError('User or active face profile not found');
  }
  if (error?.errorNum === 20011 || msg.includes('ORA-20011')) {
    return new ForbiddenError('User account is not active');
  }
  if (error?.errorNum === 20014 || msg.includes('ORA-20014')) {
    return new ValidationError('status must be checkIn or checkOut');
  }
  if (error?.errorNum === 20015 || msg.includes('ORA-20015')) {
    return new ValidationError('Face descriptor is empty');
  }
  if (error?.errorNum === 20016 || msg.includes('ORA-20016')) {
    return new ValidationError('Face descriptor length mismatch');
  }
  if (error?.errorNum === 12899 || msg.includes('ORA-12899') || error?.errorNum === 1461 || msg.includes('ORA-01461')) {
    return new DatabaseError(
      'Image payload exceeds current DB column size. Run image column migration to CLOB for FNDSEC.FNDSEC_USER_FACE_PROFILE.PROFILE_IMAGE and CAPTURED_IMAGE.',
      error,
      'Image storage column is too small. Please apply the DB migration for CLOB image fields.'
    );
  }
  return new DatabaseError(fallbackMessage, error);
}

class FaceAttendanceRepository {
  static async registerUserFaceViaPackage({
    tenantId,
    userGuid,
    profileImageData,
    capturedImageData,
    faceArrayJson
  }) {
    const connection = await getFaceOracleConnection();
    try {
      const plsql = `
        BEGIN
          FNDSEC.FNDSEC_FACE_ATTENDANCE_PKG.REGISTER_USER_FACE(
            p_tenant_id       => :p_tenant_id,
            p_user_guid       => :p_user_guid,
            p_profile_image   => :p_profile_image,
            p_captured_image  => :p_captured_image,
            p_face_array_json => :p_face_array_json,
            o_user_id         => :o_user_id,
            o_tenant_id       => :o_tenant_id,
            o_user_guid       => :o_user_guid,
            o_email           => :o_email,
            o_username        => :o_username,
            o_timezone_code   => :o_timezone_code
          );
        END;
      `;

      const binds = {
        p_tenant_id: tenantId ?? null,
        p_user_guid: userGuid || null,
        p_profile_image: { dir: oracledb.BIND_IN, type: oracledb.CLOB, val: profileImageData || null },
        p_captured_image: { dir: oracledb.BIND_IN, type: oracledb.CLOB, val: capturedImageData || null },
        p_face_array_json: { dir: oracledb.BIND_IN, type: oracledb.CLOB, val: faceArrayJson },
        o_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        o_tenant_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        o_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 128 },
        o_email: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 320 },
        o_username: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 500 },
        o_timezone_code: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 }
      };

      const result = await connection.execute(plsql, binds, { autoCommit: true });
      const out = result?.outBinds || {};

      return {
        USER_ID: out.o_user_id,
        TENANT_ID: out.o_tenant_id,
        USER_GUID: out.o_user_guid,
        EMAIL_ADDRESS: out.o_email,
        USERNAME: out.o_username,
        TIMEZONE_CODE: out.o_timezone_code
      };
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to register user face profile via package.');
    } finally {
      await connection.close();
    }
  }

  static async markFaceAttendanceViaPackage({
    email,
    tenantId,
    userGuid,
    liveFaceArrayJson,
    threshold,
    status,
    locationLat,
    locationLng,
    geoRadius
  }) {
    const connection = await getFaceOracleConnection();
    try {
      const plsql = `
        BEGIN
          FNDSEC.FNDSEC_FACE_ATTENDANCE_PKG.MARK_FACE_ATTENDANCE(
            p_email                => :p_email,
            p_tenant_id            => :p_tenant_id,
            p_user_guid            => :p_user_guid,
            p_live_face_array_json => :p_live_face_array_json,
            p_threshold            => :p_threshold,
            p_status               => :p_status,
            p_location_lat         => :p_location_lat,
            p_location_lng         => :p_location_lng,
            p_geo_radius           => :p_geo_radius,
            o_user_id              => :o_user_id,
            o_tenant_id            => :o_tenant_id,
            o_user_guid            => :o_user_guid,
            o_email                => :o_email,
            o_username             => :o_username,
            o_timezone_code        => :o_timezone_code,
            o_matched              => :o_matched,
            o_face_distance        => :o_face_distance,
            o_attendance_id        => :o_attendance_id
          );
        END;
      `;

      const binds = {
        p_email: email,
        p_tenant_id: tenantId ?? null,
        p_user_guid: userGuid || null,
        p_live_face_array_json: { dir: oracledb.BIND_IN, type: oracledb.CLOB, val: liveFaceArrayJson },
        p_threshold: threshold,
        p_status: status,
        p_location_lat: locationLat ?? null,
        p_location_lng: locationLng ?? null,
        p_geo_radius: geoRadius ?? null,
        o_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        o_tenant_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        o_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 128 },
        o_email: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 320 },
        o_username: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 500 },
        o_timezone_code: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
        o_matched: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        o_face_distance: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        o_attendance_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      };

      const result = await connection.execute(plsql, binds, { autoCommit: true });
      const out = result?.outBinds || {};

      return {
        USER_ID: out.o_user_id,
        TENANT_ID: out.o_tenant_id,
        USER_GUID: out.o_user_guid,
        EMAIL_ADDRESS: out.o_email,
        USERNAME: out.o_username,
        TIMEZONE_CODE: out.o_timezone_code,
        MATCHED: Number(out.o_matched) === 1,
        FACE_DISTANCE: out.o_face_distance,
        ATTENDANCE_ID: out.o_attendance_id
      };
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to mark face attendance via package.');
    } finally {
      await connection.close();
    }
  }

  static async findSecUserById(userId) {
    const connection = await getFaceOracleConnection();
    try {
      const result = await connection.execute(
        `SELECT USER_ID, EMPLOYEE_ID, TENANT_ID, EMAIL_ADDRESS
           FROM FNDSEC.FNDSEC_USERS
          WHERE USER_ID = :userId
          FETCH FIRST 1 ROWS ONLY`,
        { userId: Number(userId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows?.[0] || null;
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to query FNDSEC.FNDSEC_USERS by user_id.');
    } finally {
      await connection.close();
    }
  }

  static async findSecUserByEmail(email, tenantId = null) {
    const connection = await getFaceOracleConnection();
    try {
      const sql = `
        SELECT
          TENANT_ID,
          USER_ID,
          USERNAME,
          EMAIL_ADDRESS,
          ACCOUNT_STATUS,
          TIMEZONE_CODE
        FROM FNDSEC.FNDSEC_USERS
        WHERE LOWER(EMAIL_ADDRESS) = LOWER(:email)
          AND (:tenantId IS NULL OR TENANT_ID = :tenantId)
        FETCH FIRST 1 ROWS ONLY
      `;

      const result = await connection.execute(
        sql,
        { email, tenantId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return result.rows?.[0] || null;
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to query FNDSEC.FNDSEC_USERS by email.');
    } finally {
      await connection.close();
    }
  }

  static async findActiveFaceProfileByUserId(userId) {
    const connection = await getFaceOracleConnection();
    try {
      const sql = `
        SELECT
          ID,
          USER_ID,
          USER_GUID,
          PROFILE_IMAGE,
          CAPTURED_IMAGE,
          DBMS_LOB.SUBSTR(FACE_ARRAY, 4000, 1) AS FACE_ARRAY,
          IS_ACTIVE
        FROM FNDSEC.FNDSEC_USER_FACE_PROFILE
        WHERE USER_ID = :userId
          AND IS_ACTIVE = 1
        FETCH FIRST 1 ROWS ONLY
      `;

      const result = await connection.execute(
        sql,
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return result.rows?.[0] || null;
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to query active face profile.');
    } finally {
      await connection.close();
    }
  }

  static async upsertFaceProfile({
    userId,
    userGuid,
    profileImageData,
    capturedImageData,
    faceArrayJson
  }) {
    const connection = await getFaceOracleConnection();
    try {
      const sql = `
        MERGE INTO FNDSEC.FNDSEC_USER_FACE_PROFILE tgt
        USING (
          SELECT
            :userId AS USER_ID,
            :userGuid AS USER_GUID,
            :profileImage AS PROFILE_IMAGE,
            :capturedImage AS CAPTURED_IMAGE,
            :faceArray AS FACE_ARRAY
          FROM dual
        ) src
        ON (tgt.USER_ID = src.USER_ID)
        WHEN MATCHED THEN
          UPDATE SET
            tgt.USER_GUID = src.USER_GUID,
            tgt.PROFILE_IMAGE = src.PROFILE_IMAGE,
            tgt.CAPTURED_IMAGE = src.CAPTURED_IMAGE,
            tgt.FACE_ARRAY = src.FACE_ARRAY,
            tgt.IS_ACTIVE = 1,
            tgt.UPDATED_AT = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
          INSERT (
            USER_ID,
            USER_GUID,
            PROFILE_IMAGE,
            CAPTURED_IMAGE,
            FACE_ARRAY,
            IS_ACTIVE,
            CREATED_AT,
            UPDATED_AT
          ) VALUES (
            src.USER_ID,
            src.USER_GUID,
            src.PROFILE_IMAGE,
            src.CAPTURED_IMAGE,
            src.FACE_ARRAY,
            1,
            SYSTIMESTAMP,
            SYSTIMESTAMP
          )
      `;

      await connection.execute(
        sql,
        {
          userId: { dir: oracledb.BIND_IN, val: userId, type: oracledb.NUMBER },
          userGuid: { dir: oracledb.BIND_IN, val: userGuid || null, type: oracledb.STRING },
          profileImage: { dir: oracledb.BIND_IN, val: profileImageData || null, type: oracledb.CLOB },
          capturedImage: { dir: oracledb.BIND_IN, val: capturedImageData || null, type: oracledb.CLOB },
          faceArray: { dir: oracledb.BIND_IN, val: faceArrayJson, type: oracledb.CLOB }
        },
        { autoCommit: true }
      );
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to upsert user face profile.');
    } finally {
      await connection.close();
    }
  }

  static async createFaceAttendance({
    userId,
    userGuid,
    userEmail,
    status,
    locationLat,
    locationLng,
    geoRadius,
    faceDistance,
    matched,
    attendanceAt
  }) {
    const connection = await getFaceOracleConnection();
    try {
      const sql = `
        INSERT INTO FNDSEC.FNDSEC_FACE_ATTENDANCE (
          USER_ID,
          USER_GUID,
          USER_EMAIL,
          STATUS,
          LOCATION_LAT,
          LOCATION_LNG,
          GEO_RADIUS,
          FACE_DISTANCE,
          MATCHED,
          ATTENDANCE_AT,
          CREATED_AT
        ) VALUES (
          :userId,
          :userGuid,
          :userEmail,
          :status,
          :locationLat,
          :locationLng,
          :geoRadius,
          :faceDistance,
          :matched,
          :attendanceAt,
          SYSTIMESTAMP
        )
        RETURNING ID INTO :id
      `;

      const binds = {
        userId,
        userGuid: userGuid || null,
        userEmail,
        status,
        locationLat: locationLat ?? null,
        locationLng: locationLng ?? null,
        geoRadius: geoRadius ?? null,
        faceDistance,
        matched: matched ? 1 : 0,
        attendanceAt,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      };

      await connection.execute(sql, binds, { autoCommit: true });
      return binds.id.val?.[0] ?? null;
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to insert face attendance.');
    } finally {
      await connection.close();
    }
  }

  static async fetchFaceAttendanceByDateRange(userId, startDate, endDate) {
    const connection = await getFaceOracleConnection();
    try {
      const sql = `
        SELECT
          ID,
          USER_ID,
          USER_GUID,
          USER_EMAIL,
          STATUS,
          LOCATION_LAT,
          LOCATION_LNG,
          GEO_RADIUS,
          FACE_DISTANCE,
          MATCHED,
          ATTENDANCE_AT,
          CREATED_AT
        FROM FNDSEC.FNDSEC_FACE_ATTENDANCE
        WHERE USER_ID = :userId
          AND ATTENDANCE_AT >= :startDate
          AND ATTENDANCE_AT < :endDate
        ORDER BY ATTENDANCE_AT ASC
      `;

      const result = await connection.execute(
        sql,
        {
          userId,
          startDate,
          endDate
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return result.rows || [];
    } catch (error) {
      throw mapFaceDbError(error, 'Failed to fetch face attendance by date range.');
    } finally {
      await connection.close();
    }
  }
}

export default FaceAttendanceRepository;
