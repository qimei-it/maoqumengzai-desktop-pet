# 白色音符漂浮试作 v1

- `mqmz-floating-music-transparent.gif`：512×512，150 帧，25fps，6 秒，无限循环，真实透明背景。GIF 的透明度为二值，以固定于符号表面的颗粒消散表现淡出。
- `mqmz-floating-music-smooth.png`：同一动画的透明 APNG，保留半透明边缘与连续淡入淡出。
- `mqmz-floating-music-dark-preview.gif`：深色底效果预览，方便查看白色符号；背景不属于透明成品。
- `mqmz-music-symbols-source.png`：内置 image_gen 生成的透明素材原图。
- `animate.mjs`：本地动画合成脚本；用 ImageMagick 解码素材和编码 GIF，用 Node.js 编排运动并编码 APNG。没有改动桌宠项目。

参考：用户提供的「截屏2026-11-10 13.48.34.png」。包含高音谱号、四分音符、八分音符、双横梁连音符。12 个错峰粒子，各自使用不同的位置、寿命、大小、偏转和横向漂移；所有位置与寿命按 6 秒周期计算，循环不清屏重启。

验证：已检查深色底合成图及循环中 6 个时间点；GIF 共 150 帧、每帧 4/100 秒，所有画帧使用背景清除 disposal，首帧含透明像素；APNG 使用完整 RGBA 帧。未进行应用内或各平台窗口验收。

## 生图提示词（内置 image_gen，transparent_background=true）

Create a clean transparent PNG sprite asset atlas for a white floating music-note particle animation. Use the attached reference only for the musical symbol shapes, not its background or layout. Four separate pure-white, solid, crisp, friendly music symbols in a precise 2 by 2 grid on a genuinely transparent canvas: TOP LEFT a treble clef; TOP RIGHT a single quarter note; BOTTOM LEFT a single eighth note with curved flag; BOTTOM RIGHT a pair of beamed sixteenth notes with TWO connecting beams. Each symbol centered in its own equal square quadrant, with generous empty transparent margins (at least 15% per cell). No touching or overlap. All four shapes have comparable visual size and a slightly bold smooth silhouette like the reference. Pure opaque white silhouettes only. No black, no gray, no shadows, no glow, no text, no staff lines, no decoration, no background, no drawn checkerboard. This is a source atlas of four standalone symbols, not an animation storyboard.
