const names = [
  "Aarav Mehta", "Isha Rao", "Kabir Sethi", "Meera Nair", "Riya Kapoor", "Vihaan Shah",
  "Anika Das", "Arjun Menon", "Tara Iyer", "Dev Malhotra", "Naina Batra", "Reyansh Jain",
  "Sara Khan", "Neil Fernandes", "Avni Kulkarni", "Yash Verma", "Kiara Bose", "Aditya Sen"
];
const cities = ["Mumbai", "Bengaluru", "Delhi", "Pune"];
const tagPool = ["premium", "coffee-lover", "fashion", "beauty", "inactive", "repeat", "sale-sensitive"];
const state = {
  customers: [],
  orders: 0,
  segment: [],
  metrics: { sent: 0, delivered: 0, opened: 0, read: 0, clicked: 0, converted: 0, failed: 0 },
  campaignId: 0,
  activities: [],
  apiMode: false,
  aiEnabled: false,
  pollingInterval: null,
  activeCampaignId: null
};

const API_URL = "http://localhost:5000";
const $ = (id) => document.getElementById(id);

function money(value) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function seedCustomers() {
  state.customers = Array.from({ length: 180 }, (_, index) => {
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
      city: randomFrom(cities),
      tags,
      totalSpent,
      totalOrders,
      inactiveDays,
      engagementScore: Math.max(12, Math.round(96 - inactiveDays * 0.35 + Math.random() * 18))
    };
  });
  state.orders = state.customers.reduce((sum, customer) => sum + customer.totalOrders, 0);
  $("customerCount").textContent = state.customers.length.toLocaleString("en-IN");
  $("orderCount").textContent = state.orders.toLocaleString("en-IN");
  $("conversionLift").textContent = `${Math.floor(12 + Math.random() * 18)}%`;
  applySegment();
  
  if (state.apiMode) {
    // Sync seed with CRM API database
    fetch(`${API_URL}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customers: state.customers })
    }).then(() => {
      addActivity("Imported 180 realistic shoppers & synced with CRM backend database.");
    }).catch(e => {
      console.error("Failed to sync seed data with backend:", e);
      addActivity("Imported 180 realistic shoppers (local only, backend sync failed).");
    });
  } else {
    addActivity("Imported 180 realistic shoppers with purchase and engagement history.");
  }
}

async function checkBackendConnection() {
  try {
    const res = await fetch(`${API_URL}/health`);
    if (res.ok) {
      const data = await res.json();
      state.apiMode = true;
      state.aiEnabled = data.aiEnabled;
      updateStatusBadge(true, data.aiEnabled);
      await fetchCustomersFromBackend();
    } else {
      throw new Error();
    }
  } catch (e) {
    state.apiMode = false;
    state.aiEnabled = false;
    updateStatusBadge(false);
    seedCustomers();
  }
}

function updateStatusBadge(connected, aiEnabled = false) {
  const badge = $("apiStatusBadge");
  const dot = $("apiStatusDot");
  const text = $("apiStatusText");
  if (!badge) return;

  if (connected) {
    badge.style.borderColor = "var(--aqua)";
    badge.style.color = "var(--aqua)";
    badge.style.background = "linear-gradient(135deg, rgba(125, 247, 212, 0.14), rgba(94, 216, 255, 0.11))";
    dot.style.background = "var(--aqua)";
    dot.style.boxShadow = "0 0 10px var(--aqua)";
    text.textContent = aiEnabled ? "API Mode (Connected + Mistral AI)" : "API Mode (Connected)";
  } else {
    badge.style.borderColor = "var(--rose)";
    badge.style.color = "var(--rose)";
    badge.style.background = "rgba(255, 95, 143, 0.1)";
    dot.style.background = "var(--rose)";
    dot.style.boxShadow = "0 0 10px var(--rose)";
    text.textContent = "Demo Mode (Local Sim)";
  }
}

async function fetchCustomersFromBackend() {
  try {
    const res = await fetch(`${API_URL}/customers`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.customers = data.customers;
    state.orders = data.orders;
    $("customerCount").textContent = state.customers.length.toLocaleString("en-IN");
    $("orderCount").textContent = state.orders.toLocaleString("en-IN");
    $("conversionLift").textContent = "18%";
    applySegment();
    addActivity("Synced shopper records from the CRM backend database.");
  } catch (error) {
    console.error("Failed to fetch customers from backend:", error);
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ""]));
    const totalSpent = Number(row.totalspent || row.total_spent || row.spent || 0);
    const totalOrders = Number(row.totalorders || row.total_orders || row.orders || 1);
    const inactiveDays = Number(row.inactivedays || row.inactive_days || row.inactive || 0);
    const tags = (row.tags || "").split(/[|;]/).map((tag) => tag.trim()).filter(Boolean);
    return {
      id: row.id || `csv_${Date.now()}_${index}`,
      name: row.name || `Imported shopper ${index + 1}`,
      email: row.email || `imported${index + 1}@example.com`,
      phone: row.phone || `+910000${String(index).padStart(6, "0")}`,
      city: row.city || "Mumbai",
      tags,
      totalSpent,
      totalOrders,
      inactiveDays,
      engagementScore: Number(row.engagementscore || row.engagement_score || Math.max(10, 100 - inactiveDays))
    };
  });
}

function importCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const csvText = String(reader.result || "");
    const imported = parseCsv(csvText);
    if (!imported.length) {
      addActivity("CSV import failed: include a header row and at least one shopper.");
      return;
    }
    state.customers = imported;
    state.orders = imported.reduce((sum, customer) => sum + Math.max(1, Number(customer.totalOrders || 1)), 0);
    $("customerCount").textContent = state.customers.length.toLocaleString("en-IN");
    $("orderCount").textContent = state.orders.toLocaleString("en-IN");
    $("conversionLift").textContent = "18%";
    applySegment();
    generatePlan();

    if (state.apiMode) {
      fetch(`${API_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText })
      }).then(async () => {
        addActivity(`CSV import stored ${imported.length} shoppers in the CRM backend.`);
        await fetchCustomersFromBackend();
      }).catch(e => {
        console.error("Failed to ingest CSV to backend:", e);
        addActivity(`CSV import stored ${imported.length} shoppers locally (backend ingest failed).`);
      });
    } else {
      addActivity(`CSV import stored ${imported.length} shoppers and ${state.orders} orders in the CRM demo.`);
    }
  };
  reader.readAsText(file);
}

