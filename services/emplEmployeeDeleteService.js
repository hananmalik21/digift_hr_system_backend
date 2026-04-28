import oracledb from 'oracledb';
import { getConnection } from '../config/db.js';

const DELETE_EMPLOYEE_SQL = `
BEGIN
  EMPL.EMPL_EMPLOYEE_DELETE_API_PKG.DELETE_EMPLOYEE(
    p_enterprise_id => :enterprise_id,
    p_employee_id   => :employee_id,
    p_actor         => :actor
  );
END;
`;

export async function deleteEmployee(connection, { enterprise_id, employee_id, actor }) {
  const ownConnection = connection == null;
  const conn = connection ?? await getConnection();
  const binds = {
    enterprise_id: { type: oracledb.NUMBER, dir: oracledb.BIND_IN, val: enterprise_id == null ? null : Number(enterprise_id) },
    employee_id: { type: oracledb.NUMBER, dir: oracledb.BIND_IN, val: employee_id == null ? null : Number(employee_id) },
    actor: { type: oracledb.STRING, dir: oracledb.BIND_IN, val: actor == null ? null : String(actor) }
  };
  try {
    await conn.execute(DELETE_EMPLOYEE_SQL, binds, { autoCommit: true });
  } finally {
    if (ownConnection) {
      try { await conn.close(); } catch (_) {}
    }
  }
}

