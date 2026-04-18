#!/usr/bin/env node
/**
 * Render build/icon.svg to build/icon.png at 1024x1024.
 * electron-builder picks up the PNG automatically and generates
 * platform-specific formats (.icns for macOS, .ico for Windows) at
 * packaging time.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const svgPath = resolve(root, 'build', 'icon.svg')
const pngPath = resolve(root, 'build', 'icon.png')

const svg = await readFile(svgPath)
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1024 }
})
const png = resvg.render().asPng()
await writeFile(pngPath, png)
console.log(`icon rendered: ${pngPath} (${png.length} bytes)`)
