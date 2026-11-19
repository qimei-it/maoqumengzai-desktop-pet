<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ExternalLink,
  Info,
  PenLine,
  RefreshCw,
  Trash2,
} from '@lucide/vue'
import type { Command } from '../shared/protocol'
import type {
  MailAccount,
  MailConfig,
  MailProvider,
  MailProxyMode,
  MailState,
} from '../shared/mail'
import {
  mailAccountLabel,
  mailDisplayNameError,
  mailDisplayNameLimit,
  mailProviderLabels,
  mailProxyModeLabels,
  mailProxyModes,
  mailProxyUrlError,
  normalizeMailSecret,
  mailRetentionOptions,
  mailSyncOptions,
} from '../shared/mail'
import SelectField from './SelectField.vue'
import MailProviderIcon from './MailProviderIcon.vue'
import { pushToast } from './toasts'

const props = defineProps<{ mail?: MailState }>()
const emit = defineEmits<{ command: [command: Command] }>()

const fallbackConfig: MailConfig = {
  syncMinutes: 15,
  notify: true,
  unreadBadge: true,
  attachmentDir: '',
  retentionDays: 90,
  proxyMode: 'auto',
  proxyUrl: '',
}
const config = computed<MailConfig>(() => props.mail?.config ?? fallbackConfig)
const accounts = computed(() => props.mail?.accounts ?? [])
const busy = computed(() => Boolean(props.mail?.busy))
const cacheBytes = computed(() => props.mail?.cacheBytes ?? 0)
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3)
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2)
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

const providerOptions: Array<{
  id: MailProvider
  label: string
}> = [
  { id: 'qq', label: mailProviderLabels.qq },
  { id: '163', label: mailProviderLabels['163'] },
  { id: 'gmail', label: mailProviderLabels.gmail },
]
const proxyDescription =
  'Gmail 在中国大陆通常需要代理才能收发；「自动」会读取系统代理，「手动」可填写代理地址。'
const proxyModeOptions = mailProxyModes.map((mode) => ({
  value: mode,
  label: mailProxyModeLabels[mode],
}))
const proxyUrlDraft = ref('')
const proxyEditing = ref(false)
const proxyInput = ref<HTMLInputElement | null>(null)
watch(
  () => props.mail?.config.proxyUrl ?? '',
  (value) => {
    if (!proxyEditing.value) proxyUrlDraft.value = value
  },
  { immediate: true },
)
watch(
  () => config.value.proxyMode,
  (mode) => {
    if (mode === 'manual') return
    proxyEditing.value = false
    proxyUrlDraft.value = config.value.proxyUrl
  },
)

const formOpen = ref(false)
const formProvider = ref<MailProvider>('qq')
const providerIndex = computed(() =>
  Math.max(
    0,
    providerOptions.findIndex((item) => item.id === formProvider.value),
  ),
)
const emailPlaceholders: Record<MailProvider, string> = {
  qq: 'name@qq.com',
  '163': 'name@126.com 或 name@163.com',
  gmail: 'name@gmail.com',
}
const emailPlaceholder = computed(
  () => emailPlaceholders[formProvider.value],
)
const formEmail = ref('')
const formSecret = ref('')
const formName = ref('')
const reauthorizeId = ref<string>()
const wasBusy = ref(false)
let lastMailError = ''