function applySegment() {
  const minSpent = Number($("spentFilter").value);
  const inactiveDays = Number($("inactiveFilter").value);
  const city = $("cityFilter").value;
  state.segment = state.customers
    .filter((customer) => customer.totalSpent >= minSpent)
    .filter((customer) => customer.inactiveDays >= inactiveDays)
    .filter((customer) => city === "Any" || customer.city === city)
    .sort((a, b) => b.totalSpent - a.totalSpent);

  $("segmentSize").textContent = state.segment.length;
  $("segmentTags").innerHTML = [
    `Spent > ${money(minSpent)}`,
    `Inactive ${inactiveDays}+ days`,
    city === "Any" ? "All cities" : city
  ].map((tag) => `<span>${tag}</span>`).join("");

  $("customerRows").innerHTML = state.segment.slice(0, 12).map((customer) => `
    <tr>
      <td>${customer.name}<br><small>${customer.tags.slice(0, 2).join(", ") || "new shopper"}</small></td>
      <td>${customer.city}</td>
      <td>${money(customer.totalSpent)}</td>
      <td>${customer.engagementScore}</td>
    </tr>
  `).join("");
}

async function generatePlan() {
  const tone = $("tone").value;
  const channel = $("channel").value;
  const intent = $("intent").value.trim();

  if (state.apiMode) {
    try {
      $("aiOutput").innerHTML = `<p style="color: var(--sky);">AI is analyzing intent and creating a segment plan...</p>`;
      const res = await fetch(`${API_URL}/segments/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: intent, tone, channel })
      });
      if (!res.ok) throw new Error("Plan generation failed");
      const data = await res.json();
      
      const rules = data.segment.rules;
      $("spentFilter").value = rules.minSpent;
      $("inactiveFilter").value = rules.inactiveDays;
      $("cityFilter").value = rules.city;
      applySegment();

      $("campaignTitle").value = data.segment.campaignTitle || "Bring shoppers back";
      $("messageBody").value = data.segment.messageDraft || "";
      $("previewChannel").textContent = data.segment.channel || channel;
      updatePreview();

      $("aiOutput").innerHTML = `
        <h3>AI plan generated</h3>
        <p><strong>Audience:</strong> ${data.audience.length} shoppers matching spend, inactivity, and city rules.</p>
        <p><strong>Channel:</strong> ${data.segment.channel} (${data.segment.reasoning})</p>
        <p><strong>Method:</strong> ${data.segment.aiGenerated ? "Mistral AI (API)" : "Rule Engine Fallback"}</p>
      `;
      addActivity(`AI segments parsed for: "${intent}". Found ${data.audience.length} shoppers.`);
    } catch (error) {
      console.error("API plan generation failed, falling back to local:", error);
      generateLocalPlan();
    }
  } else {
    generateLocalPlan();
  }
}

function generateLocalPlan() {
  const tone = $("tone").value;
  const channel = $("channel").value;
  const intent = $("intent").value.trim();
  const isPremium = /premium|spent|high/i.test(intent);
  const inactiveMatch = intent.match(/(\d+)\s*days?/i);
  const spentMatch = intent.match(/(?:Rs|INR|above|over|spending)\s*([0-9,]+)/i);

  if (inactiveMatch) $("inactiveFilter").value = inactiveMatch[1];
  if (spentMatch) $("spentFilter").value = spentMatch[1].replace(/,/g, "");
  applySegment();

  const offer = tone === "Urgent" ? "24-hour comeback reward" : tone === "Premium" ? "private loyalty preview" : "15% comeback reward";
  $("campaignTitle").value = isPremium ? "A private comeback moment for premium shoppers" : "Bring shoppers back with a timely offer";
  $("messageBody").value = `Hi {{name}}, we noticed it has been a while. Your ${offer} is ready on ${channel}. Tap back in today and rediscover your favorites.`;
  $("previewChannel").textContent = channel;
  updatePreview();

  $("aiOutput").innerHTML = `
    <h3>AI plan generated</h3>
    <p><strong>Audience:</strong> ${state.segment.length} shoppers matching spend, inactivity, and city rules.</p>
    <p><strong>Channel:</strong> ${channel} because it gives fast engagement feedback for comeback nudges.</p>
    <p><strong>Message:</strong> ${tone.toLowerCase()} tone with {{name}} personalization and a clear conversion trigger.</p>
  `;
  addActivity(`AI converted intent into a ${state.segment.length}-shopper segment and ${channel} campaign draft.`);
}

function updatePreview() {
  const customer = state.segment[0] || state.customers[0] || { name: "Riya" };
  $("messagePreview").textContent = $("messageBody").value.replaceAll("{{name}}", customer.name);
}

function resetMetrics() {
  state.metrics = { sent: 0, delivered: 0, opened: 0, read: 0, clicked: 0, converted: 0, failed: 0 };
  renderMetrics();
}

async function sendCampaign() {
  if (!state.segment.length) {
    addActivity("No shoppers matched this segment. Relax the filters and try again.");
    return;
  }

  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }

  if (state.apiMode) {
    try {
      resetMetrics();
      $("campaignStatus").textContent = "Sending";
      
      const minSpent = Number($("spentFilter").value);
      const inactiveDays = Number($("inactiveFilter").value);
      const city = $("cityFilter").value;
      const channel = $("channel").value;
      const message = $("messageBody").value;

      const res = await fetch(`${API_URL}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: { minSpent, inactiveDays, city },
          channel,
          message
        })
      });
      if (!res.ok) throw new Error("Failed to start campaign on backend");
      const data = await res.json();
      
      const campaignId = data.campaign.id;
      state.activeCampaignId = campaignId;
      $("activeCampaign").textContent = `Campaign #${campaignId.substring(5, 11)}`;
      
      addActivity(`Campaign queued on backend. Orchestrating ${data.queued} delivery jobs...`);
      
      state.pollingInterval = setInterval(() => pollCampaignProgress(campaignId), 500);
    } catch (error) {
      console.error("API campaign trigger failed, falling back to local:", error);
      sendLocalCampaign();
    }
  } else {
    sendLocalCampaign();
  }
}

