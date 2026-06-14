const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
const port = Number(process.env.PORT || 3000);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(path.join(root, requested));

  if (filePath !== root && !filePath.startsWith(rootPrefix)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, body) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "text/plain" });
    res.end(body);
  });
});

server.listen(port, () => {
  console.log(`Frontend running at http://localhost:${port}`);
});