function resetForm(): void {
  formProvider.value = 'qq'
  formEmail.value = ''
  formSecret.value = ''
  formName.value = ''
  reauthorizeId.value = undefined
}
function openAdd(): void {
  resetForm()
  formOpen.value = true
}
// Defer until every form ref exists: immediate registration before resetForm's
// refs used to throw "Cannot access 'formEmail' before initialization".
watch(
  () => [Boolean(props.mail), props.mail?.accounts.length ?? 0] as const,
  ([loaded, count]) => {
    if (loaded && count === 0 && !formOpen.value) openAdd()
  },
  { immediate: true },
)
async function openReauthorize(account: MailAccount): Promise<void> {
  const result = await window.mqmz?.mailSecret(account.id)
  resetForm()
  reauthorizeId.value = account.id
  formProvider.value = account.provider
  formEmail.value = account.email
  formName.value = account.displayName ?? ''
  if (result?.ok) formSecret.value = result.value
  else if (result) pushToast(result.error, 'error')
  formOpen.value = true
}
function closeForm(): void {
  formOpen.value = false
  formSecret.value = ''
  formName.value = ''
  reauthorizeId.value = undefined
}
function submit(): void {
  if (!formEmail.value.trim() || !formSecret.value) {
    pushToast('请填写邮箱地址和授权码。', 'error')
    return
  }
  const nameError = mailDisplayNameError(formName.value)
  if (nameError) {
    pushToast(nameError, 'error')
    return
  }
  const secret = normalizeMailSecret(formSecret.value)
  const displayName = formName.value.trim()
  if (reauthorizeId.value) {
    emit('command', {
      type: 'mail-reauthorize',
      accountId: reauthorizeId.value,
      secret,
      displayName,
    })
    return
  }
  emit('command', {
    type: 'mail-add-account',
    provider: formProvider.value,
    email: formEmail.value.trim(),
    secret,
    ...(displayName ? { displayName } : {}),
  })
}
function openMailHelp(target: 'client' | 'app-password' = 'client'): void {
  emit('command', {
    type: 'mail-help',
    provider: formProvider.value,
    target,
  })
}
function syncAccount(accountId: string): void {
  emit('command', { type: 'mail-sync', accountId })
}
function removeAccount(accountId: string): void {
  emit('command', { type: 'mail-remove-account', accountId })
}
function updateConfig(patch: Partial<MailConfig>): void {
  emit('command', { type: 'mail-update-config', patch })
}
function onProxyModeChange(event: Event): void {
  const mode = (event.target as HTMLSelectElement).value as MailProxyMode
  if (!mailProxyModes.includes(mode)) return
  updateConfig({ proxyMode: mode })
}
function startProxyEdit(): void {
  proxyUrlDraft.value = config.value.proxyUrl
  proxyEditing.value = true
  void nextTick(() => {
    proxyInput.value?.focus()
    proxyInput.value?.select()
  })
}
function saveProxyUrl(): void {
  const value = proxyUrlDraft.value.trim()
  if (!value) {
    pushToast('请填写代理地址。', 'error')
    return
  }
  const error = mailProxyUrlError(value)
  if (error) {
    pushToast(error, 'error')
    return
  }
  proxyUrlDraft.value = value
  proxyEditing.value = false
  if (value !== config.value.proxyUrl) updateConfig({ proxyUrl: value })
}
function toggleProxyEdit(): void {
  if (proxyEditing.value) saveProxyUrl()
  else startProxyEdit()
}
function submitProxyOnEnter(): void {
  if (proxyEditing.value) saveProxyUrl()
}
function chooseAttachmentDir(): void {
  emit('command', { type: 'mail-choose-attachment-dir' })
}
function openAttachmentDir(): void {
  emit('command', { type: 'mail-open-attachment-dir' })
}
function clearCache(): void {
  emit('command', { type: 'mail-clear-cache' })
}
function statusLabel(account: MailAccount): string {
  if (account.status === 'error') return '需授权'
  return '正常'
}
function syncOptions(): Array<{ value: number; label: string }> {
  return mailSyncOptions.map((value) => ({
    value,
    label: `${value} 分钟`,
  }))
}
function retentionOptions(): Array<{ value: number; label: string }> {
  return mailRetentionOptions.map((value) => ({
    value,
    label: value === 0 ? '永久' : `${value} 天`,
  }))
}
function onSyncChange(event: Event): void {
  updateConfig({
    syncMinutes: Number((event.target as HTMLSelectElement).value),
  })
}
function onRetentionChange(event: Event): void {
  updateConfig({
    retentionDays: Number((event.target as HTMLSelectElement).value),
  })
}

watch(formName, (value) => {
  const chars = Array.from(value)
  if (chars.length > mailDisplayNameLimit)
    formName.value = chars.slice(0, mailDisplayNameLimit).join('')
})
watch(formSecret, (value) => {
  const normalized = normalizeMailSecret(value)
  if (normalized !== value) formSecret.value = normalized
})
watch(
  () => props.mail?.error,
  (value) => {
    if (value && value !== lastMailError) pushToast(value, 'error')
    lastMailError = value ?? ''
  },
)
watch(
  () => props.mail?.busy,
  (value) => {
    if (wasBusy.value && !value && formOpen.value && !props.mail?.error) {
      closeForm()
    }
    wasBusy.value = Boolean(value)
  },
)
</script>

