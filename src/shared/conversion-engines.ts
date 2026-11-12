/** Conversion engine inventory shown in Settings and verified before packaging. */
export type BuiltinEngine = {
  id: string
  name: string
  version: string
  role: string
  formats: string
  license: string
  source: string
  packageName?: string
}

export type OptionalEngineId = 'ffmpeg' | 'libreoffice' | 'qpdf'

export type OptionalEngine = {
  id: OptionalEngineId
  name: string
  role: string
  description: string
  formats: string
  license: string
  source: string
  distribution: 'download' | 'local'
  platforms: readonly string[]
  /** True when the app manages installed files and can delete them. */
  managed: boolean
}

export const builtinEngines: readonly BuiltinEngine[] = [
  {
    id: 'sharp',
    name: 'sharp',
    version: '0.35.5',
    role: '图片转换与压缩',
    formats: 'JPG、PNG、WebP、AVIF、TIFF、HEIC、BMP、GIF',
    license: 'Apache-2.0；libvips LGPL-3.0',
    source: 'npm 预编译包',
    packageName: 'sharp',
  },
  {
    id: 'pdf-lib',
    name: 'pdf-lib',
    version: '1.17.1',
    role: 'PDF 生成、合并与拆分',
    formats: 'PDF',
    license: 'MIT',
    source: 'npm',
    packageName: 'pdf-lib',
  },
  {
    id: 'pdfjs',
    name: 'PDF.js',
    version: '6.4.299',
    role: 'PDF 渲染与文字抽取',
    formats: 'PDF → PNG、JPG、TXT',
    license: 'Apache-2.0',
    source: 'npm',
    packageName: 'pdfjs-dist',
  },
  {
    id: 'chromium',
    name: 'Chromium',
    version: 'Electron 45',
    role: '文档打印为 PDF',
    formats: 'CSV、TXT、MD、HTML → PDF',
    license: 'MIT（Electron）',
    source: '随应用分发',
  },
  {
    id: 'easyofd',
    name: 'EasyOFD',
    version: '1.2.1',
    role: 'OFD 渲染',
    formats: 'OFD → PDF、PNG、JPG',
    license: 'Apache-2.0',
    source: 'npm',
    packageName: 'easyofd',
  },
  {
    id: '7zip',
    name: '7-Zip',
    version: '5.2.0',
    role: '7Z 打包与解压',
    formats: '7Z、ZIP、TAR、GZ',
    license: 'LGPL-3.0；unRAR 限制',
    source: '7zip-bin',
    packageName: '7zip-bin',
  },
  {
    id: 'unrar',
    name: 'UnRAR',
    version: '6.1.7',
    role: 'RAR 解压',
    formats: 'RAR',
    license: 'UnRAR 许可',
    source: 'node-unrar-js',
    packageName: 'node-unrar-js',
  },
  {
    id: 'fflate',
    name: 'fflate',
    version: '0.8.2',
    role: 'ZIP 打包与解压',
    formats: 'ZIP',
    license: 'MIT',
    source: 'npm',
    packageName: 'fflate',
  },
]

export const optionalEngines: readonly OptionalEngine[] = [
  {
    id: 'ffmpeg',
    name: 'FFmpeg',
    role: '音视频转换',
    description: '转换视频与音频格式，把视频转成 GIF，或从视频中提取音轨。',
    formats: 'MP4、MOV、MKV、WebM、GIF、WebP、MP3、WAV、M4A、FLAC',
    license: 'GPL / nonfree 构建，安装前展示来源',
    source: 'npmmirror 镜像 · ffmpeg-static b6.1.1',
    distribution: 'download',
    platforms: ['darwin-arm64', 'darwin-x64', 'win32-x64'],
    managed: true,
  },
  {
    id: 'libreoffice',
    name: 'LibreOffice',
    role: 'Office 转 PDF',
    description:
      '读取旧版和少见的 Office 格式，并把 Word、Excel、PowerPoint 转成 PDF。',
    formats: 'DOC、DOCX、XLS、XLSX、PPT、PPTX',
    license: 'MPL-2.0',
    source: '用户本地安装',
    distribution: 'local',
    platforms: ['darwin', 'win32'],
    managed: false,
  },
  {
    id: 'qpdf',
    name: 'qpdf',
    role: 'PDF 加密与解密',
    description: '为 PDF 设置打开密码，或移除已有密码。',
    formats: 'PDF',
    license: 'Apache-2.0',
    source: '用户本地安装',
    distribution: 'local',
    platforms: ['darwin', 'win32'],
    managed: false,
  },
]

export function builtinEngine(id: string): BuiltinEngine | undefined {
  return builtinEngines.find((engine) => engine.id === id)
}
