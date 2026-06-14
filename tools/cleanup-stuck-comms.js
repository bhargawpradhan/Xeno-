/**
 * cleanup-stuck-comms.js
 * Marks all communications stuck in 'queued_retry' or hanging 'sent' state as 'failed'
 * on the remote Render database, and clears the flood of retry activity_log entries.
 */
const { Pool } = require("pg");

const REMOTE_URL = process.argv[2];
if (!REMOTE_URL) {
  console.error("Usage: node tools/cleanup-stuck-comms.js <REMOTE_DATABASE_URL>");
  process.exit(1);
}

const pool = new Pool({
  connectionString: REMOTE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("\n🧹  Xeno CRM — Cleanup Stuck Communications\n");

    // 1. Count stuck comms
    const stuck = await client.query(
      "SELECT COUNT(*) FROM communications WHERE status IN ('queued_retry', 'sent')"
    );
    console.log(`   Found ${stuck.rows[0].count} stuck communications (queued_retry / sent).`);

    // 2. Mark them as failed
    const update = await client.query(
      `UPDATE communications
       SET status = 'failed',
           events = CASE WHEN events @> '["failed"]' THEN events ELSE events || '["failed"]'::jsonb END
       WHERE status IN ('queued_retry', 'sent')`
    );
    console.log(`   ✅  Marked ${update.rowCount} communications as 'failed'.`);

    // 3. Remove the flood of retry log entries
    const del = await client.query(
      "DELETE FROM activity_log WHERE message LIKE 'Failed dispatch to%'"
    );
    console.log(`   🗑️   Removed ${del.rowCount} retry log entries.`);

    // 4. Add a summary entry
    await client.query(
      "INSERT INTO activity_log (message) VALUES ($1)",
      ["System cleanup: reset stuck retry dispatches. Simulator was unavailable."]
    );
    console.log(`   📝  Added cleanup summary to activity log.`);

    // 5. Show final counts
    const counts = await client.query(
      `SELECT status, COUNT(*) as cnt FROM communications GROUP BY status ORDER BY cnt DESC`
    );
    console.log("\n   Communication statuses after cleanup:");
    counts.rows.forEach(r => console.log(`     ${r.status}: ${r.cnt}`));

    // 6. Show remaining activity log count
    const logCount = await client.query("SELECT COUNT(*) FROM activity_log");
    console.log(`\n   Activity log entries: ${logCount.rows[0].count}`);

    console.log("\n✅  Cleanup complete.\n");
  } catch (e) {
    console.error("Cleanup failed:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
