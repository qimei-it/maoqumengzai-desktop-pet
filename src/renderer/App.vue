<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Inbox, Plus } from "@lucide/vue";
import type {
  CapturePreview,
  Command,
  Result,
  Snapshot,
} from "../shared/protocol";
import {
  actionAt,
  conversionTargets,
  donutWindowSize,
  petSprite,
  type DropAction,
} from "../shared/donut";
import catBase from "./assets/pet/ragdoll/base.png";
import catBlink from "./assets/pet/ragdoll/blink.png";
import catLifted from "./assets/pet/ragdoll/lifted.png";
import catMusic from "./assets/pet/ragdoll/music.png";
import catPonder from "./assets/pet/ragdoll/ponder.png";
import DonutMenu from "./DonutMenu.vue";
import FilePocket from "./FilePocket.vue";

const petView = new URLSearchParams(location.search).get("view") === "pet";
const pocketView =
  new URLSearchParams(location.search).get("view") === "pocket";
document.body.classList.toggle("pet-view", petView);
document.body.classList.toggle("pocket-view", pocketView);
if (petView) document.title = "毛趣萌仔 · 交互标记";
if (pocketView) document.title = "毛趣萌仔 · 文件置物架";
const api = window.mqmz;
const state = ref<Snapshot>();
const error = ref("");
const notice = ref("");
const previews = ref<CapturePreview[]>([]);
const captureBusy = ref(false);
const dragOver = ref(false);
const marker = ref<HTMLImageElement>();
const displayId = ref<number>();
const donutOpen = ref(false);
const donutClosing = ref(false);
const donutActive = ref<DropAction | null>(null);
type PetPose = "base" | "blink" | "lifted" | "music" | "ponder";
const poseSources: Record<PetPose, string> = {
  base: catBase,
  blink: catBlink,
  lifted: catLifted,
  music: catMusic,
  ponder: catPonder,
};
const petName = "麻薯";
const petPose = ref<PetPose>("base");
/** Interaction poses win over listening; the blink is only a frame of the base. */
const displayPose = computed<PetPose>(() => {
  if (petPose.value === "lifted" || petPose.value === "ponder")
    return petPose.value;
  if (state.value?.music.playing) return "music";
  return petPose.value;
});
const poseSrc = computed(() => poseSources[displayPose.value]);
const toast = ref("");
const markerScale = computed(() => state.value?.scale || 1);
let unsubscribe: (() => void) | undefined;
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
    if (!donutOpen.value) return;
    void closeDonut();
    void command({ type: "drop-mode", enabled: false });
  }, 1500);
}
function disarmWatchdog(): void {
  if (dragWatchdog) clearTimeout(dragWatchdog);
  dragWatchdog = undefined;
}
function trackHover(event: DragEvent): void {
  // dragover already arrives at a human-scale rate; a direct update avoids
  // requestAnimationFrame throttling when the pet window is backgrounded.
  dragPoint.x = event.clientX;
  dragPoint.y = event.clientY;
  armWatchdog();
  donutActive.value = regionAt(dragPoint.x, dragPoint.y);
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
async function openDonut(): Promise<void> {
  // A new drag may arrive while the previous wheel is fading out.
  closeToken += 1;
  if (donutOpening) return;
  if (donutOpen.value && !donutClosing.value) return;
  donutOpening = true;
  try {
    await openDonutSurface();
  } finally {
    donutOpening = false;
  }
}
async function openDonutSurface(): Promise<void> {
  // The window is invisible: resize it first, then mount the ring so no slice
  // is ever drawn outside the window while it changes size.
  await command({ type: "wheel", open: true });
  await viewportReady(donutWindowSize(markerScale.value).width);
  if (!dragOver.value) {
    await command({ type: "wheel", open: false });
    return;
  }
  acceptSlicesAfter = performance.now() + 260;
  donutOpen.value = true;
  donutClosing.value = false;
  donutActive.value = null;
}
async function closeDonut(send = true): Promise<void> {
  disarmWatchdog();
  if (!donutOpen.value) return;
  const token = ++closeToken;
  donutClosing.value = true;
  donutActive.value = null;
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (token !== closeToken) return
  donutOpen.value = false;
  donutClosing.value = false;
  petPose.value = "base";
  if (!send || !api) return;
  try {
    state.value = unwrap(await api.command({ type: "wheel", open: false }));
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "本地操作失败。";
  }
}
function enter(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  dragOver.value = true;
  if (!petView) return;
  petPose.value = "ponder";
  armWatchdog();
  donutActive.value = null;
  // Enabling the receive region closes the wheel window; open only after that
  // command has landed, otherwise its reply would close the fresh wheel.
  dropModeChain = dropModeChain.then(async () => {
    if (!state.value?.dropMode) {
      await command({ type: "drop-mode", enabled: true });
    }
  });
  void dropModeChain.then(() => {
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
  dragOver.value = false;
  if (!petView) return;
  void closeDonut();
  void command({ type: "drop-mode", enabled: false });
}
async function receive(event: DragEvent): Promise<void> {
  event.preventDefault();
  const action = petView ? regionAt(event.clientX, event.clientY) : null;
  const files = [...(event.dataTransfer?.files || [])];
  disarmWatchdog();
  dragOver.value = false;
  if (petView) {
    void closeDonut();
    void command({ type: "drop-mode", enabled: false });
  }
  if (!files.length) return;
  if (!petView) {
    await receiveFiles(files);
    return;
  }
  if (!action) return;
  await applyDrop(files, action);
}
async function applyDrop(files: File[], action: DropAction): Promise<void> {
  if (action === "convert") {
    const targets = conversionTargets(files.map((file) => file.name));
    flash(
      targets.length
        ? `格式转换引擎尚未接入；接入后可选 ${targets.join("、")}`
        : "格式转换引擎尚未接入；这批文件暂无统一目标格式",
    );
    return;
  }
  if (action === "compress") {
    flash("压缩引擎尚未接入；当前可用暂存、另存副本和吃掉。");
    return;
  }
  await attempt(async () => {
    if (!api) throw new Error("请在 Electron 中验证本地文件操作。");
    const snapshot = unwrap(await api.receiveFiles(files));
    state.value = snapshot;
    const ids = snapshot.received?.fileIds ?? [];
    if (!ids.length) return;
    if (action === "stash") {
      for (const id of ids)
        state.value = unwrap(
          await api.command({ type: "stash-file", fileId: id }),
        );
      flash("已暂存到置物架；按住卡片可以拖出。");
      return;
    }
    if (action === "copy") {
      for (const id of ids)
        state.value = unwrap(
          await api.command({ type: "save-copy", fileId: id }),
        );
      flash("已另存副本；原件保留。");
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
  if (!donutOpen.value || event.key !== "Escape") return;
  event.preventDefault();
  void closeDonut();
  void command({ type: "drop-mode", enabled: false });
}
function pointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !api || pointerId !== undefined) return;
  event.preventDefault();
  petPose.value = "lifted";
  pointerId = event.pointerId;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  void attempt(async () => {
    unwrap(await api.pointer("down"));
  });
}
function pointerUp(event: PointerEvent): void {
  if (pointerId !== event.pointerId || !api) return;
  pointerId = undefined;
  petPose.value = "base";
  void attempt(async () => {
    unwrap(await api.pointer(event.type === "pointercancel" ? "cancel" : "up"));
  });
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
onMounted(async () => {
  if (!api) {
    error.value =
      "当前页面未连接 Electron。请运行 npm run dev，窗口与文件能力不会在普通浏览器中模拟成功。";
    return;
  }
  unsubscribe = api.onSnapshot((value) => {
    state.value = value;
  });
  await attempt(async () => {
    state.value = unwrap(await api.snapshot());
    displayId.value = state.value.displays[0]?.id;
  });
  await nextTick();
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
  window.removeEventListener("resize", updateMask);
  window.removeEventListener("keydown", onKeydown);
  disarmWatchdog();
  if (blinkTimer) clearTimeout(blinkTimer);
  if (blinkReset) clearTimeout(blinkReset);
  if (toastTimer) clearTimeout(toastTimer);
  unsubscribe?.();
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
    @contextmenu.prevent="command({ type: 'show-pocket' })"
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
          :scale="markerScale"
          :active="donutActive"
          :closing="donutClosing"
          :error="error"
        />
        <span
          class="marker-caption"
          :class="{ hidden: donutOpen || displayPose === 'lifted' }"
          :style="{ fontSize: `${10 * markerScale}px` }"
          >{{ petName }}</span
        >
      </div>
    </div>
    <span v-if="toast" class="pet-toast" role="status">{{ toast }}</span>
    <span v-if="error" class="pet-error" role="alert">{{ error }}</span>
  </main>

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
        <select
          id="marker-scale"
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
        </select>
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
          <p>源文件留在原处；未暂存的记录仅在本次运行保留。</p>
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
