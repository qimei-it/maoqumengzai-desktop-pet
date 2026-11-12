<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  Eye,
  EyeOff,
  Infinity as InfinityIcon,
  Inbox,
  Music as MusicIcon,
  Pause,
  Play,
  Plus,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "@lucide/vue";
import type {
  CapturePreview,
  Command,
  Result,
  Snapshot,
} from "../shared/protocol";
import {
  conversionEngineForKinds,
  fileKind,
  fileKindFromMime,
  type FileKind,
} from "../shared/file-kinds";
import {
  actionAt,
  donutMetrics,
  donutWindowSize,
  hitTest,
  hoverActions,
  hoverLabels,
  petSprite,
  popOut,
  sliceActions,
  sliceLabelColumns,
  type DropAction,
  type HoverAction,
} from "../shared/donut";
import catBase from "./assets/pet/ragdoll/base.png";
import catBlink from "./assets/pet/ragdoll/blink.png";
import catLifted from "./assets/pet/ragdoll/lifted.png";
import catMusic from "./assets/pet/ragdoll/music.png";
import musicNotes from "./assets/pet/ragdoll/music-notes.png";
import catPonder from "./assets/pet/ragdoll/ponder.png";
import catFocus from "./assets/pet/ragdoll/focus.png";
import AskPanel from "./AskPanel.vue";
import BatchRenamePanel from "./BatchRenamePanel.vue";
import ConvertPanel from "./ConvertPanel.vue";
import DonutMenu from "./DonutMenu.vue";
import FilePocket from "./FilePocket.vue";
import FocusBadge from "./FocusBadge.vue";
import PomodoroPanel from "./PomodoroPanel.vue";
import WaterPanel from "./WaterPanel.vue";
import SelectField from "./SelectField.vue";
import BreakPanel from "./BreakPanel.vue";
import ProfilePanel from "./ProfilePanel.vue";
import ClipboardPanel from "./ClipboardPanel.vue";
import TodoPanel from "./TodoPanel.vue";
import SettingsPanel from "./SettingsPanel.vue";

const petView = new URLSearchParams(location.search).get("view") === "pet";
const pocketView =
  new URLSearchParams(location.search).get("view") === "pocket";
const notesView =
  new URLSearchParams(location.search).get("view") === "notes";
const pillView = new URLSearchParams(location.search).get("view") === "pill";
const volumeView =
  new URLSearchParams(location.search).get("view") === "volume";
const eyeView = new URLSearchParams(location.search).get("view") === "eye";
const lyricsView =
  new URLSearchParams(location.search).get("view") === "lyrics";
const bubbleView =
  new URLSearchParams(location.search).get("view") === "bubble";
const askView = new URLSearchParams(location.search).get("view") === "ask";
const convertView =
  new URLSearchParams(location.search).get("view") === "convert";
const toastView = new URLSearchParams(location.search).get("view") === "toast";
const renameView =
  new URLSearchParams(location.search).get("view") === "rename";
const settingsView =
  new URLSearchParams(location.search).get("view") === "settings";
const focusView =
  new URLSearchParams(location.search).get("view") === "focus";
const focusBadgeView =
  new URLSearchParams(location.search).get("view") === "focus-badge";
const waterView = new URLSearchParams(location.search).get("view") === "water";
const breakView = new URLSearchParams(location.search).get("view") === "break";
const profileView = new URLSearchParams(location.search).get("view") === "profile";
const clipboardView =
  new URLSearchParams(location.search).get("view") === "clipboard";
const todoView = new URLSearchParams(location.search).get("view") === "todo";
document.body.classList.toggle("pet-view", petView);
document.body.classList.toggle("pocket-view", pocketView);
document.body.classList.toggle("notes-view", notesView);
document.body.classList.toggle("pill-view", pillView);
document.body.classList.toggle("volume-view", volumeView);
document.body.classList.toggle("eye-view", eyeView);
document.body.classList.toggle("lyrics-view", lyricsView);
document.body.classList.toggle("bubble-view", bubbleView);
document.body.classList.toggle("ask-view", askView);
document.body.classList.toggle("convert-view", convertView);
document.body.classList.toggle("toast-view", toastView);
document.body.classList.toggle("rename-view", renameView);
document.body.classList.toggle("settings-view", settingsView);
document.body.classList.toggle("focus-view", focusView);
document.body.classList.toggle("focus-badge-view", focusBadgeView);
document.body.classList.toggle("water-view", waterView);
document.body.classList.toggle("break-view", breakView);
document.body.classList.toggle("profile-view", profileView);
document.body.classList.toggle("clipboard-view", clipboardView);
document.body.classList.toggle("todo-view", todoView);
if (petView) document.title = "毛趣萌仔 · 交互标记";
if (pocketView) document.title = "毛趣萌仔 · 文件置物架";
if (notesView) document.title = "毛趣萌仔 · 音符";
if (pillView) document.title = "毛趣萌仔 · 音乐控制";
if (volumeView) document.title = "毛趣萌仔 · 音量";
if (eyeView) document.title = "毛趣萌仔 · 音乐开关";
if (lyricsView) document.title = "毛趣萌仔 · 歌词";
if (bubbleView) document.title = "毛趣萌仔 · 气泡";
if (askView) document.title = "毛趣萌仔 · 智能问答";
if (convertView) document.title = "毛趣萌仔 · 文件转换";
if (toastView) document.title = "毛趣萌仔 · 提示";
if (renameView) document.title = "毛趣萌仔 · 批量重命名";
if (settingsView) document.title = "毛趣萌仔 · 设置";
if (focusView) document.title = "毛趣萌仔 · 番茄时钟";
if (focusBadgeView) document.title = "毛趣萌仔 · 计时环";
if (waterView) document.title = "毛趣萌仔 · 喝水提醒";
if (breakView) document.title = "毛趣萌仔 · 休息提醒";
if (profileView) document.title = "毛趣萌仔 · 宠物档案";
if (clipboardView) document.title = "毛趣萌仔 · 剪贴板";
if (todoView) document.title = "毛趣萌仔 · 待办清单";
const api = window.mqmz;
const state = ref<Snapshot>();
function applyTheme(theme: string | undefined): void {
  document.documentElement.classList.remove(
    "theme-halloween",
    "theme-christmas",
  );
  if (theme === "halloween" || theme === "christmas")
    document.documentElement.classList.add(`theme-${theme}`);
}
watch(() => state.value?.settings.theme, applyTheme, { immediate: true });
const error = ref("");
const notice = ref("");
const previews = ref<CapturePreview[]>([]);
const captureBusy = ref(false);
const dragOver = ref(false);
const marker = ref<HTMLImageElement>();
const displayId = ref<number>();
const donutOpen = ref(false);
const donutClosing = ref(false);
const donutActive = ref<string | null>(null);
const donutMode = ref<"file" | "hover">("file");
watch(
  [donutActive, () => state.value?.engines.ffmpeg.status],
  updateWheelHint,
);
const donutActions = computed(() =>
  donutMode.value === "hover" ? hoverActions : sliceActions,
);
const donutLabels = computed(() =>
  donutMode.value === "hover" ? hoverLabels : sliceLabelColumns,
);
type PetPose = "base" | "blink" | "lifted" | "music" | "ponder" | "focus";
const poseSources: Record<PetPose, string> = {
  base: catBase,
  blink: catBlink,
  lifted: catLifted,
  music: catMusic,
  ponder: catPonder,
  focus: catFocus,
};
const petName = computed(() => state.value?.settings.petName || "麻薯");
const petPose = ref<PetPose>("base");
const focusActive = computed(() => {
  const focus = state.value?.focus;
  return !!focus && focus.phase === "focus" && focus.running;
});
/** Interaction poses win over listening; the blink is only a frame of the base. */
const displayPose = computed<PetPose>(() => {
  if (petPose.value === "lifted" || petPose.value === "ponder")
    return petPose.value;
  if (focusActive.value) return "focus";
  if (state.value?.music.playing) return "music";
  return petPose.value;
});
const poseSrc = computed(() => poseSources[displayPose.value]);
const toast = ref("");
const wheelHint = ref("");
let dragFileKinds: FileKind[] = [];
const markerScale = computed(() => state.value?.scale || 1);
let unsubscribe: (() => void) | undefined;
let unsubscribeHover: (() => void) | undefined;
let observer: ResizeObserver | undefined;
let pointerId: number | undefined;
let dropModeChain: Promise<void> = Promise.resolve();
let blinkTimer: ReturnType<typeof setTimeout> | undefined;
let blinkReset: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let dragWatchdog: ReturnType<typeof setTimeout> | undefined;
let acceptSlicesAfter = 0;
let closeToken = 0;
let donutOpening = false;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverSuppressedUntil = 0;
let pokeTimer: ReturnType<typeof setTimeout> | undefined;
let pointerStart: { x: number; y: number } | undefined;
let pointerMoved = false;
const dragPoint = { x: 0, y: 0 };

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function attempt(action: () => Promise<void>): Promise<void> {
  error.value = "";
  notice.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "本地操作失败。";
  }
}
async function command(value: Command): Promise<void> {
  await attempt(async () => {
    if (api) state.value = unwrap(await api.command(value));
  });
}
async function selectFiles(): Promise<void> {
  await attempt(async () => {
    if (api) state.value = unwrap(await api.selectFiles());
  });
}
function flash(message: string): void {
  if (api) {
    void command({ type: "notify", text: message });
    return;
  }
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = "";
  }, 6000);
}
/**
 * The wheel grows around the pet, so the point where the file first enters the
 * small window is not where the user is aiming. Slices only answer once the
 * ring has opened.
 */
