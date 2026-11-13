<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Archive, Boxes, ClipboardList, Database, Info, Mail, Monitor, Palette, PawPrint, SixteenthNotes } from '@lucide/vue'
import type { Command, SettingsSection, Snapshot } from '../shared/protocol'
import type { ClipboardConfig } from '../shared/clipboard'
import { clipboardDefaults } from '../shared/clipboard'
import { builtinEngines, optionalEngines } from '../shared/conversion-engines'
import {
  defaultSettings,
  musicBarStyleLabels,
  musicBarStyles,
  petScales,
  themeIds,
  themeLabels,
  type PetScale,
  type SettingsState,
  type ThemeId,
} from '../shared/settings'
import {
  hoverActionLabels,
  hoverActions,
  hoverLabels,
  maxWheelActions,
  minWheelActions,
  sliceActions,
  sliceLabelColumns,
  sliceLabels,
  type DropAction,
  type HoverAction,
} from '../shared/donut'
import DeepSeekAgentMark from './DeepSeekAgentMark.vue'
import ClipboardSettings from './ClipboardSettings.vue'
import catBase from './assets/pet/ragdoll/base.png'
import MusicBarPreview from './MusicBarPreview.vue'
import MailSettings from './MailSettings.vue'
import PanelHeader from './PanelHeader.vue'
import SegmentedControl from './SegmentedControl.vue'
import WheelConfigurator from './WheelConfigurator.vue'
import WheelPreview from './WheelPreview.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const nav = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'desktop', label: '桌面', icon: Monitor },
  { id: 'data', label: '数据', icon: Database },
  { id: 'profile', label: '宠物档案', icon: PawPrint },
  { id: 'clipboard', label: '剪贴板', icon: ClipboardList },
  { id: 'shelf', label: '文件置物架', icon: Archive },
  { id: 'conversion', label: '格式转换', icon: Boxes },
  { id: 'mail', label: '邮件客户端', icon: Mail },
  { id: 'music', label: '音乐播放器', icon: SixteenthNotes },
  { id: 'ai', label: '智能体', icon: DeepSeekAgentMark },
  { id: 'about', label: '关于', icon: Info },
] as const
const section = computed<SettingsSection>(
  () => props.state?.settingsSection ?? 'appearance',
)
const apiKey = ref('')
const editingKey = ref(false)
const wheelEditor = ref<'hover' | 'file' | null>(null)

