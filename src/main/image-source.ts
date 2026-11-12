/** Decodes image inputs sharp cannot read directly (notably 24-bit BMP). */
import bmp from 'bmp-js'
import decodeHeic from 'heic-decode'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import sharp, { type Sharp } from 'sharp'

const pixelLimit = 100_000_000

function bmpToRgba(data: Buffer, width: number, height: number): Buffer {
  const rgba = Buffer.alloc(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = data[index * 4 + 3] ?? 0
    rgba[index * 4 + 1] = data[index * 4 + 2] ?? 0
    rgba[index * 4 + 2] = data[index * 4 + 1] ?? 0
    rgba[index * 4 + 3] = 255
  }
  return rgba
}

export async function imagePipeline(sourcePath: string): Promise<Sharp> {
  const extension = extname(sourcePath).toLowerCase()
  if (extension === '.bmp') {
    const decoded = bmp.decode(await readFile(sourcePath))
    return sharp(bmpToRgba(decoded.data, decoded.width, decoded.height), {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
      limitInputPixels: pixelLimit,
    })
  }
  if (extension === '.heic' || extension === '.heif') {
    const decoded = await decodeHeic({ buffer: await readFile(sourcePath) })
    return sharp(decoded.data, {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
      limitInputPixels: pixelLimit,
    })
  }
  return sharp(sourcePath, { limitInputPixels: pixelLimit })
}
