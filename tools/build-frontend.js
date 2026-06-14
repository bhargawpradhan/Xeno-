/**
 * build-frontend.js
 * Netlify build script: copies frontend files into dist/ and rewrites the API_URL.
 *
 * Usage:
 *   node tools/build-frontend.js
 *
 * Environment variables:
 *   API_URL   – The Render backend URL (e.g. https://xeno-crm-api.onrender.com)
 *               Falls back to http://localhost:5000 if not set.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const DIST = path.join(ROOT, "dist");

const API_URL = process.env.API_URL || "http://localhost:5000";

// Ensure dist directory exists
if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}

// Files to copy from frontend/
const FILES = ["index.html", "styles.css", "app.js"];

FILES.forEach((file) => {
  const src = path.join(FRONTEND, file);
  const dest = path.join(DIST, file);

  if (!fs.existsSync(src)) {
    console.warn(`⚠️  ${file} not found in frontend/, skipping.`);
    return;
  }

  let content = fs.readFileSync(src, "utf-8");

  // Replace the localhost API_URL constant with the production URL
  if (file === "app.js") {
    const before = content;
    // Match: const API_URL = "http://localhost:5000";
    content = content.replace(
      /const API_URL\s*=\s*["'][^"']*["'];/,
      `const API_URL = "${API_URL}";`
    );
    if (before === content) {
      console.warn("⚠️  Could not find API_URL constant in app.js to rewrite.");
    } else {
      console.log(`✅  Rewrote API_URL → ${API_URL} in app.js`);
    }
  }

  fs.writeFileSync(dest, content, "utf-8");
  console.log(`📋  Copied ${file} → dist/${file}`);
});

console.log("\n🎉  Frontend build complete. Deploy the dist/ folder to Netlify.\n");
