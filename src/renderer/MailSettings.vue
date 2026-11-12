<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  FolderOpen,
  KeyRound,
  RefreshCw,
  Trash2,
} from '@lucide/vue'
import type { Command } from '../shared/protocol'
import type {
  MailAccount,
  MailConfig,
  MailProvider,
  MailState,
} from '../shared/mail'
import {
  mailProviderLabels,
  mailRetentionOptions,
  mailSyncOptions,
} from '../shared/mail'
import qqIcon from './assets/mail/qq.svg'
import mail163Icon from './assets/mail/163.svg'
import gmailIcon from './assets/mail/gmail.svg'

const props = defineProps<{ mail?: MailState }>()
const emit = defineEmits<{ command: [command: Command] }>()

const fallbackConfig: MailConfig = {
  syncMinutes: 15,
  notify: true,
  unreadBadge: true,
  attachmentDir: '',
  retentionDays: 90,
}
const config = computed<MailConfig>(() => props.mail?.config ?? fallbackConfig)
const accounts = computed(() => props.mail?.accounts ?? [])
const busy = computed(() => Boolean(props.mail?.busy))

const providerOptions: Array<{
  id: MailProvider
  label: string
  icon: string
}> = [
  { id: 'qq', label: mailProviderLabels.qq, icon: qqIcon },
  { id: '163', label: mailProviderLabels['163'], icon: mail163Icon },
  { id: 'gmail', label: mailProviderLabels.gmail, icon: gmailIcon },
]
function providerIcon(provider: MailProvider): string {
  return providerOptions.find((item) => item.id === provider)?.icon ?? qqIcon
}

const formOpen = ref(false)
const formProvider = ref<MailProvider>('qq')
const formEmail = ref('')
const formSecret = ref('')
const formName = ref('')
const reauthorizeId = ref<string>()
const formError = ref('')
const wasBusy = ref(false)

