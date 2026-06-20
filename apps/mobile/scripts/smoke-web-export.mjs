import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");
const repoRoot = path.join(mobileRoot, "..", "..");
const outputDir = path.join(mobileRoot, "dist-smoke");
const expoCli = path.join(repoRoot, "node_modules", "expo", "bin", "cli");

fs.rmSync(outputDir, { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [
    expoCli,
    "export",
    "--platform",
    "web",
    "--output-dir",
    "dist-smoke",
    "--clear",
  ],
  {
    cwd: mobileRoot,
    stdio: "inherit",
    shell: false,
  },
);

if (result.status !== 0) {
  const reason = result.error ? `: ${result.error.message}` : "";
  throw new Error(`Expo web export failed with exit code ${result.status ?? "unknown"}${reason}.`);
}

const indexPath = path.join(outputDir, "index.html");
if (!fs.existsSync(indexPath)) {
  throw new Error("Expo web export did not create dist-smoke/index.html.");
}

const files = fs.readdirSync(outputDir, { recursive: true }).map(String);
const hasScriptBundle = files.some((file) => file.endsWith(".js"));
if (!hasScriptBundle) {
  throw new Error("Expo web export did not create a JavaScript bundle.");
}

console.log("Expo web smoke export looks valid.");