function slicesReady(): boolean {
  return performance.now() >= acceptSlicesAfter;
}
/** Slice under the cursor, measured from the sprite centre. */
function regionAt(clientX: number, clientY: number): DropAction | null {
  const rect = marker.value?.getBoundingClientRect();
  if (!rect || !slicesReady()) return null;
  return actionAt(
    clientX - (rect.x + rect.width / 2),
    clientY - (rect.y + rect.height / 2),
    markerScale.value,
  );
}
function armWatchdog(): void {
  if (dragWatchdog) clearTimeout(dragWatchdog);
  // A drag that leaves the window or ends on the desktop can stop sending
  // events without a dragleave; close the donut when the stream goes quiet.
  dragWatchdog = setTimeout(() => {
    dragWatchdog = undefined;
    resetDragState();
    if (donutOpen.value) void closeDonut();
  }, 1500);
}
function disarmWatchdog(): void {
  if (dragWatchdog) clearTimeout(dragWatchdog);
  dragWatchdog = undefined;
}
function syncDropMode(enabled: boolean): Promise<void> {
  dropModeChain = dropModeChain.then(() =>
    command({ type: "drop-mode", enabled }),
  );
  return dropModeChain;
}
/** Clears a file drag that ended without a drop or dragleave. */
function resetDragState(): void {
  dragOver.value = false;
  dragFileKinds = [];
  wheelHint.value = "";
  disarmWatchdog();
  void syncDropMode(false);
}
function kindsFromDrop(dataTransfer: DataTransfer | null): FileKind[] {
  if (!dataTransfer) return [];
  const kinds: FileKind[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file?.name) kinds.push(fileKind(file.name));
    else if (item.type) kinds.push(fileKindFromMime(item.type));
  }
  return kinds;
}
function updateWheelHint(): void {
  if (
    !donutOpen.value ||
    donutClosing.value ||
    donutMode.value !== "file"
  ) {
    wheelHint.value = "";
    return;
  }
  const action = donutActive.value;
  if (action !== "convert" || !dragFileKinds.length) {
    wheelHint.value = "";
    return;
  }
  const engine = conversionEngineForKinds(dragFileKinds);
  if (engine === "ffmpeg") {
    const status = state.value?.engines.ffmpeg.status;
    wheelHint.value =
      status === "installed"
        ? ""
        : status === "downloading"
          ? "FFmpeg 正在安装，请稍候"
          : status === "unsupported"
            ? "当前平台无法安装 FFmpeg"
            : "音视频转换需要先安装 FFmpeg，松开后打开设置";
    return;
  }
  if (engine === "libreoffice") {
    const status = state.value?.engines.libreoffice.status;
    wheelHint.value =
      status === "ready"
        ? ""
        : status === "error"
          ? "LibreOffice 不可用，请在设置中重新选择"
          : "Office 转 PDF 需要先选择本机 LibreOffice，松开后打开设置";
    return;
  }
  if (engine === "unsupported") {
    wheelHint.value = "这批文件暂不支持格式转换";
    return;
  }
  wheelHint.value = "";
}
function trackHover(event: DragEvent): void {
  // dragover already arrives at a human-scale rate; a direct update avoids
  // requestAnimationFrame throttling when the pet window is backgrounded.
  dragPoint.x = event.clientX;
  dragPoint.y = event.clientY;
  armWatchdog();
  if (!dragFileKinds.length) {
    const kinds = kindsFromDrop(event.dataTransfer);
    if (kinds.length) dragFileKinds = kinds;
  }
  donutActive.value = regionAt(dragPoint.x, dragPoint.y);
  updateWheelHint();
}
/** Wait until the viewport has the wheel-sized window, so the ring is never clipped. */
function viewportReady(width: number): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const check = () => {
      if (window.innerWidth >= width - 1 || performance.now() - startedAt > 160)
        resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}
