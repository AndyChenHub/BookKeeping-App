import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, "release");
const releaseExe = path.join(releaseDir, "BookKeeping.exe");
const rootExe = path.join(rootDir, "BookKeeping.exe");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  execSync(cmd, { stdio: "inherit", cwd: rootDir, env });
}

// 1. Clean previous release artifacts so only fresh output remains
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}

// 2. Build frontend (Vite) + bundled backend & Electron main (esbuild)
run("npm run build");

// 3. Package standalone single-file portable Windows executable
run("npx electron-builder --win portable");

if (!fs.existsSync(releaseExe)) {
  throw new Error(`Expected packaged executable was not created at ${releaseExe}`);
}

// 4. Remove intermediate unpacked/metadata files in release/ so only BookKeeping.exe remains
for (const entry of fs.readdirSync(releaseDir)) {
  if (entry.toLowerCase() !== "bookkeeping.exe") {
    fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true });
  }
}

// 5. Place a ready-to-launch copy directly in the project root as well
fs.copyFileSync(releaseExe, rootExe);

const sizeMb = (fs.statSync(rootExe).size / (1024 * 1024)).toFixed(1);
console.log(
  `\n Packaged standalone executable (${sizeMb} MB):\n  - ${rootExe}\n  - ${releaseExe}\n`
);
