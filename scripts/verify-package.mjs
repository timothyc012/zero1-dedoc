#!/usr/bin/env node
/**
 * Release gate for the published Zero1 Dedoc package.
 *
 * This checks the actual npm dry-run file list after build so a release cannot
 * silently omit the public API, CLI/MCP entrypoints, or required notices.
 */
import { spawnSync } from "node:child_process"

const required = new Set([
  "NOTICE",
  "THIRD_PARTY/apache-2.0.LICENSE",
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/cli.js",
  "dist/mcp.js",
])

const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
})

if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}

let pack
try {
  pack = JSON.parse(result.stdout)
} catch (error) {
  console.error("✗ npm pack --dry-run returned invalid JSON")
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const files = new Set(pack.flatMap((entry) => entry.files ?? []).map((file) => file.path))
const missing = [...required].filter((file) => !files.has(file))
const forbidden = [...files].filter((file) => /(?:^|\/)(?:\.env|node_modules|tests?|bench)\b/.test(file))

if (missing.length || forbidden.length) {
  console.error("✗ npm package release gate failed")
  for (const file of missing) console.error(`  missing: ${file}`)
  for (const file of forbidden) console.error(`  forbidden: ${file}`)
  process.exit(1)
}

console.log(`✓ npm package release gate passed (${files.size} files, public API and notices included)`)