async function openDonut(mode: "file" | "hover" = "file"): Promise<void> {
  // A new drag may arrive while the previous wheel is fading out.
  closeToken += 1;
  if (donutOpening) return;
  if (donutOpen.value && !donutClosing.value) return;
  donutOpening = true;
  donutMode.value = mode;
  try {
    await openDonutSurface(mode);
  } finally {
    donutOpening = false;
  }
}
async function openDonutSurface(mode: "file" | "hover"): Promise<void> {
  // The window is invisible: resize it first, then mount the ring so no slice
  // is ever drawn outside the window while it changes size.
  await command({ type: "wheel", open: true });
  await viewportReady(donutWindowSize(markerScale.value).width);
  if (mode === "file" && !dragOver.value) {
    await command({ type: "wheel", open: false });
    return;
  }
  acceptSlicesAfter = performance.now() + 260;
  donutOpen.value = true;
  donutClosing.value = false;
  donutActive.value = null;
  wheelHint.value = "";
}
async function closeDonut(send = true): Promise<void> {
  disarmWatchdog();
  clearHoverTimer();
  if (!donutOpen.value) return;
  const wasHover = donutMode.value === "hover";
  const token = ++closeToken;
  donutClosing.value = true;
  donutActive.value = null;
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (token !== closeToken) return
  donutOpen.value = false;
  donutClosing.value = false;
  petPose.value = "base";
  donutMode.value = "file";
  wheelHint.value = "";
  dragFileKinds = [];
  if (!send || !api) return;
  try {
    state.value = unwrap(await api.command({ type: "wheel", open: false }));
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "本地操作失败。";
  }
  if (wasHover) {
    hoverSuppressedUntil = Date.now() + 250;
    await command({ type: "hover-mode", active: false });
  }
}
function enter(event: DragEvent): void {
  event.preventDefault();
  clearHoverTimer();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  dragFileKinds = kindsFromDrop(event.dataTransfer);
  wheelHint.value = "";
  dragOver.value = true;
  if (!petView) return;
  petPose.value = "ponder";
  armWatchdog();
  donutActive.value = null;
  // Enabling the receive region closes the wheel window; open only after that
  // command has landed, otherwise its reply would close the fresh wheel.
  void syncDropMode(true).then(() => {
    if (dragOver.value) void openDonut();
  });
}
function over(event: DragEvent): void {
  event.preventDefault();
  if (!petView) return;
  trackHover(event);
}
function leave(event: DragEvent): void {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (
    event.clientX >= bounds.left &&
    event.clientX < bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY < bounds.bottom
  )
    return;
  resetDragState();
  if (!petView) return;
  void closeDonut();
}
async function receive(event: DragEvent): Promise<void> {
  event.preventDefault();
  const action = petView ? regionAt(event.clientX, event.clientY) : null;
  const files = [...(event.dataTransfer?.files || [])];
  if (files.length) dragFileKinds = files.map((file) => fileKind(file.name));
  resetDragState();
  if (petView) void closeDonut();
  if (!files.length) return;
  if (!petView) {
    await receiveFiles(files);
    return;
  }
  if (!action) return;
  await applyDrop(files, action);
}
async function applyDrop(files: File[], action: DropAction): Promise<void> {
  if (action === "ask") {
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      state.value = unwrap(
        await api.command({ type: "ai-open", fileIds: ids }),
      );
    });
    return;
  }
  if (action === "convert") {
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      state.value = unwrap(
        await api.command({ type: "convert-open", fileIds: ids }),
      );
    });
    return;
  }
  if (action === "archive") {
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      if (!ids.length) return;
      state.value = unwrap(
        await api.command({ type: "archive-files", fileIds: ids }),
      );
    });
    return;
  }
  if (action === "extract") {
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      if (!ids.length) return;
      state.value = unwrap(
        await api.command({ type: "extract-archives", fileIds: ids }),
      );
    });
    return;
  }
  if (action === "shrink") {
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      if (!ids.length) return;
      state.value = unwrap(
        await api.command({ type: "shrink-files", fileIds: ids }),
      );
    });
    return;
  }
  if (action === "mail") {
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      if (!ids.length) return;
      state.value = unwrap(
        await api.command({ type: "settings-section", section: "mail" }),
      );
    });
    flash("邮件发送功能尚未接入");
    return;
  }
  if (action === "rename") {
    if (files.length < 2) {
      flash("至少选择两个文件才能批量重命名");
      return;
    }
    await attempt(async () => {
      if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
      const snapshot = unwrap(await api.receiveFiles(files));
      state.value = snapshot;
      const ids = snapshot.received?.fileIds ?? [];
      state.value = unwrap(
        await api.command({ type: "rename-open", fileIds: ids }),
      );
    });
    return;
  }
  await attempt(async () => {
    if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
    const snapshot = unwrap(await api.receiveFiles(files));
    state.value = snapshot;
    const ids = snapshot.received?.fileIds ?? [];
    if (!ids.length) return;
    if (action === "stash") {
      // Files are shelved as soon as they are received, so the wheel action
      // just surfaces the pocket instead of asking for a second confirmation.
      state.value = unwrap(await api.command({ type: "show-pocket" }));
      return;
    }
    if (action === "copy") {
      for (const id of ids)
        state.value = unwrap(
          await api.command({ type: "save-copy", fileId: id }),
        );
      flash("已保存副本");
      return;
    }
    state.value = unwrap(
      await api.command({ type: "eat-files", fileIds: ids }),
    );
    flash("吃掉了；7 天内在置物架可以取回。");
  });
}
async function receiveFiles(files: File[]): Promise<void> {
  await attempt(async () => {
    if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
    state.value = unwrap(await api.receiveFiles(files));
  });
}
/**
 * The sprite has enclosed transparent areas (the pad of the paw, the gaps
 * between toes). They read as part of the pet, so they must accept the drag;
 * only the transparent area open to the window edge stays click-through.
 */
