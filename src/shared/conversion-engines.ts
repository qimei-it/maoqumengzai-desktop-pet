/** Conversion engine inventory shown in Settings. */
export type BuiltinEngine = {
  id: string
  name: string
  version: string
  role: string
  formats: string
}

export type OptionalEngine = {
  id: 'ffmpeg' | 'libreoffice' | 'qpdf'
  name: string
  role: string
  description: string
  formats: string
}

export const builtinEngines: readonly BuiltinEngine[] = [
  {
    id: 'sharp',
    name: 'sharp',
    version: '0.35.5',
    role: '图片转换与压缩',
    formats: 'JPG、PNG、WebP、AVIF、TIFF、HEIC、BMP、GIF',
  },
  {
    id: 'pdf-lib',
    name: 'pdf-lib',
    version: '1.17.1',
    role: 'PDF 生成、合并与拆分',
    formats: 'PDF',
  },
  {
    id: 'pdfjs',
    name: 'PDF.js',
    version: '6.4.299',
    role: 'PDF 渲染与文字抽取',
    formats: 'PDF → PNG、JPG、TXT',
  },
  {
    id: 'chromium',
    name: 'Chromium',
    version: 'Electron 45',
    role: '文档打印为 PDF',
    formats: 'CSV、TXT、MD、HTML → PDF',
  },
  {
    id: 'easyofd',
    name: 'EasyOFD',
    version: '1.2.1',
    role: 'OFD 渲染',
    formats: 'OFD → PDF、PNG、JPG',
  },
  {
    id: '7zip',
    name: '7-Zip',
    version: '5.2.0',
    role: '7Z 打包与解压',
    formats: '7Z、ZIP、TAR、GZ',
  },
  {
    id: 'unrar',
    name: 'UnRAR',
    version: '6.1.7',
    role: 'RAR 解压',
    formats: 'RAR',
  },
  {
    id: 'fflate',
    name: 'fflate',
    version: '0.8.2',
    role: 'ZIP 打包与解压',
    formats: 'ZIP',
  },
]

export const optionalEngines: readonly OptionalEngine[] = [
  {
    id: 'ffmpeg',
    name: 'FFmpeg',
    role: '音视频转换',
    description: '转换视频与音频格式，把视频转成 GIF，或从视频中提取音轨。',
    formats: 'MP4、MOV、MKV、WebM、GIF、WebP、MP3、WAV、M4A、FLAC',
  },
  {
    id: 'libreoffice',
    name: 'LibreOffice',
    role: 'Office 转 PDF',
    description:
      '读取旧版和少见的 Office 格式，并把 Word、Excel、PowerPoint 转成 PDF。',
    formats: 'DOC、DOCX、XLS、XLSX、PPT、PPTX',
  },
  {
    id: 'qpdf',
    name: 'qpdf',
    role: 'PDF 结构与加密',
    description: '处理 PDF 结构、加密与解密。',
    formats: 'PDF',
  },
]
