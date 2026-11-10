/**
 * macOS shows the development bundle name in the Dock and Command+Tab, and
 * Electron.app ships with the generic "Electron" name. Patch the local dev
 * bundle once so the running app is labelled 毛趣萌仔; packaged builds use
 * electron-builder's productName instead.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') process.exit(0)

const bundle = resolve('node_modules/electron/dist/Electron.app')
const plist = resolve(bundle, 'Contents/Info.plist')
const name = '毛趣萌仔'
const info = JSON.parse(
  execFileSync('plutil', ['-convert', 'json', '-o', '-', plist], {
    encoding: 'utf8',
  }),
)
if (info.CFBundleName === name && info.CFBundleDisplayName === name)
  process.exit(0)

execFileSync('plutil', ['-replace', 'CFBundleName', '-string', name, plist])
execFileSync('plutil', [
  '-replace',
  'CFBundleDisplayName',
  '-string',
  name,
  plist,
])
execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], {
  stdio: 'ignore',
})
console.log('已把本地 Electron 开发包名称设置为毛趣萌仔；重新启动后生效。')
