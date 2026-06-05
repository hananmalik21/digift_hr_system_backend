/**
 * Drain a SYS_REFCURSOR OUT bind from an Oracle package call.
 * Must run while the connection that opened the cursor is still open.
 */
export async function fetchAllFromRefCursor(cursor, batchSize = 200) {
  if (!cursor) return [];
  const rows = [];
  try {
    while (true) {
      const batch = await cursor.getRows(batchSize);
      if (!batch || batch.length === 0) break;
      rows.push(...batch);
    }
    return rows;
  } finally {
    try {
      await cursor.close();
    } catch (_) {}
  }
}
