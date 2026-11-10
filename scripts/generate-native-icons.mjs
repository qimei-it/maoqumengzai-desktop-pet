import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from '@playwright/test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { File as FileIcon } from '@lucide/vue'

const directory = resolve('resources/icons')
await mkdir(directory, { recursive: true })
await mkdir(resolve('resources/licenses'), { recursive: true })
const svg = (icon, size) =>
  renderToString(
    createSSRApp({
      render: () =>
        h(icon, { size, color: 'black', strokeWidth: 2, 'aria-hidden': true }),
    }),
  )
await writeFile(resolve(directory, 'file.svg'), await svg(FileIcon, 24))
await writeFile(
  resolve('resources/licenses/lucide-ISC.txt'),
  await readFile(resolve('node_modules/@lucide/vue/LICENSE'), 'utf8'),
)
const temporary = await mkdtemp(join(tmpdir(), 'mqmz-icon-export-'))
const entry = join(temporary, 'export.cjs')
await writeFile(
  entry,
  `const {app,BrowserWindow}=require('electron');
app.setPath('userData', ${JSON.stringify(temporary)});
app.whenReady().then(async()=>{ const w=new BrowserWindow({width:128,height:128,show:false,frame:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}); await w.loadURL('about:blank'); });`,
)
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => value !== undefined && key !== 'ELECTRON_RUN_AS_NODE',
  ),
)
const application = await electron.launch({ args: [entry], env: environment })
try {
  const page = await application.firstWindow()
  for (const [source, output, size] of [
    ['cat-face.svg', 'trayTemplate.png', 20],
    ['cat-face.svg', 'trayTemplate@2x.png', 40],
    ['file.svg', 'file-drag.png', 32],
    ['file.svg', 'file-drag@2x.png', 64],
  ]) {
    const markup = await readFile(resolve(directory, source), 'utf8')
    await page.setContent(
      `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style></head><body><img src="data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}"></body></html>`,
    )
    await page.locator('img').evaluate((image) => image.decode())
    await page
      .locator('img')
      .screenshot({
        path: resolve(directory, output),
        omitBackground: true,
        scale: 'css',
      })
    const bytes = await readFile(resolve(directory, output))
    assert.equal(bytes.readUInt32BE(16), size)
    assert.equal(bytes.readUInt32BE(20), size)
    const visible = await application.evaluate(
      ({ nativeImage }, path) =>
        nativeImage
          .createFromPath(path)
          .toBitmap()
          .some((value, index) => index % 4 === 3 && value > 0),
      resolve(directory, output),
    )
    assert(visible, `${output} unexpectedly rendered blank`)
  }
} finally {
  await application.close()
  await rm(temporary, { recursive: true, force: true })
}
console.log(
  'Generated brand tray and Lucide SVG derivatives; copied complete upstream license.',
)
