/**
 * 检查 node_modules 是否含有目标平台的原生二进制。
 *
 *   node scripts/check-native-binaries.cjs
 *   node scripts/check-native-binaries.cjs --platform win32 --arch x64
 *
 * 打包前跑一次，可以避免在 macOS 上打出缺少 win32 sharp 的安装包。
 */

const { resolve } = require('node:path')
const { findProblems, requiredPackages } = require('./native-binaries.cjs')

const args = process.argv.slice(2)
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const platform = value('platform', process.platform)
const arch = value('arch', process.arch)
const modulesDir = resolve(value('modules', 'node_modules'))

const problems = findProblems(modulesDir, platform, arch)
if (problems.length) {
  console.error(`原生模块不满足 ${platform}-${arch}：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(
    '\n在目标系统上执行打包，或在当前机器补齐缺失的原生包后重试（npm install --no-save --no-package-lock <包名>@<版本>）。',
  )
  process.exit(1)
}

const names = requiredPackages(modulesDir, platform, arch).map((item) => item.name)
console.log(`原生模块 OK：${platform}-${arch} → ${names.join(', ') || '无需原生依赖'}`)