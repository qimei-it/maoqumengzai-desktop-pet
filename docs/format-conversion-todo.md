# 格式转换后续 TO-DO

状态：2026-11-13。当前首版转换矩阵已完成图片、PDF、Office、文档、音视频、OFD、ZIP/7Z/TAR/TGZ/GZ/BZ2/XZ/RAR 解压，以及 ZIP/7Z/TAR/TGZ/GZ/BZ2/XZ 打包。RAR 创建不纳入产品范围，继续支持 RAR 解压。扫描版 PDF OCR 与 PDF → 可编辑 DOCX/PPTX 移至下一版；以下方向暂缓。

## 1. 扫描版 PDF OCR

- 目标：扫描版 PDF → 可搜索 PDF / TXT。
- 前置条件：选择离线 OCR 引擎（Tesseract 或平台 OCR）、打包语言包、确认中文识别质量与许可。
- 验收：中英文扫描件、倾斜/低清晰度、多页、表格样例；失败时明确提示不是文本型 PDF。
- 当前状态：下一版实现。PDF.js 只能抽取已有文本，不能识别扫描图像。

## 2. PDF → 可编辑 DOCX / PPTX

- 目标：PDF → 可编辑 Word / PowerPoint。
- 前置条件：PDF 版面分析、表格/图片还原、OCR、字体与段落重建；需要单独选型并准备样例。
- 验收：单页/多页、图文混排、表格、中文段落；明确标注“尽力还原”，不承诺无损。
- 当前状态：下一版实现。

## 3. RAR 创建（不纳入）

- 结论：不提供 RAR 创建，避免引入 RAR 编码器授权、分发和跨平台打包成本；继续支持 RAR 解压。
- 替代：打包统一提供 ZIP、7Z、TAR、TGZ、GZ、BZ2、XZ。

## 4. Windows x64 实机验收

- 目标：在 Windows 10/11 x64 上验证全部转换方向；macOS Intel 已取消支持。
- 需要补：真实安装包、PDF 渲染原生依赖、LibreOffice、7-Zip/UnRAR、FFmpeg、HEIC/OFD 样例。
- 当前状态：macOS arm64 已完成主要样例；按用户要求暂缓 Windows x64 与 macOS 13 低版本实测，先完成 macOS 当前环境。

## 5. 其他未纳入首版的方向

以下方向明确不纳入产品范围：PDF 结构编辑与版面重排（页面重排、删除/插入/旋转/裁剪、压缩重写、修复、附件/元数据/表单等结构级操作）。

- 7Z 密码包、分卷包、RAR 密码包。
- HEIC/AVIF 输出、OCR 后的表格重建。
- WPS/ET、HWP/HWPX、CAD、三维、地理信息、字体、医疗科研和专业广播格式。
