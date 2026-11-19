/**
 * 原生模块的平台校验与裁剪。
 *
 * sharp / @napi-rs/canvas 的二进制按平台分别发布为 optionalDependencies，
 * 在 macOS 上安装后只会有 darwin 版本；直接打 Windows 包会得到
 * “Could not load the sharp module using the win32-x64 runtime” 的启动崩溃。
 * 这里统一给出目标平台需要的包清单，构建前后各校验一次。
 */

const { existsSync, readdirSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const canvasSuffix = {
  win32: (arch) => ({ x64: 'win32-x64-msvc', arm64: 'win32-arm64-msvc' })[arch],
  darwin: (arch) => `darwin-${arch}`,
  linux: (arch) => `linux-${arch}-gnu`,
}

function hasNativeFile(directory) {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return false
  }
  return entries.some((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return hasNativeFile(path)
    return entry.name.endsWith('.node') || entry.name.endsWith('.dylib') || entry.name.endsWith('.dll')
  })
}

function sharpSharpVersion(modulesDir) {
  try {
    const sharp = JSON.parse(readFileSync(join(modulesDir, 'sharp/package.json'), 'utf8'))
    return { version: sharp.version, optional: sharp.optionalDependencies ?? {} }
  } catch {
    return undefined
  }
}

/** 目标平台真正需要的原生包，按依赖自己的 optionalDependencies 推导。 */
function requiredPackages(modulesDir, platform, arch) {
  const sharp = sharpSharpVersion(modulesDir)
  if (!sharp) return []
  const suffix = `${platform}-${arch}`
  const required = [
    {
      name: `@img/sharp-${suffix}`,
      version: sharp.optional[`@img/sharp-${suffix}`] ?? sharp.version,
    },
  ]
  if (sharp.optional[`@img/sharp-libvips-${suffix}`]) {
    required.push({
      name: `@img/sharp-libvips-${suffix}`,
      version: sharp.optional[`@img/sharp-libvips-${suffix}`],
    })
  }
  const canvas = canvasSuffix[platform]?.(arch)
  const canvasVersion = canvasPackageVersion(modulesDir)
  if (canvas && canvasVersion) {
    required.push({
      name: `@napi-rs/canvas-${canvas}`,
      version: canvasVersion,
    })
  }
  return required
}

function canvasPackageVersion(modulesDir) {
  try {
    const canvas = JSON.parse(readFileSync(join(modulesDir, '@napi-rs/canvas/package.json'), 'utf8'))
    return canvas.optionalDependencies ? canvas.version : undefined
  } catch {
    return undefined
  }
}

/** 返回缺失或版本不符的包；空数组表示可以打包。 */
function findProblems(modulesDir, platform, arch) {
  const problems = []
  for (const item of requiredPackages(modulesDir, platform, arch)) {
    const directory = join(modulesDir, item.name)
    if (!existsSync(directory)) {
      problems.push(`${item.name} 缺失（期望 ${item.version}）`)
      continue
    }
    let installed
    try {
      installed = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version
    } catch {
      problems.push(`${item.name} 无法读取 package.json`)
      continue
    }
    if (item.version && installed !== item.version) {
      problems.push(`${item.name} 版本 ${installed}，依赖期望 ${item.version}`)
      continue
    }
    if (!hasNativeFile(directory)) problems.push(`${item.name} 不含 ${platform}-${arch} 原生二进制`)
  }
  return problems
}

/**
 * 删除与目标平台无关的原生包，避免把 macOS 的 .node / .dylib 塞进 Windows 安装包。
 * 只处理 @img/sharp* 与 @napi-rs/canvas*，其余依赖不动。
 */
function pruneForeign(modulesDir, platform, arch) {
  const removed = []
  const walk = (scoped, matches, keepSuffix) => {
    const directory = join(modulesDir, scoped)
    for (const entry of safeEntries(directory)) {
      if (!matches(entry)) continue
      if (entry.endsWith(keepSuffix)) continue
      rmSync(join(directory, entry), { recursive: true, force: true })
      removed.push(`${scoped}/${entry}`)
    }
  }
  const sharpSuffix = `-${platform}-${arch}`
  const canvasSuffixPath = canvasSuffix[platform]?.(arch) ?? `${platform}-${arch}`
  walk('@img', (entry) => entry.startsWith('sharp-'), sharpSuffix)
  walk('@napi-rs', (entry) => entry.startsWith('canvas-'), `-${canvasSuffixPath}`)
  return removed
}

function safeEntries(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

module.exports = { requiredPackages, findProblems, pruneForeign }
