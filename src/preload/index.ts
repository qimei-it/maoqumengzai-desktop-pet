import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { channels } from '../shared/protocol'
import type { PrototypeApi, Result, Snapshot } from '../shared/protocol'

const api: PrototypeApi = {
  bridgeStatus: {
    sandboxed: process.sandboxed,
    contextIsolated: process.contextIsolated,
  },
  snapshot: () => ipcRenderer.invoke(channels.snapshot),
  command: (command) => ipcRenderer.invoke(channels.command, command),
  setHitMask: (mask) => ipcRenderer.invoke(channels.mask, mask),
  pointer: (phase) => ipcRenderer.invoke(channels.pointer, phase),
  selectFiles: () => ipcRenderer.invoke(channels.selectFiles),
  receiveFiles: (files) => {
    try {
      if (!Array.isArray(files) || files.length === 0 || files.length > 32)
        throw new Error()
      const paths = files.map((file) => webUtils.getPathForFile(file))
      if (paths.some((path) => !path)) throw new Error()
      return ipcRenderer.invoke(channels.receiveFiles, paths)
    } catch {
      return Promise.resolve({
        ok: false,
        error: '只接受实际拖入或选择的本地文件，每次最多 32 个。',
      } as Result<Snapshot>)
    }
  },
  startDrag: (id) => ipcRenderer.send(channels.startDrag, id),
  capturePreview: () => ipcRenderer.invoke(channels.capture),
  saveCapture: (id) => ipcRenderer.invoke(channels.saveCapture, id),
  mailSecret: (accountId) =>
    ipcRenderer.invoke(channels.mailSecret, { accountId }),
  mailChooseAttachments: () =>
    ipcRenderer.invoke(channels.mailAttachments),
  onSnapshot: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Snapshot) =>
      listener(state)
    ipcRenderer.on(channels.updated, handler)
    return () => ipcRenderer.removeListener(channels.updated, handler)
  },
  onHover: (listener) => {
    const handler = () => listener()
    ipcRenderer.on(channels.hover, handler)
    return () => ipcRenderer.removeListener(channels.hover, handler)
  },
}
contextBridge.exposeInMainWorld('mqmz', api)
