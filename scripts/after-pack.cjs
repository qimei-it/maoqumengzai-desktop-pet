const { readdir, rm, unlink } = require('node:fs/promises')
const { join } = require('node:path')
const { findProblems, pruneForeign } = require('./native-binaries.cjs')

const archNames = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

async function removeSourceMaps(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await removeSourceMaps(path)
    } else if (entry.name.endsWith('.map')) {
      await unlink(path).catch(() => {})
    }
  }
}

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName
  const product = context.packager.appInfo.productFilename
  const resources =
    platform === 'darwin'
      ? join(context.appOutDir, `${product}.app`, 'Contents', 'Resources')
      : join(context.appOutDir, 'resources')
  const modules = join(resources, 'app.asar.unpacked', 'node_modules')
  const arch = archNames[context.arch] ?? process.arch

  const problems = findProblems(modules, platform, arch)
  if (problems.length) {
    throw new Error(
      `打包结果缺少 ${platform}-${arch} 原生模块：\n  ${problems.join('\n  ')}\n` +
        '这类安装包会在启动时崩溃，已终止构建。请在目标系统上打包，或先补齐对应原生包。',
    )
  }
  const pruned = pruneForeign(modules, platform, arch)
  if (pruned.length) console.log(`[after-pack] 已移除其他平台原生包：${pruned.join('、')}`)

  const sevenZip = join(modules, '7zip-bin')
  if (platform === 'darwin') {
    for (const name of ['linux', 'win'])
      await rm(join(sevenZip, name), { recursive: true, force: true })
    await rm(join(sevenZip, 'mac', 'x64'), { recursive: true, force: true })
  } else if (platform === 'win32') {
    for (const name of ['linux', 'mac'])
      await rm(join(sevenZip, name), { recursive: true, force: true })
    await rm(join(sevenZip, 'win', 'ia32'), { recursive: true, force: true })
  }

  const pdfjs = join(modules, 'pdfjs-dist')
  await removeSourceMaps(pdfjs)
  await rm(join(pdfjs, 'web'), { recursive: true, force: true })
}