async function pollCampaignProgress(campaignId) {
  try {
    const metricsRes = await fetch(`${API_URL}/campaigns/${campaignId}/metrics`);
    if (!metricsRes.ok) throw new Error();
    const metricsData = await metricsRes.json();
    state.metrics = metricsData.metrics;
    renderMetrics();

    const activityRes = await fetch(`${API_URL}/activity`);
    if (!activityRes.ok) throw new Error();
    const activityData = await activityRes.json();
    
    state.activities = activityData.activity;
    $("activityFeed").innerHTML = state.activities.map((item) => `<p>${item}</p>`).join("");

    const totalProcessed = state.metrics.delivered + state.metrics.failed;
    if (state.metrics.sent === state.segment.length && totalProcessed === state.metrics.sent) {
      $("campaignStatus").textContent = "Live";
      clearInterval(state.pollingInterval);
      state.pollingInterval = null;
    }
  } catch (error) {
    console.error("Polling error:", error);
  }
}

function sendLocalCampaign() {
  state.campaignId += 1;
  const currentId = state.campaignId;
  resetMetrics();
  $("campaignStatus").textContent = "Sending";
  $("activeCampaign").textContent = `Campaign #${currentId}`;
  addActivity(`Campaign #${currentId} queued ${state.segment.length} communications through the channel simulator.`);

  state.segment.forEach((customer, index) => {
    setTimeout(() => {
      if (currentId !== state.campaignId) return;
      recordEvent("sent", customer);
      simulateLifecycle(customer, currentId);
      if (index === state.segment.length - 1) $("campaignStatus").textContent = "Live";
    }, 80 + index * 26);
  });
}