function fillEnclosed(alpha: number[], size: number): number[] {
  const outside = new Uint8Array(size * size);
  const stack: number[] = [];
  const push = (index: number) => {
    if (outside[index] || alpha[index] >= 32) return;
    outside[index] = 1;
    stack.push(index);
  };
  for (let i = 0; i < size; i += 1) {
    push(i);
    push((size - 1) * size + i);
    push(i * size);
    push(i * size + size - 1);
  }
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % size;
    const y = (index - x) / size;
    if (x > 0) push(index - 1);
    if (x < size - 1) push(index + 1);
    if (y > 0) push(index - size);
    if (y < size - 1) push(index + size);
  }
  return alpha.map((value, index) =>
    value < 32 && !outside[index] ? 255 : value,
  );
}
async function updateMask(): Promise<void> {
  if (!api || !marker.value || !marker.value.complete || state.value?.dropMode)
    return;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(marker.value, 0, 0, 96, 96);
  const rgba = context.getImageData(0, 0, 96, 96).data;
  const alpha = fillEnclosed(
    Array.from({ length: 96 * 96 }, (_, index) => rgba[index * 4 + 3]),
    96,
  );
  const rect = marker.value.getBoundingClientRect();
  await attempt(async () => {
    unwrap(
      await api.setHitMask({
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        width: 96,
        height: 96,
        alpha,
      }),
    );
  });
}
function scheduleBlink(): void {
  blinkTimer = setTimeout(() => {
    if (petPose.value === "base") {
      petPose.value = "blink";
      blinkReset = setTimeout(() => {
        if (petPose.value === "blink") petPose.value = "base";
      }, 170);
    }
    scheduleBlink();
  }, 2600 + Math.random() * 1800);
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (!donutOpen.value && !dragOver.value) return;
  event.preventDefault();
  resetDragState();
  if (donutOpen.value) void closeDonut();
}
function clearHoverTimer(): void {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = undefined;
}
function hoverRegionAt(clientX: number, clientY: number): HoverAction | null {
  const rect = marker.value?.getBoundingClientRect();
  if (!rect || !slicesReady()) return null;
  const m = donutMetrics(markerScale.value);
  const hit = hitTest(
    clientX - (rect.x + rect.width / 2),
    clientY - (rect.y + rect.height / 2),
    m.inner,
    m.outer,
    hoverActions.length,
    Math.round(popOut * markerScale.value),
  );
  return hit.kind === "segment" ? hoverActions[hit.index] : null;
}
async function openHoverDonut(): Promise<void> {
  if (
    donutOpen.value ||
    dragOver.value ||
    pointerId !== undefined ||
    Date.now() < hoverSuppressedUntil ||
    state.value?.dropMode
  )
    return;
  petPose.value = "ponder";
  await openDonut("hover");
  if (!donutOpen.value) {
    petPose.value = "base";
    return;
  }
  await command({ type: "hover-mode", active: true });
}
function petPointerMove(event: PointerEvent): void {
  if (
    !petView ||
    dragOver.value ||
    pointerId !== undefined ||
    Date.now() < hoverSuppressedUntil
  ) {
    clearHoverTimer();
    return;
  }
  const rect = marker.value?.getBoundingClientRect();
  if (!rect) return;
  if (pointerId !== undefined && pointerStart) {
    if (
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 4
    )
      pointerMoved = true;
  }
  const dx = event.clientX - (rect.x + rect.width / 2);
  const dy = event.clientY - (rect.y + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  if (donutOpen.value) {
    if (donutMode.value !== "hover") return;
    donutActive.value = hoverRegionAt(event.clientX, event.clientY);
    if (distance > donutMetrics(markerScale.value).outer + 24)
      void closeDonut();
    return;
  }
  if (distance <= 48 * markerScale.value) {
    if (!hoverTimer)
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        void openHoverDonut();
      }, 550);
  } else {
    clearHoverTimer();
  }
}
function petPointerLeave(event: PointerEvent): void {
  clearHoverTimer();
  if (!donutOpen.value || donutMode.value !== "hover") return;
  // Resizing the window to show the ring can emit a synthetic leave. Only
  // close once the pointer is actually outside the expanded window.
  const { clientX, clientY } = event;
  window.setTimeout(() => {
    if (!donutOpen.value || donutMode.value !== "hover") return;
    if (
      clientX < 0 ||
      clientY < 0 ||
      clientX >= window.innerWidth ||
      clientY >= window.innerHeight
    )
      void closeDonut();
  }, 180);
}
async function runHoverAction(action: HoverAction): Promise<void> {
  await closeDonut();
  if (action === "agent") {
    await command({ type: "ai-open", fileIds: [] });
    return;
  }
  if (action === "profile") {
    await command({ type: "settings-section", section: "profile" });
    return;
  }
  if (action === "mail") {
    await command({ type: "settings-section", section: "mail" });
    return;
  }
  if (action === "blank") return;
  if (action === "clipboard") {
    await command({ type: "clipboard-open" });
    return;
  }
  if (action === "shelf") {
    await command({ type: "show-pocket" });
    return;
  }
  if (action === "todo") {
    await command({ type: "todo-open" });
    return;
  }
  if (action === "break") {
    await command({ type: "break-open" });
    return;
  }
  if (action === "water") {
    await command({ type: "water-open" });
    return;
  }
  await command({ type: "pomodoro-open" });
}
function petSurfaceClick(event: MouseEvent): void {
  if (!donutOpen.value || donutMode.value !== "hover") return;
  // The hover window expands with a spring, so the stored hover region can be
  // stale by the time the pointer is released. Re-hit-test at click time.
  const action =
    hoverRegionAt(event.clientX, event.clientY) ??
    (donutActive.value as HoverAction | null);
  if (!action) {
    void closeDonut();
    return;
  }
  void runHoverAction(action);
}
const scrollTimers = new WeakMap<HTMLElement, number>();
function markPanelScroll(event: Event): void {
  const target = event.target;
  if (
    !(target instanceof HTMLElement) ||
    !target.classList.contains("panel-scroll")
  )
    return;
  target.classList.add("is-scrolling");
  const existing = scrollTimers.get(target);
  if (existing) window.clearTimeout(existing);
  scrollTimers.set(
    target,
    window.setTimeout(() => {
      target.classList.remove("is-scrolling");
      scrollTimers.delete(target);
    }, 900),
  );
}
function triggerPoke(): void {
  petPose.value = "ponder";
  if (pokeTimer) clearTimeout(pokeTimer);
  pokeTimer = setTimeout(() => {
    pokeTimer = undefined;
    if (petPose.value === "ponder") petPose.value = "base";
  }, 550);
}
function pointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !api || pointerId !== undefined || donutOpen.value)
    return;
  hoverSuppressedUntil = Date.now() + 600;
  clearHoverTimer();
  event.preventDefault();
  petPose.value = "lifted";
  pointerId = event.pointerId;
  pointerStart = { x: event.clientX, y: event.clientY };
  pointerMoved = false;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  void attempt(async () => {
    unwrap(await api.pointer("down"));
  });
}
function pointerUp(event: PointerEvent): void {
  if (pointerId !== event.pointerId || !api) return;
  hoverSuppressedUntil = Date.now() + 600;
  clearHoverTimer();
  pointerId = undefined;
  pointerStart = undefined;
  const poked = !pointerMoved && event.type !== "pointercancel";
  pointerMoved = false;
  petPose.value = "base";
  void attempt(async () => {
    unwrap(await api.pointer(event.type === "pointercancel" ? "cancel" : "up"));
  });
  if (poked && !donutOpen.value) triggerPoke();
}
async function capture(): Promise<void> {
  captureBusy.value = true;
  await attempt(async () => {
    if (!api) return;
    previews.value = [];
    previews.value = unwrap(await api.capturePreview());
    state.value = unwrap(await api.snapshot());
  });
  captureBusy.value = false;
}
async function saveCapture(id: string): Promise<void> {
  await attempt(async () => {
    if (api) state.value = unwrap(await api.saveCapture(id));
  });
}
async function musicControl(
  action: "previous" | "toggle" | "next" | "shuffle" | "repeat" | "mute",
): Promise<void> {
  await command({ type: "music-control", action });
}
function showVolumePopup(show: boolean): void {
  void command({ type: "volume-popup", show });
}
const volume = ref(50);
const volumeDisplay = computed(() =>
  state.value?.music.muted && !volumeDragging ? 0 : volume.value,
);
let volumeDragging: boolean = false;
watch(
  () => state.value?.music.volume,
  (value) => {
    if (!volumeDragging && typeof value === "number") volume.value = value;
  },
);
function beginVolumeDrag(): void {
  volumeDragging = true;
}
function endVolumeDrag(): void {
  volumeDragging = false;
}
function onVolumeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  volume.value = value;
  void command({ type: "volume", value });
}
const lyricNow = ref(0);
let lyricTimer: ReturnType<typeof setInterval> | undefined;
let lyricBase = 0;
let lyricBaseAt = 0;
let lyricLastPosition = 0;
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
/** Keep the interpolated clock aligned with when the player was sampled. */
function syncLyricBase(): void {
  const position = state.value?.music.position ?? 0;
  const sampledAt = state.value?.music.positionAt;
  const age =
    state.value?.music.playing && typeof sampledAt === "number"
      ? Math.max(0, (Date.now() - sampledAt) / 1000)
      : 0;
  const candidate = position + age;
  const current = lyricElapsed.value;
  const seekBack = position + 1 < lyricLastPosition;
  lyricLastPosition = position;
  // Position polling can land a few dozen milliseconds behind the
  // interpolated clock; never let that tiny correction rewind a lyric line.
  lyricBase =
    state.value?.music.playing &&
    !seekBack &&
    current !== null &&
    candidate < current &&
    current - candidate < 0.25
      ? current
      : candidate;
  lyricBaseAt = performance.now();
}
watch(() => state.value?.music.position, syncLyricBase);
const lyricLines = computed(() => {
  const synced = state.value?.lyrics?.synced;
  if (!synced) return [];
  const lines: { time: number; text: string }[] = [];
  for (const raw of synced.split("\n")) {
    const match = /^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/.exec(raw.trim());
    if (!match) continue;
    const text = match[3].trim();
    if (!text) continue;
    lines.push({
      time: Number(match[1]) * 60 + Number(match[2]),
      text,
    });
  }
  return lines;
});
const lyricElapsed = computed(() => {
  if (typeof state.value?.music.position !== "number") return null;
  return (
    lyricBase +
    (state.value?.music.playing
      ? (lyricNow.value - lyricBaseAt) / 1000
      : 0)
  );
});
const currentLyric = computed(() => {
  const lines = lyricLines.value;
  if (!lines.length) return null;
  const elapsed = lyricElapsed.value;
  if (elapsed === null) return null;
  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= elapsed) index = i;
  }
  return {
    index,
    prev: lines[index - 1]?.text ?? "",
    current: lines[index]?.text ?? "",
    next: lines[index + 1]?.text ?? "",
  };
});
const lyricRow = 24;
const lyricLead = 0.5;
const lyricFadeRange = 40;
const visualPosition = computed(() => {
  const lyric = currentLyric.value;
  const elapsed = lyricElapsed.value;
  if (!lyric || elapsed === null) return 0;
  if (reducedMotion) return lyric.index;
  const current = lyricLines.value[lyric.index];
  const next = lyricLines.value[lyric.index + 1];
  if (!current || !next) return lyric.index;
  const gap = Math.max(next.time - current.time, 0.05);
  const lead = Math.min(lyricLead, Math.max(0.12, gap * 0.5));
  const start = next.time - lead;
  if (elapsed <= start) return lyric.index;
  const progress = Math.min(Math.max((elapsed - start) / lead, 0), 1);
  return lyric.index + (1 - Math.pow(1 - progress, 3));
});
const scrollOffset = computed(() => (1 - visualPosition.value) * lyricRow);
function rowStyle(
  index: number,
  center = visualPosition.value,
): Record<string, number> {
  const distance = (index - center) * lyricRow;
  return {
    '--fade-top': Math.min(Math.max(-distance / lyricFadeRange, 0), 1),
    '--fade-bottom': Math.min(Math.max(distance / lyricFadeRange, 0), 1),
  };
}
const plainLines = computed(() =>
  (state.value?.lyrics?.plain ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);
const plainPreview = computed(() => plainLines.value.slice(0, 3));
const plainCurrent = computed(() =>
  Math.floor((plainPreview.value.length - 1) / 2),
);
const barStyle = computed(
  () => state.value?.settings.musicBarStyle ?? "double",
);
const isTwoLineBar = computed(() => barStyle.value === "double");
const hasLyrics = computed(() =>
  Boolean(
    state.value?.lyrics?.instrumental ||
      state.value?.lyrics?.synced?.trim() ||
      state.value?.lyrics?.plain?.trim(),
  ),
);
const pillLyric = computed(() => {
  if (state.value?.lyrics?.instrumental) return "纯音乐";
  if (currentLyric.value) return currentLyric.value.current;
  if (lyricLines.value.length) return lyricLines.value[0]?.text ?? "";
  if (plainLines.value.length)
    return plainLines.value[plainCurrent.value] ?? "";
  return hasLyrics.value ? "♪" : "";
});
const pillSubline = computed(() => {
  if (pillLyric.value) return pillLyric.value;
  if (hasLyrics.value) return "♪";
  // Do not flash the artist while lyrics for the current track are loading.
  if (state.value?.music.title && state.value?.lyricsAvailable === undefined)
    return "♪";
  const artist = state.value?.music.artist?.trim();
  const album = state.value?.music.album?.trim();
  if (artist && album) return `${artist} — ${album}`;
  return artist || album || "";
});
const pillLyricEl = ref<HTMLElement>();
const pillLyricScrolling = ref(false);
const pillTitleEl = ref<HTMLElement>();
const pillTitleScrolling = ref(false);
const pillTitleDuration = computed(
  () =>
    `${Math.min(16, Math.max(6, (state.value?.music.title?.length ?? 0) * 0.3))}s`,
);
const pillLyricDuration = computed(
  () => `${Math.min(18, Math.max(7, pillSubline.value.length * 0.3))}s`,
);
function measurePillLyric(): void {
  const element = pillLyricEl.value;
  if (!element) return;
  pillLyricScrolling.value = element.scrollWidth > element.clientWidth + 1;
}
function measurePillTitle(): void {
  const element = pillTitleEl.value;
  if (!element) return;
  pillTitleScrolling.value = element.scrollWidth > element.clientWidth + 1;
}
watch(pillSubline, async () => {
  pillLyricScrolling.value = false;
  await nextTick();
  measurePillLyric();
});
watch(
  () => state.value?.music.title,
  async () => {
    pillTitleScrolling.value = false;
    await nextTick();
    measurePillTitle();
  },
);
const widthLines = computed(() => {
  if (state.value?.lyrics?.instrumental) return ["纯音乐"];
  if (lyricLines.value.length) return lyricLines.value.map((line) => line.text);
  if (plainLines.value.length) return plainLines.value;
  return state.value?.lyrics?.missing ? ["暂无歌词"] : [];
});
let measureSpan: HTMLSpanElement | undefined;
let reportedWidth = 0;
function lyricWidth(lines: string[]): number {
  if (!lines.length) return 240;
  if (!measureSpan) {
    measureSpan = document.createElement("span");
    measureSpan.className = "lyrics-measure";
    document.body.append(measureSpan);
  }
  let widest = 0;
  for (const line of lines) {
    measureSpan.textContent = line;
    widest = Math.max(widest, measureSpan.getBoundingClientRect().width);
  }
  const maxWidth = Math.min(480, window.screen.availWidth - 64);
  return Math.min(Math.max(Math.ceil(widest) + 40, 200), maxWidth);
}
function reportLyricsWidth(): void {
  if (!lyricsView || !state.value?.lyrics) return;
  const width = lyricWidth(widthLines.value);
  if (Math.abs(width - reportedWidth) < 2) return;
  reportedWidth = width;
  void command({ type: "lyrics-width", width });
}
watch(
  () => [
    state.value?.lyrics?.key ?? "",
    state.value?.music.title ?? "",
    state.value?.lyrics?.instrumental ? "1" : "0",
    state.value?.lyrics?.missing ? "1" : "0",
  ].join("|"),
  () => {
    if (lyricsView) void nextTick(reportLyricsWidth);
  },
);
function startDrag(event: DragEvent, id: string): void {
  event.preventDefault();
  api?.startDrag(id);
}
function size(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
const permissionLabel = computed(
  () =>
    ({
      granted: "已授权",
      denied: "已拒绝",
      "not-determined": "尚未授权",
      restricted: "系统限制",
    })[state.value?.screenPermission || ""] ||
    state.value?.screenPermission ||
    "读取中",
);
watch([() => state.value?.scale, () => state.value?.dropMode], async () => {
  await nextTick();
  await updateMask();
});
watch(displayPose, async () => {
  await nextTick();
  await updateMask();
});
function tickLyrics(): void {
  lyricNow.value = performance.now();
}
function syncLyricTicker(): void {
  if (!lyricsView && !pillView) return;
  const run = Boolean(state.value?.music.playing);
  if (run && lyricTimer === undefined) {
    syncLyricBase();
    lyricNow.value = lyricBaseAt;
    lyricTimer = setInterval(tickLyrics, 16);
  } else if (!run && lyricTimer !== undefined) {
    clearInterval(lyricTimer);
    lyricTimer = undefined;
    lyricNow.value = performance.now();
  }
}
watch(() => state.value?.music.playing, syncLyricTicker);
onMounted(() => {
  if (!lyricsView && !pillView) return;
  lyricNow.value = performance.now();
  syncLyricTicker();
  if (lyricsView) void nextTick(reportLyricsWidth);
  if (pillView)
    void nextTick(() => {
      measurePillTitle();
      measurePillLyric();
    });
});
onUnmounted(() => {
  if (lyricTimer !== undefined) clearInterval(lyricTimer);
  clearHoverTimer();
});
watch(
  () => state.value?.wheelOpen,
  (open) => {
    // Main closes the donut on recovery or display changes.
    if (!open && donutOpen.value) {
      donutOpen.value = false;
      donutActive.value = null;
    }
  },
);
/** Mouse focus never paints the keyboard ring; keyboard focus still does. */
function markPointerInput(): void {
  document.body.dataset.input = "pointer";
}
function markKeyboardInput(): void {
  document.body.dataset.input = "keyboard";
}
onMounted(async () => {
  window.addEventListener("pointerdown", markPointerInput, true);
  window.addEventListener("keydown", markKeyboardInput);
  if (!api) {
    error.value =
      "当前页面未连接 Electron。请运行 npm run dev，窗口与文件能力不会在普通浏览器中模拟成功。";
    return;
  }
  unsubscribe = api.onSnapshot((value) => {
    state.value = value;
  });
  unsubscribeHover = api.onHover(() => {
    void openHoverDonut();
  });
  await attempt(async () => {
    state.value = unwrap(await api.snapshot());
    displayId.value = state.value.displays[0]?.id;
  });
  await nextTick();
  document.addEventListener("scroll", markPanelScroll, true);
  if (petView) {
    for (const src of [catBlink, catLifted, catPonder]) {
      const image = new Image();
      image.src = src;
    }
    scheduleBlink();
    // Native window resize can reposition the marker after Vue has resized it.
    window.addEventListener("resize", updateMask);
    window.addEventListener("keydown", onKeydown);
    observer = new ResizeObserver(() => {
      void updateMask();
    });
    if (marker.value) observer.observe(marker.value);
    await updateMask();
  }
});
onUnmounted(() => {
  window.removeEventListener("pointerdown", markPointerInput, true);
  window.removeEventListener("keydown", markKeyboardInput);
  window.removeEventListener("resize", updateMask);
  window.removeEventListener("keydown", onKeydown);
  disarmWatchdog();
  if (blinkTimer) clearTimeout(blinkTimer);
  if (blinkReset) clearTimeout(blinkReset);
  if (toastTimer) clearTimeout(toastTimer);
  unsubscribe?.();
  unsubscribeHover?.();
  document.removeEventListener("scroll", markPanelScroll, true);
  observer?.disconnect();
});
</script>

<template>
  <main
    v-if="petView"
    class="pet-surface"
    :class="{ receiving: state?.dropMode, over: dragOver }"
    @dragenter="enter"
    @dragover="over"
    @dragleave="leave"
    @drop="receive"
    @pointermove="petPointerMove"
    @pointerleave="petPointerLeave"
    @click="petSurfaceClick"
    @contextmenu.prevent
  >
    <div class="marker-content">
      <div class="marker-anchor">
        <img
          ref="marker"
          :src="poseSrc"
          class="marker"
          :class="{
            lifted: displayPose === 'lifted',
            music: displayPose === 'music',
            ponder: displayPose === 'ponder',
          }"
          :style="{
            width: `${petSprite.width * markerScale}px`,
            height: `${petSprite.height * markerScale}px`,
          }"
          alt="可拖动的布偶猫桌宠"
          draggable="false"
          @load="updateMask"
          @pointerdown="pointerDown"
          @pointerup="pointerUp"
          @pointercancel="pointerUp"
        />
        <DonutMenu
          v-if="donutOpen"
          :key="donutMode"
          :scale="markerScale"
          :active="donutActive"
          :closing="donutClosing"
          :error="error"
          :actions="donutActions"
          :labels="donutLabels"
          :label-size="11"
          :single-line="donutMode === 'hover'"
          :aria-label="donutMode === 'hover' ? '桌宠功能轮盘' : '文件操作轮盘'"
        />
        <span
          class="marker-caption"
          :class="{
            hidden:
              donutOpen ||
              displayPose === 'lifted' ||
              displayPose === 'music' ||
              (!!state?.music.title && !!state?.barVisible && !state?.dropMode) ||
              !!toast,
          }"
          :style="{ fontSize: `${10 * markerScale}px` }"
          >{{ petName }}</span
        >
      </div>
    </div>
    <span v-if="toast" class="pet-toast" role="status">{{ toast }}</span>
    <p
      v-if="wheelHint && donutOpen && !donutClosing"
      class="wheel-hint"
      role="status"
    >
      {{ wheelHint }}
    </p>
    <span v-if="error" class="pet-error" role="alert">{{ error }}</span>
  </main>

  <main
    v-else-if="pillView"
    class="pill-surface"
    :class="{
      double: barStyle === 'double',
      minimal: barStyle === 'minimal',
    }"
  >
    <div class="pill-now">
      <div class="pill-cover" :class="{ empty: !state?.music.cover }">
        <img v-if="state?.music.cover" :src="state.music.cover" alt="" />
        <MusicIcon v-else :size="18" :stroke-width="2" aria-hidden="true" />
      </div>
      <div v-if="barStyle !== 'minimal'" class="pill-meta">
        <span
          ref="pillTitleEl"
          :key="state?.music.title"
          class="pill-title"
          :class="{
            scrolling: pillTitleScrolling,
            paused: !state?.music?.playing,
          }"
          :style="{ '--pill-title-duration': pillTitleDuration }"
          :title="state?.music.title"
        >
          <span class="pill-title-track">
            <span>{{ state?.music.title || "未在播放" }}</span>
            <span v-if="pillTitleScrolling" aria-hidden="true">{{
              state?.music.title || "未在播放"
            }}</span>
          </span>
        </span>
        <span
          v-if="isTwoLineBar"
          :key="pillSubline"
          class="pill-lyric pill-lyric-lines"
          :class="{ placeholder: !pillLyric }"
          :title="pillSubline"
          >{{ pillSubline }}</span
        >
        <span
          v-else
          ref="pillLyricEl"
          :key="pillSubline"
          class="pill-lyric"
          :class="{
            placeholder: !pillLyric,
            scrolling: pillLyricScrolling,
            paused: !state?.music?.playing,
          }"
          :style="{ '--pill-lyric-duration': pillLyricDuration }"
          :title="pillSubline"
        >
          <span class="pill-lyric-track">
            <span>{{ pillSubline }}</span>
            <span v-if="pillLyricScrolling" aria-hidden="true">{{
              pillSubline
            }}</span>
          </span>
        </span>
      </div>
    </div>

    <div class="pill-group pill-controls">
      <button
        v-if="state?.music.source === 'apple'"
        type="button"
        class="pill-button"
        :class="{ active: state?.music.shuffle }"
        :aria-label="state?.music.shuffle ? '关闭随机播放' : '随机播放'"
        :title="state?.music.shuffle ? '关闭随机播放' : '随机播放'"
        @click="musicControl('shuffle')"
      >
        <Shuffle :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="pill-button transport"
        aria-label="上一首"
        title="上一首"
        @click="musicControl('previous')"
      >
        <SkipBack
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="pill-button transport"
        :aria-label="state?.music.playing ? '暂停' : '播放'"
        :title="state?.music.playing ? '暂停' : '播放'"
        @click="musicControl('toggle')"
      >
        <Pause
          v-if="state?.music.playing"
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
        <Play
          v-else
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="pill-button transport"
        aria-label="下一首"
        title="下一首"
        @click="musicControl('next')"
      >
        <SkipForward
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="state?.music.source === 'apple'"
        type="button"
        class="pill-button"
        :class="{ active: state?.music.repeat !== 'off' }"
        :aria-label="state?.music.repeat === 'one' ? '单曲循环' : state?.music.repeat === 'all' ? '列表循环' : '不循环'"
        :title="state?.music.repeat === 'one' ? '单曲循环' : state?.music.repeat === 'all' ? '列表循环' : '不循环'"
        @click="musicControl('repeat')"
      >
        <InfinityIcon
          v-if="state?.music.repeat === 'one'"
          :size="16"
          :stroke-width="2"
          aria-hidden="true"
        />
        <Repeat v-else :size="16" :stroke-width="2" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="pill-button pill-volume"
        :class="{ active: state?.music.muted }"
        :aria-label="state?.music.muted ? '取消静音' : '静音'"
        :title="state?.music.muted ? '取消静音' : '静音'"
        @mouseenter="showVolumePopup(true)"
        @mouseleave="showVolumePopup(false)"
        @click="musicControl('mute')"
      >
        <VolumeX
          v-if="state?.music.muted"
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
        <Volume2
          v-else
          :size="18"
          :stroke-width="2"
          fill="currentColor"
          aria-hidden="true"
        />
      </button>
    </div>

    <button
      type="button"
      class="pill-hide"
      aria-label="隐藏播放控制栏"
      title="隐藏播放控制栏"
      @click="command({ type: 'bar-toggle' })"
    >
      <EyeOff :size="16" :stroke-width="2" aria-hidden="true" />
    </button>
  </main>

  <main
    v-else-if="bubbleView"
    :key="state?.bubble?.text"
    class="bubble-surface"
  >
    <div class="bubble-body">
      <span class="bubble-text">{{ state?.bubble?.text }}</span>
    </div>
  </main>

  <main v-else-if="toastView" class="bubble-surface toast-surface">
    <div class="bubble-body toast-body">
      <span class="bubble-text">{{ state?.toast }}</span>
    </div>
  </main>

  <main v-else-if="lyricsView" class="lyrics-surface">
    <template v-if="state?.lyrics?.instrumental">
      <span class="lyrics-state">纯音乐</span>
    </template>
    <template v-else-if="currentLyric">
      <div :key="state?.lyrics?.key" class="lyrics-viewport">
        <div
          class="lyrics-track"
          :style="{ transform: `translateY(${scrollOffset}px)` }"
        >
          <span
            v-for="(line, index) in lyricLines"
            :key="`${line.time}-${index}`"
            class="lyrics-row"
            :class="{
              current: index === currentLyric.index,
              past: index < currentLyric.index,
              future: index > currentLyric.index,
            }"
            :style="rowStyle(index)"
            >{{ line.text }}</span
          >
        </div>
      </div>
    </template>
    <template v-else-if="plainPreview.length">
      <div :key="state?.lyrics?.key" class="lyrics-viewport plain">
        <span
          v-for="(line, index) in plainPreview"
          :key="line"
          class="lyrics-row"
          :class="{
            current: index === plainCurrent,
            past: index < plainCurrent,
            future: index > plainCurrent,
          }"
          :style="rowStyle(index, plainCurrent)"
          >{{ line }}</span
        >
      </div>
    </template>
    <span v-else class="lyrics-state">暂无歌词</span>
  </main>

  <main v-else-if="eyeView" class="eye-surface">
    <button
      type="button"
      class="eye-button"
      :aria-label="state?.barVisible ? '隐藏播放控制栏' : '显示播放控制栏'"
      :title="state?.barVisible ? '隐藏播放控制栏' : '显示播放控制栏'"
      @click="command({ type: 'bar-toggle' })"
    >
      <EyeOff
        v-if="state?.barVisible"
        :size="15"
        :stroke-width="2"
        aria-hidden="true"
      />
      <Eye v-else :size="15" :stroke-width="2" aria-hidden="true" />
    </button>
  </main>

  <main
    v-else-if="volumeView"
    class="volume-surface"
    @mouseenter="showVolumePopup(true)"
    @mouseleave="showVolumePopup(false)"
  >
    <input
      class="volume-slider"
      type="range"
      min="0"
      max="100"
      step="1"
      :value="volumeDisplay"
      aria-label="音量"
      @pointerdown="beginVolumeDrag"
      @pointerup="endVolumeDrag"
      @pointercancel="endVolumeDrag"
      @input="onVolumeInput"
    />
  </main>

  <main v-else-if="notesView" class="notes-surface">
    <img :src="musicNotes" class="notes-art" alt="" />
  </main>

  <AskPanel
    v-else-if="askView"
    :state="state"
    :error="error"
    @command="command"
  />

  <ConvertPanel
    v-else-if="convertView"
    :state="state"
    :error="error"
    @command="command"
  />

  <BatchRenamePanel
    v-else-if="renameView"
    :state="state"
    :error="error"
    @command="command"
  />

  <SettingsPanel
    v-else-if="settingsView"
    :state="state"
    :error="error"
    @command="command"
  />

  <PomodoroPanel
    v-else-if="focusView"
    :state="state"
    :error="error"
    @command="command"
  />

  <WaterPanel
    v-else-if="waterView"
    :state="state"
    :error="error"
    @command="command"
  />

  <BreakPanel
    v-else-if="breakView"
    :state="state"
    :error="error"
    @command="command"
  />

  <ProfilePanel
    v-else-if="profileView"
    :state="state"
    :error="error"
    @command="command"
  />

  <ClipboardPanel
    v-else-if="clipboardView"
    :state="state"
    :error="error"
    @command="command"
  />

  <FocusBadge v-else-if="focusBadgeView" :state="state" />

  <TodoPanel
    v-else-if="todoView"
    :state="state"
    :error="error"
    @command="command"
  />

  <FilePocket
    v-else-if="pocketView"
    :state="state"
    :error="error"
    @command="command"
    @select-files="selectFiles"
    @receive-files="receiveFiles"
  />

  <main
    v-else
    class="lab-shell"
    @dragover="enter"
    @drop="receive"
    @dragleave="dragOver = false"
  >
    <header class="lab-header">
      <div>
        <div class="eyebrow">毛趣萌仔 <span>／ P0 · 03</span></div>
        <h1>透明窗口与拖放</h1>
        <p>让桌面交互先跑通。这里连接的是真实窗口与本地文件。</p>
      </div>
      <div class="local-badge">
        <span></span>{{ state ? "本地运行" : "等待本地连接" }}
      </div>
    </header>

    <div v-if="error" class="feedback error" role="alert">{{ error }}</div>
    <div v-if="notice" class="feedback" role="status">{{ notice }}</div>
    <div v-if="dragOver" class="drop-banner">
      松开即可登记本地文件 · 原件保留
    </div>

    <div class="lab-grid">
      <section class="card interaction-card">
        <div class="section-heading">
          <h2>桌面标记</h2>
          <span class="section-index">01</span>
        </div>
        <p class="muted">
          单击打开验证台，按住主体拖动。透明像素让出鼠标，右键可重新打开此窗口。
        </p>
        <div class="status-list" v-if="state">
          <div>
            <span>透明区域穿透</span
            ><strong data-testid="passthrough">{{
              state.passthrough ? "正在让出鼠标" : "正在接收交互"
            }}</strong>
          </div>
          <div>
            <span>主体像素命中</span
            ><strong>{{ state.maskReady ? "已就绪" : "等待标记加载" }}</strong>
          </div>
          <div>
            <span>窗口位置</span
            ><code>{{ state.petBounds.x }}, {{ state.petBounds.y }}</code>
          </div>
          <div>
            <span>窗口尺寸</span
            ><code
              >{{ state.petBounds.width }} ×
              {{ state.petBounds.height }} DIP</code
            >
          </div>
        </div>
        <label class="field-label" for="marker-scale"
          >显示比例 <span>仅用于技术验证</span></label
        >
        <SelectField
          id="marker-scale"
          wide
          size="md"
          :value="state?.scale || 1"
          @change="
            command({
              type: 'scale',
              scale: Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option :value="0.75">0.75 倍</option>
          <option :value="1">1 倍</option>
          <option :value="1.5">1.5 倍</option>
          <option :value="2">2 倍</option>
        </SelectField>
        <button
          class="primary full"
          data-testid="drop-mode"
          :aria-pressed="state?.dropMode || false"
          @click="command({ type: 'drop-mode', enabled: !state?.dropMode })"
        >
          {{ state?.dropMode ? "关闭文件投递区域" : "开启文件投递区域" }}
        </button>
        <button class="full" @click="command({ type: 'recover' })">
          恢复标记位置
        </button>
        <p class="hint">恢复快捷键：⌘ / Ctrl + Shift + M。也可使用系统托盘。</p>
      </section>

      <section class="card files-card">
        <div class="section-heading">
          <h2>文件投递</h2>
          <span class="section-index">02</span>
        </div>
        <p class="muted">
          拖入标记或此窗口，也可以选择文件。当前只验证登记与系统拖出。
        </p>
        <div v-if="!state?.files.length" class="empty-files">
          <Inbox
            class="file-outline"
            :size="38"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          /><strong>还没有接收文件</strong>
          <p>源文件留在原处，置物架索引在重启后保留。</p>
          <button @click="selectFiles">选择本地文件</button>
        </div>
        <div v-else class="file-list">
          <article
            v-for="file in state.files"
            :key="file.id"
            class="file-row"
            data-testid="file-row"
          >
            <div
              class="file-info"
              draggable="true"
              @dragstart="startDrag($event, file.id)"
              title="按住文件拖到桌面或文件夹"
            >
              <strong :title="file.name">{{ file.name }}</strong
              ><span>{{ size(file.size) }} · 本地文件</span>
            </div>
            <div class="file-actions">
              <button
                @click="command({ type: 'reveal-file', fileId: file.id })"
                :aria-label="`定位 ${file.name}`"
              >
                定位</button
              ><button
                @click="command({ type: 'remove-file', fileId: file.id })"
                :aria-label="`移除 ${file.name} 的记录`"
              >
                移除
              </button>
            </div>
          </article>
          <button class="add-files" @click="selectFiles">
            <Plus
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />继续选择文件
          </button>
        </div>
        <div class="scope-note">
          <span>本项边界</span
          >这是开发诊断。日常文件操作在桌宠旁的卡片完成；完整转换与队列尚待接入。
        </div>
      </section>

      <section class="card display-card">
        <div class="section-heading">
          <h2>显示环境</h2>
          <span class="section-index">03</span>
        </div>
        <div
          v-for="display in state?.displays"
          :key="display.id"
          class="display-row"
        >
          <strong>{{ display.label }}</strong
          ><span
            >{{ display.bounds.width }} × {{ display.bounds.height }} DIP ·
            {{ display.scaleFactor }}×</span
          ><small>原点 {{ display.bounds.x }}, {{ display.bounds.y }}</small
          ><button
            @click="command({ type: 'move-display', displayId: display.id })"
          >
            将标记移到此屏幕
          </button>
        </div>
        <p class="hint">
          插拔、缩放或唤醒后自动重新约束位置。实际多屏操作仍需逐台验证。
        </p>
      </section>

      <section class="card capture-card">
        <div class="section-heading">
          <h2>截图权限</h2>
          <span class="section-index">04</span>
        </div>
        <div class="permission-state">
          <span
            class="permission-dot"
            :class="{ granted: state?.screenPermission === 'granted' }"
          ></span
          ><strong data-testid="screen-permission">{{
            permissionLabel
          }}</strong>
        </div>
        <p class="muted">
          点击后才请求屏幕预览。缩略图仅保存在内存；保存时由你选择本地位置。
        </p>
        <div class="button-row">
          <button :disabled="captureBusy" @click="capture">
            {{ captureBusy ? "正在获取…" : "获取权限验证预览" }}</button
          ><button @click="command({ type: 'refresh' })">刷新状态</button
          ><button
            v-if="state?.runtime.platform === 'darwin'"
            @click="command({ type: 'screen-settings' })"
          >
            系统权限设置
          </button>
        </div>
        <p class="hint">
          此处验证屏幕捕获与权限，不代表已完成框选截图功能。macOS
          授权后可能需要重启原型。
        </p>
        <div class="previews">
          <figure v-for="preview in previews" :key="preview.id">
            <img
              :src="preview.dataUrl"
              :alt="`${preview.name} 的权限验证缩略图`"
            />
            <figcaption>
              {{ preview.name }}
              <button @click="saveCapture(preview.id)">另存缩略图</button>
            </figcaption>
          </figure>
        </div>
      </section>
    </div>

    <section class="event-section">
      <div class="section-heading">
        <h2>本次运行记录</h2>
        <span>仅记录状态，不记录文件内容</span>
      </div>
      <ol>
        <li
          v-for="(event, index) in state?.events"
          :key="`${event.time}-${index}`"
        >
          <time>{{
            new Date(event.time).toLocaleTimeString("zh-CN", { hour12: false })
          }}</time
          ><span>{{ event.message }}</span>
        </li>
      </ol>
    </section>
    <footer>
      <span v-if="state"
        >{{ state.runtime.platform }} / {{ state.runtime.arch }} · Electron
        {{ state.runtime.electron }} · v{{ state.runtime.version }}
        <span v-if="state.blockedRequests"
          >· 已阻止 {{ state.blockedRequests }} 次外部请求</span
        ></span
      >
      <div>
        <button @click="command({ type: 'open-data' })">打开本地数据目录</button
        ><button @click="command({ type: 'quit' })">退出原型</button>
      </div>
    </footer>
  </main>
</template>
