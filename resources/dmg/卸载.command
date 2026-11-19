#!/bin/bash
# 毛趣萌仔卸载脚本：退出应用、移到废纸篓，并按需删除本地数据。

set -u

APP_NAME="毛趣萌仔"
BUNDLE_ID="com.mqmz.desktop"
DATA_PATH="$HOME/Library/Application Support/mqmz-desktop"
LEGACY_PATH="$HOME/Library/Application Support/毛趣萌仔"
PURGE_MARKER="$HOME/Library/Application Support/mqmz-data-purge.json"
PREFS_PATH="$HOME/Library/Preferences/$BUNDLE_ID.plist"

pause() {
  read -r -p "按回车键关闭窗口。" _
}

echo "毛趣萌仔 卸载"
echo

APP_PATH=""
for candidate in "/Applications/$APP_NAME.app" "$HOME/Applications/$APP_NAME.app"; do
  if [ -d "$candidate" ]; then
    APP_PATH="$candidate"
    break
  fi
done

if [ -z "$APP_PATH" ]; then
  echo "没有在“应用程序”中找到毛趣萌仔，可能已经删除。"
  echo "本地数据目录："
  echo "  $DATA_PATH"
  echo
  read -r -p "是否删除本地数据？[y/N] " purge
  case "$purge" in
    y|Y)
      rm -rf "$DATA_PATH" "$LEGACY_PATH" "$PURGE_MARKER" "$PREFS_PATH"
      echo "已删除本地数据。"
      ;;
    *)
      echo "已保留本地数据。"
      ;;
  esac
  pause
  exit 0
fi

echo "应用：$APP_PATH"
echo "数据：$DATA_PATH"
echo

read -r -p "卸载毛趣萌仔？[y/N] " confirm
case "$confirm" in
  y|Y) ;;
  *)
    echo "已取消。"
    pause
    exit 0
    ;;
esac

if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  echo "正在退出毛趣萌仔…"
  osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
  sleep 2
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
fi

mkdir -p "$HOME/.Trash"
TARGET="$HOME/.Trash/$APP_NAME-$(date +%Y%m%d-%H%M%S).app"
if mv "$APP_PATH" "$TARGET" 2>/dev/null; then
  echo "已移到废纸篓：$TARGET"
else
  echo "无法移到废纸篓，请手动删除：$APP_PATH"
fi

echo
read -r -p "同时删除本地数据（桌宠、会话、邮件缓存、设置与密钥）？[y/N] " purge
case "$purge" in
  y|Y)
    rm -rf "$DATA_PATH" "$LEGACY_PATH" "$PURGE_MARKER" "$PREFS_PATH"
    echo "已删除本地数据。"
    ;;
  *)
    echo "已保留本地数据。"
    ;;
esac

echo
echo "完成。"
echo "如开启过开机启动，请在“系统设置 → 通用 → 登录项”中移除毛趣萌仔。"
pause