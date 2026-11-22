// Packages Catflix for LG webOS TVs as an .ipk (LG's `ares-package` from @webos-tools/cli).
//
//   CATFLIX_WEBOS_URL=https://your-site node scripts/webos.mjs      → release/webos/*.ipk
//
// The app opens Catflix's own site in its television layout. The site address comes from
// CATFLIX_WEBOS_URL, or PUBLIC_URL in `.env`; it is written into the package, never the repo.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const site = (process.env.CATFLIX_WEBOS_URL || process.env.PUBLIC_URL || "").replace(/\/+$/, "");
if (!/^https:\/\//.test(site)) {
  console.error("Set CATFLIX_WEBOS_URL (or PUBLIC_URL) to the site's https:// address.");
  process.exit(1);
}
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const stage = path.join(root, "release", "webos", "app");
const out = path.join(root, "release", "webos");
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const file of fs.readdirSync(path.join(root, "webos"))) {
  const from = path.join(root, "webos", file);
  const to = path.join(stage, file);
  if (file === "index.html") {
    fs.writeFileSync(to, fs.readFileSync(from, "utf8").replace("__CATFLIX_SITE__", site));
  } else if (file === "appinfo.json") {
    fs.writeFileSync(to, fs.readFileSync(from, "utf8").replace("__VERSION__", version));
  } else {
    fs.copyFileSync(from, to);
  }
}

execFileSync("ares-package", [stage, "--outdir", out, "--no-minify"], { stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
console.log(`Packaged Catflix ${version} for webOS in ${path.relative(root, out)}/`);
