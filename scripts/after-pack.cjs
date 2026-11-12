const { readdir, rm, unlink } = require('node:fs/promises')
const { join } = require('node:path')

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
