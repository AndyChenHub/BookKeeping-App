import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const outDir = path.resolve("dist-electron");
fs.mkdirSync(outDir, { recursive: true });

const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron", "vite"],
  logLevel: "info",
};

await esbuild.build({
  ...sharedOptions,
  entryPoints: ["electron-main.js"],
  outfile: path.join(outDir, "main.cjs"),
});

await esbuild.build({
  ...sharedOptions,
  entryPoints: ["server.ts"],
  outfile: path.join(outDir, "server.cjs"),
});

console.log("Built dist-electron/main.cjs and dist-electron/server.cjs successfully.");