function simulateLifecycle(customer, campaignId) {
  const delivered = Math.random() > 0.1;
  setTimeout(() => {
    if (campaignId !== state.campaignId) return;
    if (!delivered) {
      recordEvent("failed", customer);
      return;
    }
    recordEvent("delivered", customer);

    if (Math.random() > 0.24) {
      setTimeout(() => {
        if (campaignId !== state.campaignId) return;
        recordEvent("opened", customer);
        if (Math.random() > 0.18) recordEvent("read", customer);
        if (Math.random() > 0.44) {
          setTimeout(() => {
            if (campaignId !== state.campaignId) return;
            recordEvent("clicked", customer);
            if (Math.random() > 0.68) {
              setTimeout(() => recordEvent("converted", customer), 360 + Math.random() * 650);
            }
          }, 280 + Math.random() * 650);
        }
      }, 360 + Math.random() * 900);
    }
  }, 220 + Math.random() * 1050);
}

function recordEvent(type, customer) {
  state.metrics[type] += 1;
  renderMetrics();
  const labels = {
    sent: "sent to",
    delivered: "delivered for",
    opened: "opened by",
    read: "read by",
    clicked: "clicked by",
    converted: "converted order from",
    failed: "failed for"
  };
  if (["delivered", "read", "clicked", "converted", "failed"].includes(type)) {
    addActivity(`${$("previewChannel").textContent} ${labels[type]} ${customer.name}.`);
  }
}

