const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Load environment variables from .env file if it exists
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) return;
      const index = trimmedLine.indexOf("=");
      if (index !== -1) {
        const key = trimmedLine.substring(0, index).trim();
        const value = trimmedLine.substring(index + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.error("Failed to load .env file:", e);
}

const PORT = Number(process.env.PORT || 5000);
const SIMULATOR_URL = process.env.SIMULATOR_URL || (process.env.SIMULATOR_HOST ? `https://${process.env.SIMULATOR_HOST}/send` : "http://localhost:5100/send");

const dbUrl = process.env.DATABASE_URL || "postgres://postgres:password@127.0.0.1:5432/xeno_crm";
const pool = new Pool({
  connectionString: dbUrl,
  ssl: (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) ? false : { rejectUnauthorized: false }
});

// Initialize database schema
async function initDb() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
    await pool.query(schemaSql);
    console.log("Database schema initialized.");
    await seed();
  } catch (error) {
    console.error("Failed to initialize DB schema:", error);
  }
}

async function logActivity(message) {
  try {
    await pool.query("INSERT INTO activity_log (message) VALUES ($1)", [message]);
  } catch (e) {
    console.error("logActivity error:", e);
  }
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseCsvRows(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function normalizeCustomer(row, index) {
  const totalSpent = Number(row.totalSpent || row.totalspent || row.total_spent || row.spent || 0);
  const totalOrders = Number(row.totalOrders || row.totalorders || row.total_orders || row.orders || 1);
  const inactiveDays = Number(row.inactiveDays || row.inactivedays || row.inactive_days || row.inactive || 0);
  const tagsArray = Array.isArray(row.tags) ? row.tags : String(row.tags || "").split(/[|;]/).map(t => t.trim()).filter(Boolean);
  return {
    id: row.id || `imported_${Date.now()}_${index}`,
    name: row.name || `Imported shopper ${index + 1}`,
    email: row.email || `imported${index + 1}@example.com`,
    phone: row.phone || `+910000${String(index).padStart(6, "0")}`,
    city: row.city || "Mumbai",
    tags: JSON.stringify(tagsArray),
    totalSpent,
    totalOrders,
    inactiveDays,
    engagementScore: Number(row.engagementScore || row.engagementscore || row.engagement_score || Math.max(10, 100 - inactiveDays))
  };
}

async function replaceImportedData(customers, orders = [], rawCsv = "") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete in FK-safe order instead of TRUNCATE (avoids pool self-deadlock)
    await client.query("DELETE FROM communications");
    await client.query("DELETE FROM campaigns");
    await client.query("DELETE FROM segments");
    await client.query("DELETE FROM activity_log");
    await client.query("DELETE FROM orders");
    await client.query("DELETE FROM customers");

    for (const customer of customers) {
      await client.query(
        `INSERT INTO customers (id, name, email, phone, city, tags, total_spent, total_orders, inactive_days, engagement_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
           city=EXCLUDED.city, tags=EXCLUDED.tags, total_spent=EXCLUDED.total_spent,
           total_orders=EXCLUDED.total_orders, inactive_days=EXCLUDED.inactive_days,
           engagement_score=EXCLUDED.engagement_score`,
        [customer.id, customer.name, customer.email, customer.phone, customer.city,
         customer.tags, customer.totalSpent, customer.totalOrders,
         customer.inactiveDays, customer.engagementScore]
      );
    }

    if (!orders.length) {
      for (const customer of customers) {
        const numOrders = Math.max(1, Number(customer.totalOrders) || 1);
        const amountEach = Math.max(1, Math.round(Number(customer.totalSpent) / numOrders));
        for (let i = 0; i < numOrders; i++) {
          await client.query(
            `INSERT INTO orders (id, customer_id, total_amount, status) VALUES ($1, $2, $3, $4)`,
            [`order_${customer.id}_${i}`, customer.id, amountEach, "paid"]
          );
        }
      }
    } else {
      for (const order of orders) {
        await client.query(
          `INSERT INTO orders (id, customer_id, total_amount, status) VALUES ($1, $2, $3, $4)`,
          [order.id, order.customerId, order.totalAmount, order.status]
        );
      }
    }

    // Store the raw CSV import record
    if (rawCsv) {
      await client.query(
        `INSERT INTO csv_imports (row_count, raw_csv) VALUES ($1, $2)`,
        [customers.length, rawCsv.substring(0, 65535)]
      );
    }

    await client.query("COMMIT");
    await logActivity(`Imported ${customers.length} shoppers from CSV/JSON into the CRM database.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM customers');
  if (Number(rows[0].count) > 0) return; // already seeded

  const names = [
    "Aarav Mehta", "Isha Rao", "Kabir Sethi", "Meera Nair", "Riya Kapoor", "Vihaan Shah",
    "Anika Das", "Arjun Menon", "Tara Iyer", "Dev Malhotra", "Naina Batra", "Reyansh Jain",
    "Sara Khan", "Neil Fernandes", "Avni Kulkarni", "Yash Verma", "Kiara Bose", "Aditya Sen"
  ];
  const cities = ["Mumbai", "Bengaluru", "Delhi", "Pune"];
  const tagPool = ["premium", "coffee-lover", "fashion", "beauty", "inactive", "repeat", "sale-sensitive"];

  const customers = Array.from({ length: 180 }, (_, index) => {
    const totalSpent = Math.floor(900 + Math.random() * 13500);
    const totalOrders = Math.max(1, Math.floor(totalSpent / (900 + Math.random() * 1600)));
    const inactiveDays = Math.floor(Math.random() * 160);
    
    const tags = tagPool.filter(() => Math.random() > 0.62);
    if (totalSpent > 6000 && !tags.includes("premium")) tags.push("premium");
    if (inactiveDays > 45 && !tags.includes("inactive")) tags.push("inactive");

    return {
      id: `cust_${index + 1}`,
      name: names[index % names.length],
      email: `shopper${index + 1}@example.com`,
      phone: `+91 98${String(10000000 + index * 7331).slice(0, 8)}`,
      city: cities[index % cities.length],
      tags: JSON.stringify(tags),
      totalSpent,
      totalOrders,
      inactiveDays,
      engagementScore: Math.max(12, Math.round(96 - inactiveDays * 0.35 + Math.random() * 18))
    };
  });

  await replaceImportedData(customers, []);
  await logActivity("Seeded CRM database with 180 realistic shoppers and purchase histories.");
}

async function matchSegment(rule) {
  const minSpent = Number(rule.minSpent || 0);
  const inactiveDays = Number(rule.inactiveDays || 0);
  const city = rule.city || "Any";

  let query = 'SELECT id, name, phone, city, total_spent as "totalSpent", inactive_days as "inactiveDays" FROM customers WHERE total_spent >= $1 AND inactive_days >= $2';
  let params = [minSpent, inactiveDays];

  if (city !== "Any") {
    query += ' AND city = $3';
    params.push(city);
  }

  const { rows } = await pool.query(query, params);
  return rows;
}

async function metricsFor(campaignId) {
  const { rows } = await pool.query('SELECT events FROM communications WHERE campaign_id = $1', [campaignId]);
  return rows.reduce((stats, row) => {
    const events = typeof row.events === 'string' ? JSON.parse(row.events) : (row.events || []);
    stats.sent += events.includes("sent") ? 1 : 0;
    stats.delivered += events.includes("delivered") ? 1 : 0;
    stats.opened += events.includes("opened") ? 1 : 0;
    stats.read += events.includes("read") ? 1 : 0;
    stats.clicked += events.includes("clicked") ? 1 : 0;
    stats.converted += events.includes("converted") ? 1 : 0;
    stats.failed += events.includes("failed") ? 1 : 0;
    return stats;
  }, { sent: 0, delivered: 0, opened: 0, read: 0, clicked: 0, converted: 0, failed: 0 });
}

// Inline fallback simulation — mirrors simulator-service/server.js logic
async function simulateDeliveryLocally(communicationId) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const event = (evt, extraMs = 0) => delay(200 + Math.random() * 900 + extraMs).then(() =>
    pool.query(
      `UPDATE communications
         SET status = $1,
             events = CASE WHEN events @> ($2)::jsonb THEN events ELSE events || ($2)::jsonb END,
             updated_at = NOW()
       WHERE id = $3`,
      [evt, JSON.stringify([evt]), communicationId]
    ).catch(() => {})
  );

  const delivered = Math.random() > 0.1;
  if (!delivered) { await event("failed"); return; }

  await event("delivered");
  if (Math.random() > 0.22) {
    await event("opened", 300);
    if (Math.random() > 0.18) await event("read", 200);
  }
  if (Math.random() > 0.48) await event("clicked", 400);
  if (Math.random() > 0.78) await event("converted", 600);
}

async function dispatch(communicationId, customerPhone, customerName, campaignChannel, campaignMessage) {
  // Mark as sent immediately
  await pool.query(
    'UPDATE communications SET status = $1, events = events || \'["sent"]\'::jsonb WHERE id = $2',
    ['sent', communicationId]
  );

  // Try external simulator (fire-and-forget, 4s timeout)
  const callbackUrl = `${process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/webhooks/channel-events`;
  let usedExternalSim = false;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(SIMULATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        communicationId,
        recipient: customerPhone,
        channel: campaignChannel,
        message: campaignMessage.replaceAll("{{name}}", customerName),
        callbackUrl
      })
    });
    clearTimeout(tid);
    if (resp.ok) usedExternalSim = true;
  } catch (_) { /* simulator unreachable — fall through to local simulation */ }

  // Fallback: simulate delivery inline so campaigns always complete
  if (!usedExternalSim) {
    simulateDeliveryLocally(communicationId).catch(() => {});
  }
}

// Call Mistral API to parse prompt
async function callMistral(prompt, tone, channel) {
  if (!process.env.MISTRAL_API_KEY) {
    return { error: "Mistral API key is not configured." };
  }

  const promptText = `
You are an AI Campaign assistant for a D2C shopper CRM.
We have a customer database with fields:
- city: can be "Mumbai", "Bengaluru", "Delhi", "Pune".
- totalSpent: number of Rupees spent.
- inactiveDays: number of days since last purchase.

You are given a marketer's intent: "${prompt}"
Also the chosen tone: "${tone || "Friendly"}" and default channel: "${channel || "WhatsApp"}".

Analyze the intent and output a JSON object containing:
1. "rules": an object with:
   - "minSpent": number (minimum amount spent, default 0 if not specified).
   - "inactiveDays": number (minimum inactive days, default 0 if not specified).
   - "city": string (must be one of "Mumbai", "Bengaluru", "Delhi", "Pune", or "Any").
2. "campaignTitle": string (personalized campaign title/subject).
3. "messageDraft": string (message body. You MUST use "{{name}}" placeholder for personalization, e.g., "Hi {{name}}, we noticed you haven't visited us in a while...").
4. "channel": string (one of "WhatsApp", "SMS", "Email", "RCS").
5. "reasoning": string (brief explanation of why this segment and copy were chosen).

Respond ONLY with valid JSON. Do not wrap in markdown code blocks.
`;

  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [{ role: "user", content: promptText }],
        response_format: { type: "json_object" }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const resultText = data.choices[0].message.content.trim();
      let cleanText = resultText;
      if (cleanText.startsWith("\`\`\`")) {
        cleanText = cleanText.replace(/^\`\`\`(?:json)?\n?/, "").replace(/\n?\`\`\`$/, "");
      }
      return JSON.parse(cleanText.trim());
    } else {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.message || `Status ${response.status}`;
      return { error: `Mistral API returned status ${response.status}: ${msg}` };
    }
  } catch (error) {
    return { error: `Mistral API error: ${error.message}` };
  }
}

initDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 200, {});

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, service: "crm-api", aiEnabled: !!process.env.MISTRAL_API_KEY });
    }

    if (req.method === "GET" && url.pathname === "/config") {
      return send(res, 200, { aiEnabled: !!process.env.MISTRAL_API_KEY });
    }

    if (req.method === "GET" && url.pathname === "/activity") {
      const { rows } = await pool.query("SELECT message, to_char(created_at, 'HH24:MI:SS') as time FROM activity_log ORDER BY id DESC LIMIT 50");
      return send(res, 200, { activity: rows.map(r => `${r.time} - ${r.message}`) });
    }

    if (req.method === "GET" && url.pathname === "/customers") {
      const { rows: customers } = await pool.query('SELECT id, name, email, phone, city, tags, total_spent as "totalSpent", total_orders as "totalOrders", inactive_days as "inactiveDays", engagement_score as "engagementScore" FROM customers');
      const { rows: orderCount } = await pool.query('SELECT COUNT(*) as count FROM orders');
      // Format tags correctly
      const formattedCustomers = customers.map(c => {
         return {
           ...c,
           tags: typeof c.tags === 'string' ? JSON.parse(c.tags) : (c.tags || [])
         };
      });
      return send(res, 200, { customers: formattedCustomers, orders: Number(orderCount[0].count) });
    }

    if (req.method === "POST" && url.pathname === "/ingest") {
      const body = await readJson(req);
      const rawCsv = typeof body.csv === "string" ? body.csv : "";
      const rawCustomers = rawCsv ? parseCsvRows(rawCsv) : (body.customers || []);
      if (!Array.isArray(rawCustomers) || !rawCustomers.length) {
        return send(res, 400, { error: "Provide customers[] or csv text with a header row." });
      }
      const customers = rawCustomers.map(normalizeCustomer);
      await replaceImportedData(customers, body.orders || [], rawCsv);

      const { rows: custCount } = await pool.query("SELECT COUNT(*) as count FROM customers");
      const { rows: ordCount } = await pool.query("SELECT COUNT(*) as count FROM orders");

      return send(res, 201, {
        imported: {
          customers: Number(custCount[0].count),
          orders: Number(ordCount[0].count)
        }
      });
    }

    if (req.method === "GET" && url.pathname === "/imports") {
      const { rows } = await pool.query(
        "SELECT id, row_count, to_char(imported_at, 'YYYY-MM-DD HH24:MI:SS') as imported_at FROM csv_imports ORDER BY id DESC LIMIT 20"
      );
      return send(res, 200, { imports: rows });
    }

    if (req.method === "POST" && url.pathname === "/segments/ai") {
      const body = await readJson(req);
      const prompt = body.prompt || "";
      const tone = body.tone || "Friendly";
      const channel = body.channel || "WhatsApp";

      let aiResult = await callMistral(prompt, tone, channel);

      // Strict API requirement: Do not fallback to local rule-based parsing
      if (!aiResult || aiResult.error) {
        return send(res, 400, { error: "AI Plan generation failed: " + (aiResult ? aiResult.error : "Unknown error") });
      }

      const segmentId = `seg_${Date.now()}`;
      const segment = {
        id: segmentId,
        name: body.name || "AI segment",
        aiGenerated: true,
        rules: aiResult.rules,
        campaignTitle: aiResult.campaignTitle,
        messageDraft: aiResult.messageDraft,
        channel: aiResult.channel,
        reasoning: aiResult.reasoning
      };
      
      await pool.query(`
        INSERT INTO segments (id, name, ai_generated, rules, campaign_title, message_draft, channel, reasoning)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [segment.id, segment.name, segment.aiGenerated, JSON.stringify(segment.rules), segment.campaignTitle, segment.messageDraft, segment.channel, segment.reasoning]);

      const audience = await matchSegment(segment.rules);
      return send(res, 201, { segment, audience });
    }

    if (req.method === "POST" && url.pathname === "/campaigns") {
      const body = await readJson(req);
      const audience = await matchSegment(body.rules || {});
      const campaignId = `camp_${Date.now()}`;
      
      const campaign = {
        id: campaignId,
        segmentRules: body.rules,
        channel: body.channel || "WhatsApp",
        message: body.message || "Hi {{name}}, we miss you.",
        status: "sending"
      };
      
      await pool.query(`
        INSERT INTO campaigns (id, segment_rules, channel, message, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [campaign.id, JSON.stringify(campaign.segmentRules), campaign.channel, campaign.message, campaign.status]);

      await logActivity(`Campaign #${campaign.id} queued ${audience.length} communications through the channel simulator.`);

      audience.forEach(async (customer, index) => {
        const communicationId = `comm_${campaign.id}_${customer.id}`;
        await pool.query(`
          INSERT INTO communications (id, campaign_id, customer_id, channel, status, events)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [communicationId, campaign.id, customer.id, campaign.channel, 'queued', '[]']);
        
        setTimeout(() => dispatch(communicationId, customer.phone, customer.name, campaign.channel, campaign.message), index * 20);
      });

      return send(res, 201, { campaign, queued: audience.length });
    }

    if (req.method === "POST" && url.pathname === "/webhooks/channel-events") {
      const body = await readJson(req);
      const { rows } = await pool.query('SELECT * FROM communications WHERE id = $1', [body.communicationId]);
      if (rows.length === 0) return send(res, 404, { error: "Communication not found" });
      
      const communication = rows[0];
      const events = typeof communication.events === 'string' ? JSON.parse(communication.events) : (communication.events || []);
      
      if (!events.includes(body.status)) {
        events.push(body.status);
      }
      
      await pool.query('UPDATE communications SET status = $1, events = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [body.status, JSON.stringify(events), body.communicationId]);

      const { rows: custRows } = await pool.query('SELECT name FROM customers WHERE id = $1', [communication.customer_id]);
      const customerName = custRows.length > 0 ? custRows[0].name : "Unknown Shopper";
      
      const labels = {
        sent: "sent to",
        delivered: "delivered for",
        opened: "opened by",
        read: "read by",
        clicked: "clicked by",
        converted: "converted order from",
        failed: "failed for"
      };

      if (["delivered", "read", "clicked", "converted", "failed"].includes(body.status)) {
        await logActivity(`${communication.channel} ${labels[body.status]} ${customerName}.`);
      }

      communication.status = body.status;
      communication.events = events;
      return send(res, 200, { ok: true, communication });
    }

    if (req.method === "GET" && url.pathname.startsWith("/campaigns/") && url.pathname.endsWith("/metrics")) {
      const campaignId = url.pathname.split("/")[2];
      const metrics = await metricsFor(campaignId);
      return send(res, 200, { campaignId, metrics });
    }

    send(res, 404, { error: "Route not found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`CRM API running at http://localhost:${PORT}`);
});