function resetForm(): void {
  formProvider.value = 'qq'
  formEmail.value = ''
  formSecret.value = ''
  formName.value = ''
  reauthorizeId.value = undefined
  formError.value = ''
}
function openAdd(): void {
  resetForm()
  formOpen.value = true
}
function openReauthorize(account: MailAccount): void {
  resetForm()
  reauthorizeId.value = account.id
  formProvider.value = account.provider
  formEmail.value = account.email
  formName.value = account.displayName ?? ''
  formOpen.value = true
}
function closeForm(): void {
  formOpen.value = false
  formSecret.value = ''
  formName.value = ''
  formError.value = ''
  reauthorizeId.value = undefined
}
function submit(): void {
  formError.value = ''
  if (!formEmail.value.trim() || !formSecret.value) {
    formError.value = '请填写邮箱地址和授权码。'
    return
  }
  const secret = formSecret.value.replace(/\s+/g, '')
  if (reauthorizeId.value) {
    emit('command', {
      type: 'mail-reauthorize',
      accountId: reauthorizeId.value,
      secret,
    })
    return
  }
  emit('command', {
    type: 'mail-add-account',
    provider: formProvider.value,
    email: formEmail.value.trim(),
    secret,
    ...(formName.value.trim() ? { displayName: formName.value.trim() } : {}),
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
function chooseAttachmentDir(): void {
  emit('command', { type: 'mail-choose-attachment-dir' })
}
function openAttachmentDir(): void {
  emit('command', { type: 'mail-open-attachment-dir' })
}
function statusLabel(account: MailAccount): string {
  if (account.status === 'error') return '需授权'
  return '正常'
}
function syncOptions(): Array<{ value: number; label: string }> {
  return mailSyncOptions.map((value) => ({
    value,
    label: value === 0 ? '手动' : `${value} 分钟`,
  }))
}
function retentionOptions(): Array<{ value: number; label: string }> {
  return mailRetentionOptions.map((value) => ({
    value,
    label: value === 0 ? '永久' : `${value} 天`,
  }))
}
function onSyncChange(event: Event): void {
  updateConfig({ syncMinutes: Number((event.target as HTMLSelectElement).value) })
}
function onRetentionChange(event: Event): void {
  updateConfig({
    retentionDays: Number((event.target as HTMLSelectElement).value),
  })
}

watch(
  () => props.mail?.busy,
  (value) => {
    if (wasBusy.value && !value && formOpen.value && !props.mail?.error)
      closeForm()
    wasBusy.value = Boolean(value)
  },
)
</script>

<template>
  <div class="mail-settings">
    <div class="mail-row">
      <span class="mail-label">邮箱账户</span>
      <button
        type="button"
        class="mail-action"
        :disabled="busy"
        @click="formOpen ? closeForm() : openAdd()"
      >
        {{ formOpen ? '取消' : '添加' }}
      </button>
    </div>

    <div v-if="accounts.length" class="mail-accounts">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="mail-account"
        :title="account.error"
      >
        <img
          class="mail-account-icon"
          :src="providerIcon(account.provider)"
          alt=""
          draggable="false"
        />
        <span class="mail-account-email">{{ account.email }}</span>
        <span class="mail-status" :class="account.status">
          {{ statusLabel(account) }}
        </span>
        <span v-if="account.unread" class="mail-unread">
          {{ account.unread }}
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
          <KeyRound :size="14" :stroke-width="2" aria-hidden="true" />
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
      <div class="mail-provider-row" role="group" aria-label="邮箱服务商">
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
          <img :src="provider.icon" alt="" draggable="false" />
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
          placeholder="name@example.com"
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
          maxlength="40"
          :disabled="busy"
          placeholder="可选"
        />
      </label>
      <p v-if="formError || mail?.error" class="mail-error" role="alert">
        {{ formError || mail?.error }}
      </p>
      <div class="mail-form-actions">
        <button
          type="button"
          class="mail-action"
          :disabled="busy"
          @click="closeForm"
        >
          取消
        </button>
        <button
          type="submit"
          class="mail-submit"
          :disabled="busy"
        >
          {{ reauthorizeId ? '重新授权' : '测试并添加' }}
        </button>
      </div>
    </form>

    <div class="mail-row">
      <span class="mail-label">同步间隔</span>
      <select
        class="mail-select"
        :value="config.syncMinutes"
        :disabled="busy"
        @change="onSyncChange"
      >
        <option
          v-for="option in syncOptions()"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
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
      <button
        type="button"
        class="mail-icon-action"
        aria-label="打开附件保存目录"
        title="打开目录"
        @click="openAttachmentDir"
      >
        <FolderOpen :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
      <button type="button" class="mail-action" @click="chooseAttachmentDir">
        选择
      </button>
    </div>
    <div class="mail-row mail-row-last">
      <span class="mail-label">缓存保留</span>
      <select
        class="mail-select"
        :value="config.retentionDays"
        :disabled="busy"
        @change="onRetentionChange"
      >
        <option
          v-for="option in retentionOptions()"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
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
.mail-label {
  flex: none;
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.mail-action {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  cursor: pointer;
}
.mail-action:hover:not(:disabled) {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.mail-action:focus-visible,
.mail-submit:focus-visible,
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
  padding: 10px 0;
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
.mail-account-icon {
  width: 24px;
  height: 24px;
  flex: none;
  object-fit: contain;
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
.mail-status.error {
  color: var(--color-danger);
}
.mail-unread {
  flex: none;
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
  text-align: center;
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
  padding: 12px 0 14px;
}
.mail-provider-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.mail-provider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-caption);
  cursor: pointer;
}
.mail-provider img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.mail-provider.active {
  border-color: var(--color-brand-ink);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-provider:disabled {
  cursor: default;
  opacity: 0.7;
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
.mail-field input:focus-visible,
.mail-select:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.mail-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.mail-submit {
  min-height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  cursor: pointer;
}
.mail-submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.mail-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-caption);
}
.mail-select {
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
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
