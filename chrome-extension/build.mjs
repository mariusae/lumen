import * as esbuild from "esbuild"
import { copyFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

const isWatch = process.argv.includes("--watch")

const distDir = "dist"
mkdirSync(distDir, { recursive: true })

// Copy static files to dist
const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/popup.html", "popup.html"],
  ["src/popup.css", "popup.css"],
  ["src/content.css", "content.css"],
]

for (const [src, dest] of staticFiles) {
  copyFileSync(src, join(distDir, dest))
}

// Copy icons
const iconsDir = join(distDir, "icons")
mkdirSync(iconsDir, { recursive: true })
if (existsSync("icons")) {
  for (const size of ["icon16.png", "icon48.png", "icon128.png"]) {
    const srcPath = join("icons", size)
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(iconsDir, size))
    }
  }
}

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
  bundle: true,
  sourcemap: true,
  target: "chrome120",
  format: "esm",
  outdir: distDir,
}

// Background service worker
const backgroundBuild = esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/background.ts"],
  outfile: join(distDir, "background.js"),
  outdir: undefined,
})

// Content script (IIFE for content scripts - they can't be ES modules)
const contentBuild = esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/content.ts"],
  outfile: join(distDir, "content.js"),
  outdir: undefined,
  format: "iife",
})

// Popup
const popupBuild = esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/popup.ts"],
  outfile: join(distDir, "popup.js"),
  outdir: undefined,
})

await Promise.all([backgroundBuild, contentBuild, popupBuild])

console.log("Build complete!")

if (isWatch) {
  console.log("Watching for changes...")
  // For watch mode, we'd need to use esbuild's context API
  // For now, just rebuild on file changes
}
