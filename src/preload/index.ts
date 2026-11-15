import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { channels } from '../shared/protocol'
import type { PrototypeApi, Result, Snapshot } from '../shared/protocol'

function localFilePaths(files: File[]): string[] {
  if (!Array.isArray(files) || files.length === 0 || files.length > 32)
    throw new Error('invalid file list')
  const paths = files.map((file) => webUtils.getPathForFile(file))
  if (paths.some((path) => !path)) throw new Error('missing local path')
  return paths
}

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
  selectEntry: () => ipcRenderer.invoke(channels.selectEntry),
  receiveFiles: (files) => {
    try {
      return ipcRenderer.invoke(channels.receiveFiles, localFilePaths(files))
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
  pickAgentAttachments: () =>
    ipcRenderer.invoke(channels.agentAttachments),
  attachAgentFiles: (files) => {
    try {
      return ipcRenderer.invoke(
        channels.agentAttachFiles,
        localFilePaths(files),
      )
    } catch {
      return Promise.resolve({
        ok: false,
        error: '只接受实际拖入的本地文件，每次最多 32 个。',
      })
    }
  },
  openAgentWithFiles: (files) => {
    try {
      return ipcRenderer.invoke(
        channels.agentOpenWithFiles,
        localFilePaths(files),
      )
    } catch {
      return Promise.resolve({
        ok: false,
        error: '只接受实际拖入的本地文件，每次最多 32 个。',
      })
    }
  },
  releaseAgentAttachment: (id) =>
    ipcRenderer.invoke(channels.agentAttachmentRemove, id),
  pruneAgentAttachments: () =>
    ipcRenderer.invoke(channels.agentAttachmentPrune),
  saveAgentOutput: (input) =>
    ipcRenderer.invoke(channels.agentSaveOutput, input),
  exportAgentAudio: (input) =>
    ipcRenderer.invoke(channels.agentExportAudio, input),
  openExternal: (url) => ipcRenderer.invoke(channels.openExternal, url),
  pickDirectory: (title?: string) =>
    ipcRenderer.invoke(channels.pickDirectory, title),
  toastFit: (width: number, height: number) =>
    ipcRenderer.send(channels.toastFit, { width, height }),
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