<template>
  <div class="mail-settings">
    <div class="mail-account-block">
      <div
        class="mail-row mail-account-head"
        :class="{ compact: formOpen }"
      >
        <span class="mail-label">邮箱账户</span>
        <button
          v-if="!formOpen"
          type="button"
          class="settings-button primary"
          :disabled="busy"
          @click="openAdd"
        >
          添加
        </button>
      </div>

      <div v-if="accounts.length && !formOpen" class="mail-accounts">
        <div
          v-for="account in accounts"
          :key="account.id"
          class="mail-account"
          :title="account.error"
        >
          <MailProviderIcon :provider="account.provider" />
          <span class="mail-account-email" :title="mailAccountLabel(account)">
            {{ mailAccountLabel(account) }}
          </span>
          <span
          class="mail-status"
          :class="{ 'is-error': account.status === 'error' }"
        >
            {{ statusLabel(account) }}
          </span>
          <button
            type="button"
            class="mail-icon-action"
            :disabled="busy"
            aria-label="同步邮件"
            title="同步"
            @click="syncAccount(account.id)"
          >
            <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="mail-icon-action"
            :disabled="busy"
            aria-label="重新授权"
            title="重新授权"
            @click="openReauthorize(account)"
          >
            <PenLine :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="mail-icon-action"
            :disabled="busy"
            aria-label="删除邮箱账户"
            title="删除"
            @click="removeAccount(account.id)"
          >
            <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>

      <form v-if="formOpen" class="mail-form" @submit.prevent="submit">
        <div
          v-if="!reauthorizeId"
          class="mail-provider-track"
          role="radiogroup"
          aria-label="邮箱服务商"
        >
          <span
            class="mail-provider-thumb"
            :style="{ transform: `translateX(${providerIndex * 100}%)` }"
          />
          <button
            v-for="provider in providerOptions"
            :key="provider.id"
            type="button"
            class="mail-provider"
            :class="{ active: formProvider === provider.id }"
            :disabled="Boolean(reauthorizeId) || busy"
            :aria-pressed="formProvider === provider.id"
            @click="formProvider = provider.id"
          >
            <MailProviderIcon :provider="provider.id" />
            {{ provider.label }}
          </button>
        </div>
        <label class="mail-field">
          <span>邮箱地址</span>
          <input
            v-model="formEmail"
            type="email"
            autocomplete="username"
            :disabled="Boolean(reauthorizeId) || busy"
            :placeholder="emailPlaceholder"
          />
        </label>
        <label class="mail-field">
          <span>授权码 / 应用专用密码</span>
          <input
            v-model="formSecret"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            placeholder="输入授权码"
          />
        </label>
        <label class="mail-field">
          <span>显示名称</span>
          <input
            v-model="formName"
            type="text"
            maxlength="80"
            :disabled="busy"
            placeholder="可选"
          />
        </label>
        <div class="mail-form-actions">
          <div class="mail-help-links">
            <button
              type="button"
              class="mail-help-link"
              @click="openMailHelp()"
            >
              邮件客户端设置方式
              <ExternalLink :size="12" :stroke-width="2" aria-hidden="true" />
            </button>
            <button
              v-if="formProvider === 'gmail'"
              type="button"
              class="mail-help-link"
              @click="openMailHelp('app-password')"
            >
              获取应用专用密码
              <ExternalLink :size="12" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            class="settings-button"
            :disabled="busy"
            @click="closeForm"
          >
            取消
          </button>
          <button
            type="submit"
            class="settings-button primary"
            :disabled="busy"
          >
            {{ reauthorizeId ? '保存' : '测试并添加' }}
          </button>
        </div>
      </form>
    </div>

    <div class="mail-row">
      <span class="mail-label-icon">
        <span class="mail-label">Gmail 代理</span>
        <span class="mail-info" tabindex="0" :aria-label="proxyDescription">
          <Info :size="14" :stroke-width="2" aria-hidden="true" />
          <span class="mail-tooltip" role="tooltip">{{ proxyDescription }}</span>
        </span>
      </span>
      <SelectField
        :value="config.proxyMode"
        :disabled="busy"
        min-width="120px"
        @change="onProxyModeChange"
      >
        <option
          v-for="option in proxyModeOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </SelectField>
    </div>
    <div v-if="config.proxyMode === 'manual'" class="mail-row">
      <span class="mail-label">代理地址</span>
      <input
        ref="proxyInput"
        v-model="proxyUrlDraft"
        class="mail-proxy-input"
        type="text"
        inputmode="url"
        spellcheck="false"
        placeholder="http://127.0.0.1:7890"
        :disabled="busy"
        :readonly="!proxyEditing"
        @keydown.enter.prevent="submitProxyOnEnter"
      />
      <button
        type="button"
        class="settings-button"
        :class="{ primary: proxyEditing }"
        :disabled="busy"
        @click="toggleProxyEdit"
      >
        {{ proxyEditing ? '保存' : '编辑' }}
      </button>
    </div>

    <div class="mail-row">
      <span class="mail-label">同步间隔</span>
      <SelectField
        :value="config.syncMinutes"
        :disabled="busy"
        min-width="96px"
        @change="onSyncChange"
      >
        <option
          v-for="option in syncOptions()"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </SelectField>
    </div>
    <div class="mail-row">
      <span class="mail-label">新邮件通知</span>
      <button
        type="button"
        class="mail-switch"
        :class="{ active: config.notify }"
        :aria-pressed="config.notify"
        @click="updateConfig({ notify: !config.notify })"
      >
        <span />
      </button>
    </div>
    <div class="mail-row">
      <span class="mail-label">未读角标</span>
      <button
        type="button"
        class="mail-switch"
        :class="{ active: config.unreadBadge }"
        :aria-pressed="config.unreadBadge"
        @click="updateConfig({ unreadBadge: !config.unreadBadge })"
      >
        <span />
      </button>
    </div>
    <div class="mail-row">
      <span class="mail-label">附件保存目录</span>
      <span class="mail-path" :title="config.attachmentDir">
        {{ config.attachmentDir }}
      </span>
      <button type="button" class="settings-button" @click="chooseAttachmentDir">
        选择
      </button>
      <button type="button" class="settings-button primary" @click="openAttachmentDir">
        打开
      </button>
    </div>
    <div class="mail-row">
      <span class="mail-label">附件缓存</span>
      <span class="mail-path">{{ formatBytes(cacheBytes) }}</span>
      <button
        type="button"
        class="settings-button danger"
        :disabled="busy || cacheBytes === 0"
        @click="clearCache"
      >
        清理
      </button>
    </div>
    <div class="mail-row mail-row-last">
      <span class="mail-label">缓存保留</span>
      <SelectField
        :value="config.retentionDays"
        :disabled="busy"
        min-width="96px"
        @change="onRetentionChange"
      >
        <option
          v-for="option in retentionOptions()"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </SelectField>
    </div>
  </div>