function renderMetrics() {
  const metrics = state.metrics;
  $("sentMetric").textContent = metrics.sent;
  $("deliveredMetric").textContent = metrics.delivered;
  $("openedMetric").textContent = metrics.opened;
  $("readMetric").textContent = metrics.read;
  $("clickedMetric").textContent = metrics.clicked;
  $("convertedMetric").textContent = metrics.converted;
  const max = Math.max(metrics.sent, 1);
  const rows = [
    ["Delivered", metrics.delivered, metrics.delivered / max],
    ["Opened", metrics.opened, metrics.opened / max],
    ["Read", metrics.read, metrics.read / max],
    ["Clicked", metrics.clicked, metrics.clicked / max],
    ["Orders", metrics.converted, metrics.converted / max],
    ["Failed", metrics.failed, metrics.failed / max]
  ];
  $("bars").innerHTML = rows.map(([label, value, ratio]) => `
    <div class="bar-row">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(ratio * 100)}%"></div></div>
      <strong>${value}</strong>
    </div>
  `).join("");
  renderInsights();
}

function renderInsights() {
  const metrics = state.metrics;
  const deliveredRate = metrics.sent ? Math.round(metrics.delivered / metrics.sent * 100) : 0;
  const clickRate = metrics.delivered ? Math.round(metrics.clicked / metrics.delivered * 100) : 0;
  const readRate = metrics.delivered ? Math.round(metrics.read / metrics.delivered * 100) : 0;
  const conversionRate = metrics.clicked ? Math.round(metrics.converted / metrics.clicked * 100) : 0;
  $("insights").innerHTML = `
    <article><h3>Delivery health</h3><p>${deliveredRate}% delivery rate. Retry failed shoppers on SMS if WhatsApp delivery drops below 85%.</p></article>
    <article><h3>Creative learning</h3><p>${readRate}% read rate and ${clickRate}% click rate. Keep the comeback reward, then test premium wording for high-spend buyers.</p></article>
    <article><h3>Revenue signal</h3><p>${conversionRate}% click-to-order rate. Create a follow-up audience from openers who did not click within 24 hours.</p></article>
  `;
}

function addActivity(message) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.activities.unshift(`${time} - ${message}`);
  state.activities = state.activities.slice(0, 16);
  $("activityFeed").innerHTML = state.activities.map((item) => `<p>${item}</p>`).join("");
}

function bindTilt() {
  document.querySelectorAll(".tilt-card").forEach((card) => {
    card.addEventListener("mousemove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(1100px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(6px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(1100px) rotateY(0deg) rotateX(0deg) translateZ(0)";
    });
  });
}

function bindEvents() {
  ["spentFilter", "inactiveFilter", "cityFilter"].forEach((id) => $(id).addEventListener("input", applySegment));
  ["messageBody", "campaignTitle"].forEach((id) => $(id).addEventListener("input", updatePreview));
  $("channel").addEventListener("change", () => {
    $("previewChannel").textContent = $("channel").value;
    updatePreview();
  });
  $("generatePlan").addEventListener("click", generatePlan);
  $("launchDemo").addEventListener("click", () => {
    generatePlan().then(() => {
      sendCampaign();
      $("analytics").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  $("sendCampaign").addEventListener("click", sendCampaign);
  $("seedData").addEventListener("click", seedCustomers);
  $("uploadSample").addEventListener("click", () => $("csvInput").click());
  $("csvInput").addEventListener("change", (event) => importCsvFile(event.target.files[0]));
  document.querySelectorAll("[data-scroll]").forEach((button) => {
    button.addEventListener("click", () => $(button.dataset.scroll).scrollIntoView({ behavior: "smooth" }));
  });
}

bindEvents();
bindTilt();
checkBackendConnection();
updatePreview();
renderMetrics();