const settings = computed<SettingsState>(
  () => props.state?.settings ?? defaultSettings,
)
const clipboardConfig = computed<ClipboardConfig>(
  () => props.state?.clipboard ?? clipboardDefaults,
)
const themes = themeIds.map((id) => ({ id, label: themeLabels[id] }))
const petProfiles = computed(() => [
  { id: 'ragdoll', name: settings.value.petName, cover: catBase },
])
const configured = computed(() => Boolean(props.state?.ai.configured))
const aiQuota = computed(() => props.state?.aiQuota)
const openAiQuotaLabel = computed(() => {
  const provider = aiQuota.value?.openai
  if (!provider?.configured) return '未找到 Codex 登录'
  if (provider.status === 'loading') return '读取中'
  if (provider.status === 'error') return '读取失败'
  if (provider.status === 'stale') return '数据待刷新'
  return provider.plan ? `已连接 · ${provider.plan}` : '已连接'
})
const deepSeekQuotaLabel = computed(() => {
  const provider = aiQuota.value?.deepseek
  if (!provider?.configured) return '未配置'
  if (provider.status === 'loading') return '读取中'
  if (provider.status === 'error') return '读取失败'
  if (provider.status === 'stale') return '数据待刷新'
  return '已连接'
})
const bellyCount = computed(() => props.state?.belly.length ?? 0)
const shelfInvalidCount = computed(
  () => props.state?.shelfInvalidCount ?? 0,
)
const ffmpeg = computed(() => props.state?.engines.ffmpeg)
const libreOffice = computed(() => props.state?.engines.libreoffice)
const libreOfficeReady = computed(
  () => libreOffice.value?.status === 'ready',
)
const libreOfficeStatusLabel = computed(() => {
  if (libreOfficeReady.value) return '可用'
  if (libreOffice.value?.status === 'error') return '不可用'
  return '未选择'
})
const ffmpegStatus = computed(() => ffmpeg.value?.status ?? 'missing')
const ffmpegStatusLabel = computed(() => {
  switch (ffmpegStatus.value) {
    case 'downloading':
      return `下载中 ${ffmpeg.value?.progress ?? 0}%`
    case 'installed':
      return '可用'
    case 'error':
      return '安装失败'
    case 'unsupported':
      return '平台不支持'
    default:
      return '未安装'
  }
})
const ffmpegSource = computed(() => {
  if (ffmpeg.value?.origin === 'local') return '本地程序'
  return ffmpeg.value?.source ?? 'AgentDVR FFmpeg · LGPL v3'
})
function formatEngineSize(bytes: number): string {
  if (!bytes) return '—'
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
function installFfmpeg(): void {
  emit('command', { type: 'engine-install', id: 'ffmpeg' })
}
function cancelFfmpeg(): void {
  emit('command', { type: 'engine-cancel', id: 'ffmpeg' })
}
function recheckFfmpeg(): void {
  emit('command', { type: 'engine-recheck', id: 'ffmpeg' })
}
function useLocalFfmpeg(): void {
  emit('command', { type: 'engine-use-local', id: 'ffmpeg' })
}
function useLocalLibreOffice(): void {
  emit('command', { type: 'engine-use-local', id: 'libreoffice' })
}
function removeEngine(id: 'ffmpeg' | 'libreoffice'): void {
  emit('command', { type: 'engine-remove', id })
}
function checkBuiltin(): void {
  emit('command', { type: 'engine-self-check' })
}
function builtinState(id: string) {
  return props.state?.engines.builtin?.[id]
}
function builtinStatus(id: string): string {
  if (!builtinState(id)) return '检查中'
  return builtinState(id)?.status === 'error' ? '组件损坏' : '可用'
}
function engineStatusClass(id: string): string {
  if (id === 'ffmpeg') return ffmpegStatus.value
  if (id === 'libreoffice')
    return libreOfficeReady.value ? 'installed' : 'idle'
  return 'idle'
}
function engineStatusText(id: string): string {
  if (id === 'ffmpeg') return ffmpegStatusLabel.value
  if (id === 'libreoffice') return libreOfficeStatusLabel.value
  return '未接入'
}
const clipboardUnpinnedCount = computed(
  () =>
    props.state?.clipboard.entries.filter((entry) => !entry.pinned).length ??
    0,
)
const shelfMaxOptions = [50, 100, 200, 500]
const themeOptions = themes.map((item) => ({
  value: item.id,
  label: item.label,
}))
const petScaleOptions = petScales.map((value) => ({
  value,
  label: `${value}×`,
}))
const shelfMaxControlOptions = shelfMaxOptions.map((value) => ({
  value,
  label: String(value),
}))
const aiQuotaRefreshOptions = [5, 15, 30, 60].map((value) => ({
  value,
  label: `${value} 分钟`,
}))


watch(configured, (value) => {
  if (!value) return
  editingKey.value = false
  apiKey.value = ''
})
watch(
  section,
  (value) => {
    if (value === 'data' || value === 'shelf')
      emit('command', { type: 'shelf-scan' })
  },
  { immediate: true },
)

function selectSection(section: SettingsSection): void {
  wheelEditor.value = null
  emit('command', { type: 'settings-section', section })
}
function update(patch: Partial<SettingsState>): void {
  emit('command', { type: 'settings-update', patch })
}
function updateHoverWheel(actions: string[]): void {
  update({ hoverWheelActions: actions as HoverAction[] })
}
function updateFileWheel(actions: string[]): void {
  update({ fileWheelActions: actions as DropAction[] })
}
function restoreHoverWheel(): void {
  updateHoverWheel([...hoverActions])
}
function restoreFileWheel(): void {
  updateFileWheel([...sliceActions])
}
function updateClipboardConfig(patch: Partial<ClipboardConfig>): void {
  emit('command', { type: 'clipboard-config', patch })
}
function toggle(
  key:
    | 'launchAtLogin'
    | 'statusBubbles'
    | 'musicBubbles'
    | 'shelfAutoScreenshots'
    | 'shelfClipboardImages'
    | 'shelfScreenshotBubble'
    | 'aiQuotaEnabled',
): void {
  update({ [key]: !settings.value[key] })
}
const shelfFolderLabel = computed(() => {
  const folders = props.state?.shelfFolders ?? []
  return folders.length ? folders.join('  ·  ') : '读取中'
})
function saveKey(): void {
  const value = apiKey.value.trim()
  if (!value) return
  emit('command', { type: 'ai-config', apiKey: value })
  apiKey.value = ''
}
function close(): void {
  emit('command', { type: 'settings-close' })
}
function onEscape(): void {
  if (wheelEditor.value) {
    wheelEditor.value = null
    return
  }
  close()
}
</script>

<template>
  <main class="settings-shell" @keydown.esc="onEscape">
    <section class="settings-surface" aria-label="设置">
      <PanelHeader
        title="设置"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div class="settings-body">
        <nav class="settings-nav" aria-label="设置分类">
          <button
            v-for="item in nav"
            :key="item.id"
            type="button"
            :class="{ active: section === item.id }"
            :aria-current="section === item.id ? 'page' : undefined"
            @click="selectSection(item.id)"
          >
            <component
              :is="item.icon"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="settings-content panel-scroll">
          <WheelConfigurator
            v-if="wheelEditor === 'hover'"
            title="悬停轮盘"
            :actions="settings.hoverWheelActions"
            :catalog="hoverActions"
            :labels="hoverActionLabels"
            :wheel-labels="hoverLabels"
            :min="minWheelActions"
            :max="maxWheelActions"
            single-line
            :pet-image="catBase"
            @update="updateHoverWheel"
            @close="wheelEditor = null"
          />
          <WheelConfigurator
            v-else-if="wheelEditor === 'file'"
            title="文件轮盘"
            :actions="settings.fileWheelActions"
            :catalog="sliceActions"
            :labels="sliceLabels"
            :wheel-labels="sliceLabelColumns"
            :min="minWheelActions"
            :max="maxWheelActions"
            :pet-image="catBase"
            @update="updateFileWheel"
            @close="wheelEditor = null"
          />
          <template v-else-if="section === 'appearance'">
            <div class="settings-row">
              <span class="settings-label">主题</span>
              <SegmentedControl
                :model-value="settings.theme"
                :options="themeOptions"
                aria-label="主题"
                @update="value => update({ theme: value as ThemeId })"
              />
            </div>
            <div class="settings-row">
              <span class="settings-label">桌宠大小</span>
              <SegmentedControl
                :model-value="settings.scale"
                :options="petScaleOptions"
                aria-label="桌宠大小"
                @update="value => update({ scale: value as PetScale })"
              />
            </div>
            <div class="wheel-settings-grid">
              <section class="wheel-setting">
                <div class="wheel-setting-head">
                  <span class="settings-label">悬停轮盘</span>
                  <div class="wheel-setting-actions">
                    <button
                      type="button"
                      class="settings-button"
                      @click="restoreHoverWheel"
                    >
                      恢复默认
                    </button>
                    <button
                      type="button"
                      class="settings-button primary"
                      @click="wheelEditor = 'hover'"
                    >
                      配置
                    </button>
                  </div>
                </div>
                <WheelPreview
                  :scale="0.75"
                  :actions="settings.hoverWheelActions"
                  :labels="hoverLabels"
                  :label-size="11"
                  single-line
                  :pet-image="catBase"
                  aria-label="悬停轮盘预览"
                />
              </section>
              <section class="wheel-setting">
                <div class="wheel-setting-head">
                  <span class="settings-label">文件轮盘</span>
                  <div class="wheel-setting-actions">
                    <button
                      type="button"
                      class="settings-button"
                      @click="restoreFileWheel"
                    >
                      恢复默认
                    </button>
                    <button
                      type="button"
                      class="settings-button primary"
                      @click="wheelEditor = 'file'"
                    >
                      配置
                    </button>
                  </div>
                </div>
                <WheelPreview
                  :scale="0.75"
                  :actions="settings.fileWheelActions"
                  :labels="sliceLabelColumns"
                  :label-size="11"
                  :pet-image="catBase"
                  aria-label="文件轮盘预览"
                />
              </section>
            </div>
          </template>

          <template v-else-if="section === 'desktop'">
            <div class="settings-row">
              <span id="setting-launch" class="settings-label">开机启动</span>
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-launch"
                :aria-checked="settings.launchAtLogin"
                @click="toggle('launchAtLogin')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span id="setting-status-bubbles" class="settings-label"
                >状态提示气泡</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-status-bubbles"
                :aria-checked="settings.statusBubbles"
                @click="toggle('statusBubbles')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span id="setting-music-bubbles" class="settings-label"
                >音乐互动气泡</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-music-bubbles"
                :aria-checked="settings.musicBubbles"
                @click="toggle('musicBubbles')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
          </template>

          <template v-else-if="section === 'data'">
            <div class="settings-row">
              <span class="settings-label">数据目录</span>
              <button
                type="button"
                class="settings-button primary"
                @click="emit('command', { type: 'settings-open-data' })"
              >
                打开
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">失效置物架记录</span>
              <span class="settings-inline">
                <span class="settings-value">{{ shelfInvalidCount }} 项</span>
                <button
                  type="button"
                  class="settings-button danger"
                  :disabled="shelfInvalidCount === 0"
                  @click="emit('command', { type: 'shelf-clear-invalid' })"
                >
                  清理
                </button>
              </span>
            </div>
            <div class="settings-row">
              <span class="settings-label">缓存</span>
              <button
                type="button"
                class="settings-button danger"
                @click="emit('command', { type: 'settings-clear-cache' })"
              >
                清理
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">剪贴板</span>
              <span class="settings-inline">
                <span class="settings-value">{{ clipboardUnpinnedCount }} 项</span>
                <button
                  type="button"
                  class="settings-button danger"
                  :disabled="clipboardUnpinnedCount === 0"
                  @click="emit('command', { type: 'clipboard-clear' })"
                >
                  清空
                </button>
              </span>
            </div>
            <div class="settings-row">
              <span class="settings-label">回收区</span>
              <span class="settings-inline">
                <span class="settings-value">{{ bellyCount }} 项</span>
                <button
                  type="button"
                  class="settings-button danger"
                  @click="emit('command', { type: 'settings-clear-belly' })"
                >
                  清空
                </button>
              </span>
            </div>
          </template>

          <template v-else-if="section === 'profile'">
            <div class="pet-grid">
              <button
                v-for="pet in petProfiles"
                :key="pet.id"
                type="button"
                class="pet-card"
                :aria-label="`打开${pet.name}的宠物档案`"
                @click="emit('command', { type: 'profile-open' })"
              >
                <span class="pet-cover">
                  <img :src="pet.cover" alt="" draggable="false" />
                </span>
                <span class="pet-card-name">{{ pet.name }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="section === 'clipboard'">
            <ClipboardSettings
              :config="clipboardConfig"
              @update="updateClipboardConfig"
            />
          </template>

          <template v-else-if="section === 'shelf'">
            <div class="settings-row">
              <span id="setting-shelf-screenshots" class="settings-label"
                >截图自动放入置物架</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-shelf-screenshots"
                :aria-checked="settings.shelfAutoScreenshots"
                @click="toggle('shelfAutoScreenshots')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span id="setting-shelf-clipboard" class="settings-label"
                >剪贴板图片自动放入置物架</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-shelf-clipboard"
                :aria-checked="settings.shelfClipboardImages"
                @click="toggle('shelfClipboardImages')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span id="setting-shelf-bubble" class="settings-label"
                >入架气泡提示</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-shelf-bubble"
                :aria-checked="settings.shelfScreenshotBubble"
                @click="toggle('shelfScreenshotBubble')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">记录上限</span>
              <SegmentedControl
                :model-value="settings.shelfMaxRecords"
                :options="shelfMaxControlOptions"
                aria-label="置物架记录上限"
                @update="value => update({ shelfMaxRecords: value as number })"
              />
            </div>
            <div class="settings-row">
              <span class="settings-label">截图目录</span>
              <span class="settings-value settings-path" :title="shelfFolderLabel">
                {{ shelfFolderLabel }}
              </span>
            </div>
          </template>

          <template v-else-if="section === 'conversion'">
            <div class="engine-section-head">
              <h3 class="engine-section-title">内置引擎</h3>
              <button
                type="button"
                class="settings-button engine-check"
                @click="checkBuiltin"
              >
                重新检查
              </button>
            </div>
            <div class="engine-cards">
              <article
                v-for="engine in builtinEngines"
                :key="engine.id"
                class="engine-card builtin"
              >
                <div class="engine-card-head">
                  <span class="engine-card-title">
                    {{ engine.name }}
                    <span class="engine-version">v{{ engine.version }}</span>
                    <span class="engine-role">{{ engine.role }}</span>
                  </span>
                  <span
                    class="engine-status"
                    :class="
                      builtinState(engine.id)?.status === 'error'
                        ? 'error'
                        : 'installed'
                    "
                  >
                    {{ builtinStatus(engine.id) }}
                  </span>
                </div>
                <p class="engine-card-line">支持 {{ engine.formats }}</p>
                <p
                  v-if="builtinState(engine.id)?.error"
                  class="engine-error"
                  role="alert"
                >
                  {{ builtinState(engine.id)?.error }}
                </p>
              </article>
            </div>
            <h3 class="engine-section-title spaced">可选引擎</h3>
            <div class="engine-cards">
              <article
                v-for="engine in optionalEngines"
                :key="engine.id"
                class="engine-card"
                :class="engineStatusClass(engine.id)"
              >
                <div class="engine-card-head">
                  <span class="engine-card-title">
                    {{ engine.name }}
                    <span
                      v-if="engine.id === 'ffmpeg'"
                      class="engine-version"
                      >v{{ ffmpeg?.version ?? '6.0' }}</span
                    >
                    <span class="engine-role">{{ engine.role }}</span>
                  </span>
                  <span
                    class="engine-status"
                    :class="engineStatusClass(engine.id)"
                  >
                    {{ engineStatusText(engine.id) }}
                  </span>
                </div>
                <p class="engine-card-desc">{{ engine.description }}</p>
                <p class="engine-card-line">支持 {{ engine.formats }}</p>
                <p class="engine-card-line">
                  <template v-if="engine.id === 'ffmpeg'">
                    来源 {{ ffmpegSource }} · 下载
                    {{ formatEngineSize(ffmpeg?.downloadBytes ?? 0) }} · 占用
                    {{ formatEngineSize(ffmpeg?.installedBytes ?? 0) }}
                  </template>
                  <template v-else-if="engine.id === 'libreoffice'">
                    {{
                      libreOfficeReady
                        ? `来源 本地程序${libreOffice?.version ? ` · v${libreOffice.version}` : ''}`
                        : '需要本机安装 LibreOffice'
                    }}
                  </template>

                </p>
                <div class="engine-card-footer">
                  <div
                    v-if="
                      engine.id === 'ffmpeg' && ffmpegStatus === 'downloading'
                    "
                    class="engine-progress"
                  >
                    <span :style="{ width: `${ffmpeg?.progress ?? 0}%` }" />
                  </div>
                  <template v-if="engine.id === 'ffmpeg'">
                    <button
                      v-if="ffmpegStatus === 'missing'"
                      type="button"
                      class="settings-button primary"
                      @click="installFfmpeg"
                    >
                      安装
                    </button>
                    <button
                      v-else-if="ffmpegStatus === 'error'"
                      type="button"
                      class="settings-button primary"
                      @click="installFfmpeg"
                    >
                      重试
                    </button>
                    <button
                      v-else-if="ffmpegStatus === 'downloading'"
                      type="button"
                      class="settings-button"
                      disabled
                    >
                      安装中
                    </button>
                    <template v-else-if="ffmpegStatus === 'installed'">
                      <button
                        type="button"
                        class="settings-button"
                        @click="recheckFfmpeg"
                      >
                        重新检查
                      </button>
                      <button
                        type="button"
                        class="settings-button danger"
                        title="删除应用内 FFmpeg 与临时文件"
                        @click="removeEngine('ffmpeg')"
                      >
                        卸载
                      </button>
                    </template>
                    <button
                      v-if="ffmpegStatus === 'downloading'"
                      type="button"
                      class="settings-button"
                      @click="cancelFfmpeg"
                    >
                      取消
                    </button>
                    <button
                      v-if="ffmpegStatus !== 'downloading'"
                      type="button"
                      class="settings-button"
                      @click="useLocalFfmpeg"
                    >
                      使用本地程序…
                    </button>
                  </template>
                  <template v-else-if="engine.id === 'libreoffice'">
                    <button
                      type="button"
                      class="settings-button"
                      @click="useLocalLibreOffice"
                    >
                      使用本地程序…
                    </button>
                    <button
                      v-if="libreOfficeReady"
                      type="button"
                      class="settings-button danger"
                      title="清除应用内选择，不删除系统程序"
                      @click="removeEngine('libreoffice')"
                    >
                      卸载
                    </button>
                  </template>

                </div>
                <p
                  v-if="engine.id === 'ffmpeg' && ffmpeg?.error"
                  class="engine-error"
                  role="alert"
                >
                  {{ ffmpeg.error }}
                </p>
                <p
                  v-else-if="engine.id === 'libreoffice' && libreOffice?.error"
                  class="engine-error"
                  role="alert"
                >
                  {{ libreOffice.error }}
                </p>

              </article>
            </div>
            <div class="settings-row settings-row-last">
              <span class="settings-label">第三方许可</span>
              <button
                type="button"
                class="settings-button primary"
                @click="emit('command', { type: 'settings-open-licenses' })"
              >
                查看
              </button>
            </div>
          </template>

          <template v-else-if="section === 'mail'">
            <MailSettings
              :mail="state?.mail"
              @command="emit('command', $event)"
            />
          </template>

          <template v-else-if="section === 'music'">
            <h3 class="settings-group-title">控制栏样式</h3>
            <div class="bar-styles" role="radiogroup" aria-label="控制栏样式">
              <button
                v-for="style in musicBarStyles"
                :key="style"
                type="button"
                class="bar-style"
                :class="{ active: settings.musicBarStyle === style }"
                role="radio"
                :aria-checked="settings.musicBarStyle === style"
                @click="update({ musicBarStyle: style })"
              >
                <MusicBarPreview :variant="style" />
                <span class="bar-style-name">{{
                  musicBarStyleLabels[style]
                }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="section === 'ai'">
            <div class="settings-row">
              <span class="settings-label">DeepSeek Key</span>
              <span class="settings-value">{{
                configured ? '已配置' : '未配置'
              }}</span>
            </div>
            <div v-if="!configured || editingKey" class="settings-field">
              <input
                v-model="apiKey"
                type="password"
                autocomplete="off"
                aria-label="DeepSeek API Key"
                placeholder="API Key"
                @keydown.enter="saveKey"
              />
              <button
                type="button"
                class="settings-button primary"
                :disabled="!apiKey.trim()"
                @click="saveKey"
              >
                保存
              </button>
              <button
                v-if="editingKey"
                type="button"
                class="settings-button"
                @click="
                  editingKey = false;
                  apiKey = '';
                "
              >
                取消
              </button>
            </div>
            <div v-else class="settings-field settings-field-end">
              <button
                type="button"
                class="settings-button primary"
                @click="editingKey = true"
              >
                替换
              </button>
              <button
                type="button"
                class="settings-button danger"
                @click="emit('command', { type: 'ai-clear' })"
              >
                删除
              </button>
            </div>

            <h3 class="settings-group-title">AI 额度</h3>
            <div class="settings-row">
              <span id="setting-ai-quota" class="settings-label"
                >显示额度药丸</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-ai-quota"
                :aria-checked="settings.aiQuotaEnabled"
                @click="toggle('aiQuotaEnabled')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">刷新间隔</span>
              <SegmentedControl
                :model-value="settings.aiQuotaRefreshMinutes"
                :options="aiQuotaRefreshOptions"
                aria-label="AI 额度刷新间隔"
                @update="
                  value => update({ aiQuotaRefreshMinutes: value as number })
                "
              />
            </div>
            <div class="settings-row">
              <span class="settings-label">OpenAI</span>
              <span class="settings-value">{{ openAiQuotaLabel }}</span>
            </div>
            <div class="settings-field settings-field-end">
              <button
                type="button"
                class="settings-button"
                @click="emit('command', { type: 'ai-quota-choose-openai' })"
              >
                选择登录
              </button>
              <button
                type="button"
                class="settings-button"
                @click="
                  emit('command', {
                    type: 'ai-quota-config',
                    patch: { openaiPath: '' },
                  })
                "
              >
                自动检测
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">DeepSeek 余额</span>
              <span class="settings-value">{{ deepSeekQuotaLabel }}</span>
            </div>
            <div class="settings-row">
              <span class="settings-label">立即刷新</span>
              <button
                type="button"
                class="settings-button"
                @click="emit('command', { type: 'ai-quota-refresh' })"
              >
                刷新
              </button>
            </div>
          </template>

          <template v-else>
            <div class="settings-row">
              <span class="settings-label">版本</span>
              <span class="settings-value"
                >v{{ state?.runtime.version ?? '0.0.1' }}</span
              >
            </div>
            <div class="settings-row">
              <span class="settings-label">第三方许可</span>
              <button
                type="button"
                class="settings-button primary"
                @click="emit('command', { type: 'settings-open-licenses' })"
              >
                打开
              </button>
            </div>
          </template>

          <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.settings-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}
.settings-nav {
  flex: none;
  width: 148px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 12px;
  border-right: 1px solid var(--color-line);
}
.settings-nav button {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  text-align: left;
  transition:
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}
.settings-nav button:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.settings-nav button.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font-weight: 600;
}
.settings-nav button:focus-visible,
.settings-switch:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.settings-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding-right: 4px;
}
.engine-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.settings-button.engine-check {
  min-height: 26px;
  padding: 0 10px;
}
.engine-section-head .engine-section-title {
  margin: 0;
}
.engine-section-title {
  margin: 0 0 10px;
  font-size: var(--font-size-body);
  font-weight: 600;
}
.engine-section-title.spaced {
  margin-top: 24px;
}
.engine-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.engine-card {
  padding: 14px 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  transition: border-color var(--motion-fast) var(--ease-standard);
}
.engine-card.installed {
  border-color: color-mix(
    in srgb,
    var(--color-success) 36%,
    var(--color-line)
  );
}
.engine-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.engine-card-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: var(--font-size-body);
  font-weight: 600;
}
.engine-version {
  color: var(--color-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.engine-role {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 500;
}
.engine-card-desc {
  margin: 8px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.55;
}
.engine-card-line {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: 10px;
  line-height: 1.5;
}
.engine-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.engine-progress {
  flex: 1;
  height: 6px;
  min-width: 80px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-fill-secondary);
}
.engine-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-brand-ink);
  transition: width var(--motion-fast) var(--ease-standard);
}
.engine-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
.engine-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}
.engine-status.installed {
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
}
.engine-status.downloading {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.engine-status.error {
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  border-bottom: 1px solid var(--color-line);
}
.settings-row-last {
  border-bottom: 0;
}
.settings-content > .settings-row:last-child {
  border-bottom: 0;
}
.wheel-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 8px 0 18px;
}
.wheel-setting {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.wheel-setting-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 40px;
}
.wheel-setting-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 160px));
  gap: 16px;
}
.pet-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  text-align: left;
}
.pet-cover {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard);
}
.pet-cover img {
  width: 82%;
  height: 82%;
  object-fit: contain;
}
.pet-card:hover .pet-cover {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}
.pet-card:focus-visible .pet-cover {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.pet-card-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-label);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .pet-cover {
    transition: none;
  }
}
.settings-label-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.settings-label {
  font-size: var(--font-size-body);
}
.settings-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.settings-path {
  max-width: 65%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}
.settings-switch {
  position: relative;
  flex: none;
  width: 42px;
  height: 25px;
  min-height: 25px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
  transition:
    background-color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out);
}
.settings-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.settings-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 19px;
  height: 19px;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition: transform var(--motion-fast) var(--ease-out);
}
.settings-switch[aria-checked='true'] .settings-switch-thumb {
  transform: translateX(17px);
}
.settings-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-line);
}
.settings-field-end {
  justify-content: flex-end;
}
.settings-field input {
  flex: 1;
  min-width: 0;
  height: var(--tap-min);
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.settings-field input:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.settings-group-title {
  margin: 2px 0 10px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.bar-styles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bar-style {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  text-align: center;
}
.bar-style.active {
  border-color: var(--color-brand-ink);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.bar-style-name {
  text-align: center;
  font-size: var(--font-size-label);
}
@media (prefers-reduced-motion: reduce) {
  .bar-style {
    transition: none;
  }
}
.settings-error {
  margin: 12px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .settings-nav button,
  .settings-switch,
  .settings-switch-thumb {
    transition: none;
  }
}
</style>