</template>

<style scoped>
.mail-settings {
  display: flex;
  flex-direction: column;
}
.mail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
  border-bottom: 1px solid var(--color-line);
}
.mail-row-last {
  border-bottom: 0;
}
.mail-account-block {
  border-bottom: 1px solid var(--color-line);
}
.mail-account-head {
  border-bottom: 0;
}
.mail-account-head.compact {
  min-height: 0;
}
.mail-label {
  flex: none;
  color: var(--color-ink);
  font-size: var(--font-size-body);
}
.mail-label-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.mail-info {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--color-ink);
  cursor: help;
}
.mail-info:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-pill);
}
.mail-tooltip {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: max-content;
  max-width: min(260px, 70vw);
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: var(--font-size-caption);
  font-weight: 400;
  line-height: 1.5;
  pointer-events: none;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.mail-info:hover .mail-tooltip,
.mail-info:focus-visible .mail-tooltip {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .mail-tooltip {
    transition: none;
  }
}
.mail-icon-action:focus-visible,
.mail-provider:focus-visible,
.mail-switch:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.mail-accounts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 0 10px;
}
.mail-account {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 48px;
  padding: 7px 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.mail-account-email {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-label);
}
.mail-status {
  flex: none;
  color: var(--color-success);
  font-size: var(--font-size-caption);
}
.mail-status.is-error {
  color: var(--color-danger);
}
.mail-icon-action {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}
.mail-icon-action:hover:not(:disabled) {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.mail-icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.mail-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0 14px;
}
.mail-provider-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 3px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.mail-provider-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / 3);
  border-radius: calc(var(--radius-control) - 2px);
  background: var(--color-surface);
  box-shadow: 0 1px 3px rgb(39 32 28 / 8%);
  transition: transform var(--motion-slow) var(--ease-out);
}
.mail-provider {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: calc(var(--radius-control) - 2px);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  cursor: pointer;
}
.mail-provider.active {
  color: var(--color-brand-ink);
}
.mail-provider:disabled {
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .mail-provider-thumb {
    transition: none;
  }
}
.mail-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.mail-field span {
  flex: none;
  width: 140px;
}
.mail-field input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
}
.mail-field input:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.mail-proxy-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.mail-proxy-input:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.mail-proxy-input[readonly] {
  background: var(--color-surface-muted);
}
.mail-form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.mail-help-links {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-right: auto;
}
.mail-help-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
  cursor: pointer;
}
.mail-help-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.mail-help-link:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
.mail-switch {
  position: relative;
  flex: none;
  width: 36px;
  min-width: 36px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out);
}
.mail-switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: var(--mqmz-panel-shadow);
  transition: transform var(--motion-fast) var(--ease-out);
}
.mail-switch.active {
  border-color: var(--color-brand-ink);
  background: var(--color-brand-ink);
}
.mail-switch.active span {
  transform: translateX(14px);
}
.mail-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-align: right;
}
</style>
