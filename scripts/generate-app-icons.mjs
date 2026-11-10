import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const source = resolve('build/icon-source.png')
const build = resolve('build')
const resources = resolve('resources/icons')
await mkdir(build, { recursive: true })
await mkdir(resources, { recursive: true })

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
const trimmed = await sharp(source)
  .trim()
  .png()
  .toBuffer({ resolveWithObject: true })

/** Fit the visible artwork inside `inner`, then centre it on a transparent square. */
async function platformIcon(size, inner) {
  const body = await sharp(trimmed.data)
    .resize(inner, inner, { fit: 'contain', background: transparent })
    .png()
    .toBuffer({ resolveWithObject: true })
  return sharp({
    create: { width: size, height: size, channels: 4, background: transparent },
  })
    .composite([
      {
        input: body.data,
        left: Math.round((size - body.info.width) / 2),
        top: Math.round((size - body.info.height) / 2),
      },
    ])
    .png()
    .toBuffer()
}

// macOS app icon grid: 824 px body inside a 1024 px canvas.
const mac = await platformIcon(1024, 824)
await sharp(mac).toFile(join(resources, 'app-icon.png'))
// Windows taskbar: almost full canvas with a small breathing edge.
const win = await platformIcon(256, 236)
await sharp(win).toFile(join(resources, 'app-icon-win.png'))
await sharp(win).toFile(join(build, 'icon-win-256.png'))

const iconsetBase = await mkdtemp(join(tmpdir(), 'mqmz-iconset-'))
const iconset = `${iconsetBase}.iconset`
await mkdir(iconset)
try {
  const entries = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ]
  for (const [name, size] of entries) {
    await sharp(mac)
      .resize(size, size)
      .png()
      .toFile(join(iconset, name))
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'icon.icns')])
} finally {
  await rm(iconset, { recursive: true, force: true })
  await rm(iconsetBase, { recursive: true, force: true })
}

execFileSync('magick', [
  join(build, 'icon-win-256.png'),
  '-define',
  'icon:auto-resize=256,128,64,48,40,32,24,20,16',
  join(build, 'icon.ico'),
])
await unlink(join(build, 'icon-win-256.png'))
console.log('Generated build/icon.icns, build/icon.ico and runtime icon PNGs.')
