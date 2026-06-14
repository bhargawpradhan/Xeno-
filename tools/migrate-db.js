/**
 * migrate-db.js
 * Copies all CRM data from the local PostgreSQL database to a remote Render Postgres instance.
 *
 * Usage:
 *   node tools/migrate-db.js <RENDER_DATABASE_URL>
 *
 * Or set REMOTE_DATABASE_URL as an environment variable:
 *   REMOTE_DATABASE_URL=postgres://... node tools/migrate-db.js
 *
 * The local DB is read from DATABASE_URL env var or defaults to:
 *   postgres://postgres:password@127.0.0.1:5432/xeno_crm
 */

const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

// Load .env from project root
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8")
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          const key = trimmed.substring(0, idx).trim();
          const value = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
          if (key && !process.env[key]) process.env[key] = value;
        }
      });
  }
} catch (e) { /* ignore */ }

const LOCAL_URL = process.env.DATABASE_URL || "postgres://postgres:password@127.0.0.1:5432/xeno_crm";
const REMOTE_URL = process.argv[2] || process.env.REMOTE_DATABASE_URL;

if (!REMOTE_URL) {
  console.error("❌  Error: Please provide the Render database URL.");
  console.error("   Usage: node tools/migrate-db.js <RENDER_DATABASE_URL>");
  console.error("   Or:    REMOTE_DATABASE_URL=postgres://... node tools/migrate-db.js");
  process.exit(1);
}

if (LOCAL_URL === REMOTE_URL) {
  console.error("❌  Error: LOCAL and REMOTE database URLs are the same. Aborting.");
  process.exit(1);
}

const localPool  = new Pool({ connectionString: LOCAL_URL });
const remotePool = new Pool({ connectionString: REMOTE_URL });

// Tables in dependency order (insert parents before children)
const TABLES = [
  {
    name: "customers",
    columns: ["id", "name", "email", "phone", "city", "tags",
              "total_spent", "total_orders", "inactive_days", "engagement_score"],
    conflict: "id",
    update: "name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone, city=EXCLUDED.city, tags=EXCLUDED.tags, total_spent=EXCLUDED.total_spent, total_orders=EXCLUDED.total_orders, inactive_days=EXCLUDED.inactive_days, engagement_score=EXCLUDED.engagement_score"
  },
  {
    name: "orders",
    columns: ["id", "customer_id", "total_amount", "status", "ordered_at"],
    conflict: "id",
    update: "customer_id=EXCLUDED.customer_id, total_amount=EXCLUDED.total_amount, status=EXCLUDED.status"
  },
  {
    name: "segments",
    columns: ["id", "name", "ai_generated", "rules", "campaign_title", "message_draft", "channel", "reasoning"],
    conflict: "id",
    update: "name=EXCLUDED.name, ai_generated=EXCLUDED.ai_generated, rules=EXCLUDED.rules, campaign_title=EXCLUDED.campaign_title, message_draft=EXCLUDED.message_draft, channel=EXCLUDED.channel, reasoning=EXCLUDED.reasoning"
  },
  {
    name: "campaigns",
    columns: ["id", "segment_rules", "channel", "message", "status"],
    conflict: "id",
    update: "segment_rules=EXCLUDED.segment_rules, channel=EXCLUDED.channel, message=EXCLUDED.message, status=EXCLUDED.status"
  },
  {
    name: "communications",
    columns: ["id", "campaign_id", "customer_id", "channel", "status", "events", "retry_count"],
    conflict: "id",
    update: "status=EXCLUDED.status, events=EXCLUDED.events, retry_count=EXCLUDED.retry_count"
  },
  {
    name: "activity_log",
    columns: ["id", "message"],
    conflict: "id",
    update: "message=EXCLUDED.message"
  },
  {
    name: "csv_imports",
    columns: ["id", "row_count", "imported_at", "raw_csv"],
    conflict: "id",
    update: "row_count=EXCLUDED.row_count, raw_csv=EXCLUDED.raw_csv"
  }
];

async function migrateTable(table) {
  const { rows } = await localPool.query(`SELECT ${table.columns.join(", ")} FROM ${table.name}`);
  if (!rows.length) {
    console.log(`   ⏭️   ${table.name}: empty, skipping.`);
    return 0;
  }

  const client = await remotePool.connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const values = table.columns.map((col) => row[col]);
      const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `
        INSERT INTO ${table.name} (${table.columns.join(", ")})
        VALUES (${placeholders})
        ON CONFLICT (${table.conflict}) DO UPDATE SET ${table.update}
      `;
      await client.query(sql, values);
      inserted++;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return inserted;
}

async function run() {
  console.log("\n🚀  Xeno CRM — Database Migration\n");
  console.log(`   Local:  ${LOCAL_URL.replace(/:\/\/.*@/, "://***@")}`);
  console.log(`   Remote: ${REMOTE_URL.replace(/:\/\/.*@/, "://***@")}\n`);

  // Initialize remote schema first
  try {
    const schemaPath = path.join(__dirname, "..", "backend", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    console.log("📐  Applying schema to remote database...");
    await remotePool.query(schemaSql);
    console.log("   ✅  Schema ready.\n");
  } catch (e) {
    console.error("   ❌  Schema init failed:", e.message);
    process.exit(1);
  }

  let totalRows = 0;
  for (const table of TABLES) {
    process.stdout.write(`   📋  Migrating ${table.name}...`);
    try {
      const count = await migrateTable(table);
      totalRows += count;
      console.log(` ${count} rows ✅`);
    } catch (e) {
      console.log(` ❌  ERROR: ${e.message}`);
      console.error(e);
    }
  }

  await localPool.end();
  await remotePool.end();

  console.log(`\n🎉  Migration complete. ${totalRows} total rows synced to Render Postgres.\n`);
}

run().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
