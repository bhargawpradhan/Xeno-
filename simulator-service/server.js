const http = require("http");

const PORT = Number(process.env.PORT || 5100);

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

function callback(url, communicationId, status, payload = {}) {
  setTimeout(() => {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communicationId, status, ...payload })
    }).catch(() => {});
  }, 180 + Math.random() * 900);
}

function simulateDelivery(job) {
  const delivered = Math.random() > 0.1;
  if (!delivered) {
    callback(job.callbackUrl, job.communicationId, "failed", { reason: "provider_simulated_failure" });
    return;
  }

  callback(job.callbackUrl, job.communicationId, "delivered");
  if (Math.random() > 0.22) {
    callback(job.callbackUrl, job.communicationId, "opened");
    if (Math.random() > 0.18) callback(job.callbackUrl, job.communicationId, "read");
  }
  if (Math.random() > 0.48) callback(job.callbackUrl, job.communicationId, "clicked");
  if (Math.random() > 0.78) callback(job.callbackUrl, job.communicationId, "converted", { orderValue: Math.round(800 + Math.random() * 4200) });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, {});

  try {
    if (req.method === "POST" && req.url === "/send") {
      const job = await readJson(req);
      if (!job.communicationId || !job.callbackUrl) {
        return send(res, 400, { error: "communicationId and callbackUrl are required" });
      }
      simulateDelivery(job);
      return send(res, 202, { accepted: true, communicationId: job.communicationId });
    }

    send(res, 404, { error: "Route not found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Channel simulator running at http://localhost:${PORT}`);
});
