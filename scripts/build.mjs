import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(new URL("..", import.meta.url).pathname);
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await build({
  bundle: true,
  entryPoints: [resolve(root, "src/content.js")],
  format: "iife",
  outfile: resolve(dist, "src/content.js"),
  platform: "browser",
  loader: { ".woff2": "dataurl" },
});
console.log(`Built extension to ${dist}`);
