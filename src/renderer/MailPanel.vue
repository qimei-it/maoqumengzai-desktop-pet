<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  LoaderCircle,
  Mail,
  MailPlus,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  X,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  mailAccountLabel,
  type MailAttachmentPick,
  type MailMessageSummary,
} from '../shared/mail'
import PanelHeader from './PanelHeader.vue'
import { pushToast } from './toasts'
import qqIcon from './assets/mail/qq.svg'
import mail163Icon from './assets/mail/163.svg'
import gmailIcon from './assets/mail/gmail.svg'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()
const panel = computed(() => props.state?.mailPanel)
const accounts = computed(() => props.state?.mail.accounts ?? [])
const selected = computed(() => panel.value?.selected)
const attachmentTotal = computed(() =>
  (selected.value?.attachments ?? []).reduce(
    (total, attachment) => total + attachment.size,
    0,
  ),
)
const messages = computed(() => panel.value?.messages ?? [])
const loadingMore = computed(
  () => panel.value?.loadingKind === 'more',
)
const loadingText = computed(() =>
  panel.value?.loadingKind === 'sync'
    ? '正在同步邮件…'
    : loadingMore.value
      ? '正在加载更早邮件…'
      : '正在读取邮件…',
)
const readerLoading = computed(
  () => Boolean(panel.value?.loading) && !loadingMore.value,
)
const accountId = computed(() => panel.value?.accountId)
const account = computed(() =>
  accounts.value.find((item) => item.id === accountId.value),
)
const composeOpen = ref(false)
const composeTo = ref('')
const composeCc = ref('')
const composeSubject = ref('')
const composeBody = ref('')
const composeAttachments = ref<MailAttachmentPick[]>([])
const sending = computed(() => Boolean(panel.value?.sending))
const now = ref(Date.now())
let codeTimer: ReturnType<typeof setInterval> | undefined
const codeExpired = computed(() => {
  const detail = selected.value
  if (!detail?.code) return false
  if (detail.codeSuperseded) return true
  return Boolean(
    detail.codeExpiresAt && detail.codeExpiresAt <= now.value,
  )
})
const codeNote = computed(() => {
  const detail = selected.value
  if (!detail?.code) return ''
  if (detail.codeSuperseded) return '已被新验证码替代'
  if (codeExpired.value) return '验证码已过期'
  if (detail.codeExpiresAt)
    return `有效期至 ${formatDate(detail.codeExpiresAt)}`
  return ''
})
const icons = { qq: qqIcon, '163': mail163Icon, gmail: gmailIcon }
function providerIcon(provider: string): string {
  return icons[provider as keyof typeof icons] ?? qqIcon
}
function formatDate(value?: number): string {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
function selectAccount(id: string): void {
  emit('command', { type: 'mail-open', accountId: id })
}
function selectMessage(message: MailMessageSummary): void {
  emit('command', { type: 'mail-select', uid: message.uid })
}
function refresh(): void {
  emit('command', { type: 'mail-refresh' })
}
function onSearch(event: Event): void {
  emit('command', {
    type: 'mail-search',
    query: (event.target as HTMLInputElement).value,
  })
}
function loadMore(): void {
  emit('command', { type: 'mail-load-more' })
}
function openCompose(): void {
  composeTo.value = ''
  composeCc.value = ''
  composeSubject.value = ''
  composeBody.value = ''
  composeAttachments.value = []
  composeOpen.value = true
}
function closeCompose(): void {
  if (sending.value) return
  composeOpen.value = false
  composeAttachments.value = []
}
async function chooseAttachments(): Promise<void> {
  const result = await window.mqmz?.mailChooseAttachments()
  if (!result) return
  if (!result.ok) {
    pushToast(result.error, 'error')
    return
  }
  composeAttachments.value = result.value
}
function removeAttachment(id: string): void {
  composeAttachments.value = composeAttachments.value.filter(
    (item) => item.id !== id,
  )
}
function sendCompose(): void {
  if (sending.value) return
  if (!composeTo.value.trim()) {
    pushToast('请填写收件人。', 'error')
    return
  }
  emit('command', {
    type: 'mail-send',
    to: composeTo.value.trim(),
    ...(composeCc.value.trim() ? { cc: composeCc.value.trim() } : {}),
    subject: composeSubject.value,
    body: composeBody.value,
    attachmentIds: composeAttachments.value.map((item) => item.id),
  })
}
function toggleUnread(): void {
  const message = selected.value
  if (!message) return
  emit('command', {
    type: 'mail-set-unread',
    uid: message.uid,
    unread: !message.unread,
  })
}
function openMailSettings(): void {
  emit('command', { type: 'settings-section', section: 'mail' })
}
function saveAttachment(part: string, open: boolean): void {
  const uid = selected.value?.uid
  if (!uid) return
  emit('command', {
    type: 'mail-save-attachment',
    uid,
    part,
    open,
  })
}
async function copyCode(): Promise<void> {
  if (!selected.value?.code || codeExpired.value) return
  try {
    await navigator.clipboard.writeText(selected.value.code)
    pushToast('验证码已复制', 'success')
  } catch {
    pushToast('复制验证码失败', 'error')
  }
}
function size(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
watch(
  () => selected.value?.codeExpiresAt,
  (value) => {
    if (codeTimer) clearInterval(codeTimer)
    codeTimer = undefined
    if (!value) return
    now.value = Date.now()
    codeTimer = setInterval(() => {
      now.value = Date.now()
    }, 30_000)
  },
  { immediate: true },
)
onUnmounted(() => {
  if (codeTimer) clearInterval(codeTimer)
})
watch(
  () => panel.value?.error,
  (value) => {
    if (value) pushToast(value, 'error')
  },
)
watch(
  () => panel.value?.noticeId,
  (value, previous) => {
    if (!value || value === previous) return
    const notice = panel.value?.notice
    if (!notice) return
    pushToast(notice, 'success')
    if (notice.startsWith('邮件已发送')) {
      composeOpen.value = false
      composeAttachments.value = []
    }
  },
)
</script>

<template>
  <main class="mail-shell" @keydown.esc="emit('command', { type: 'mail-close' })">
    <section class="mail-surface" aria-label="邮件">
      <PanelHeader
        title="邮件"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'mail-close' })"
      />
      <div class="mail-body">
        <aside class="mail-accounts" aria-label="邮箱账户">
          <div class="mail-accounts-head">
            <span>邮箱账户</span>
            <button
              type="button"
              class="mail-account-add"
              aria-label="添加邮箱账户"
              title="添加邮箱账户"
              @click="openMailSettings"
            >
              <MailPlus :size="15" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <button
            v-for="item in accounts"
            :key="item.id"
            type="button"
            class="mail-account"
            :class="{ active: item.id === accountId }"
            @click="selectAccount(item.id)"
          >
            <img :src="providerIcon(item.provider)" alt="" draggable="false" />
            <span class="mail-account-label" :title="mailAccountLabel(item)">{{
              mailAccountLabel(item)
            }}</span>
            <span
              v-if="item.unread && (state?.mail.config.unreadBadge ?? true)"
              class="mail-unread"
              :title="`${item.unread} 封未读`"
              >{{ item.unread }}</span
            >
          </button>
          <button type="button" class="mail-refresh" @click="refresh">
            <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
            刷新
          </button>
        </aside>
        <section class="mail-list" aria-label="邮件列表">
          <label class="mail-search">
            <Search :size="14" :stroke-width="2" aria-hidden="true" />
            <input
              :value="panel?.query ?? ''"
              type="search"
              placeholder="搜索主题或发件人"
              aria-label="搜索邮件"
              @input="onSearch"
            />
          </label>
          <div v-if="panel?.error" class="mail-error" role="alert">
            <span>{{ panel.error }}</span>
            <div class="mail-error-actions">
              <button
                type="button"
                class="settings-button"
                @click="openMailSettings"
              >
                重新授权
              </button>
              <button
                type="button"
                class="settings-button primary"
                @click="refresh"
              >
                重试
              </button>
            </div>
          </div>
          <button
            v-for="message in messages"
            :key="message.uid"
            type="button"
            class="mail-message"
            :class="{ active: selected?.uid === message.uid }"
            @click="selectMessage(message)"
          >
            <span class="mail-message-top">
              <span class="mail-from">{{ message.fromName || message.fromAddress || '未知发件人' }}</span>
              <span class="mail-date">{{ formatDate(message.date) }}</span>
            </span>
            <span class="mail-subject">
              <span v-if="message.unread" class="mail-dot" />
              {{ message.subject }}
              <Paperclip v-if="message.hasAttachments" :size="12" :stroke-width="2" aria-hidden="true" />
            </span>
            <span v-if="message.snippet" class="mail-snippet">{{ message.snippet }}</span>
          </button>
          <button
            v-if="panel?.hasMore"
            type="button"
            class="settings-button mail-more"
            :disabled="panel?.loading"
            @click="loadMore"
          >
            {{ loadingMore ? '正在加载…' : '加载更多' }}
          </button>
          <div v-if="!panel?.loading && !messages.length" class="mail-empty">
            {{ panel?.query ? '没有匹配的邮件' : '暂无邮件' }}
          </div>
        </section>
        <article class="mail-reader">
          <div class="mail-reader-toolbar">
            <button
              type="button"
              class="mail-compose"
              aria-label="新建邮件"
              title="写邮件"
              :disabled="!accounts.length || sending"
              @click="openCompose"
            >
              <PenLine :size="15" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <form
            v-if="composeOpen"
            class="mail-compose-form"
            @submit.prevent="sendCompose"
          >
            <h2>新邮件</h2>
            <label class="mail-compose-field">
              <span>收件人</span>
              <input
                v-model="composeTo"
                type="text"
                autocomplete="off"
                placeholder="name@example.com"
              />
            </label>
            <label class="mail-compose-field">
              <span>抄送</span>
              <input
                v-model="composeCc"
                type="text"
                autocomplete="off"
                placeholder="可选"
              />
            </label>
            <label class="mail-compose-field">
              <span>主题</span>
              <input v-model="composeSubject" type="text" maxlength="500" />
            </label>
            <label class="mail-compose-field">
              <span>正文</span>
              <textarea v-model="composeBody" rows="9" />
            </label>
            <ul
              v-if="composeAttachments.length"
              class="mail-compose-attachments"
            >
              <li
                v-for="attachment in composeAttachments"
                :key="attachment.id"
              >
                <Paperclip :size="13" :stroke-width="2" aria-hidden="true" />
                <span>{{ attachment.name }}</span>
                <span class="mail-size">{{ size(attachment.size) }}</span>
                <button
                  type="button"
                  class="mail-compose-remove"
                  aria-label="移除附件"
                  @click="removeAttachment(attachment.id)"
                >
                  <X :size="12" :stroke-width="2" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <div class="mail-compose-actions">
              <button
                type="button"
                class="settings-button"
                :disabled="sending"
                @click="chooseAttachments"
              >
                <Paperclip :size="13" :stroke-width="2" aria-hidden="true" />
                添加附件
              </button>
              <span class="mail-compose-spacer" />
              <button
                type="button"
                class="settings-button"
                :disabled="sending"
                @click="closeCompose"
              >
                取消
              </button>
              <button
                type="submit"
                class="settings-button primary"
                :disabled="sending"
              >
                {{ sending ? '发送中…' : '发送' }}
              </button>
            </div>
          </form>
          <div v-else-if="readerLoading" class="mail-loading" role="status">
            <LoaderCircle
              :size="22"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>{{ loadingText }}</span>
          </div>
          <template v-else-if="selected">
            <header class="mail-reader-head">
              <div class="mail-reader-title">
                <h2>{{ selected.subject }}</h2>
                <button
                  type="button"
                  class="settings-button mail-read-toggle"
                  @click="toggleUnread"
                >
                  {{ selected.unread ? '标记已读' : '标记未读' }}
                </button>
              </div>
              <p>
                {{ selected.fromName || selected.fromAddress || '未知发件人' }}
                <span v-if="selected.date">{{ formatDate(selected.date) }}</span>
              </p>
            </header>
            <button
              v-if="selected.code"
              type="button"
              class="mail-code"
              :class="{ expired: codeExpired }"
              :disabled="codeExpired"
              :title="codeExpired ? codeNote : '复制验证码'"
              @click="copyCode"
            >
              {{ selected.code }}
            </button>
            <p v-if="selected.code && codeNote" class="mail-code-note">
              {{ codeNote }}
            </p>
            <div v-if="selected.bodyHtml" class="mail-content" v-html="selected.bodyHtml" />
            <pre v-else-if="selected.bodyText" class="mail-text">{{ selected.bodyText }}</pre>
            <p v-else class="mail-empty">这封邮件没有正文。</p>
            <p
              v-if="selected.attachments.length"
              class="mail-attachment-summary"
            >
              {{ selected.attachments.length }} 个附件 ·
              {{ size(attachmentTotal) }}
            </p>
            <ul v-if="selected.attachments.length" class="mail-attachments">
              <li v-for="attachment in selected.attachments" :key="attachment.part">
                <Paperclip :size="14" :stroke-width="2" aria-hidden="true" />
                <span>{{ attachment.filename }}</span>
                <span class="mail-size">{{ size(attachment.size) }}</span>
                <button type="button" @click="saveAttachment(attachment.part, false)">保存</button>
                <button type="button" @click="saveAttachment(attachment.part, true)">打开</button>
              </li>
            </ul>
          </template>
          <div v-else class="mail-reader-empty">
            <Mail :size="28" :stroke-width="1.5" aria-hidden="true" />
            选择一封邮件
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.mail-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.mail-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.mail-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}
.mail-accounts {
  width: 200px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 12px;
  border-right: 1px solid var(--color-line);
}
.mail-accounts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  padding: 0 4px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-account-add,
.mail-compose {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-brand-ink);
  cursor: pointer;
}
.mail-account-add:hover,
.mail-compose:hover:not(:disabled) {
  background: var(--color-brand-soft);
}
.mail-compose:disabled {
  color: var(--color-muted);
  cursor: default;
  opacity: 0.45;
}
.mail-account,
.mail-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.mail-account img {
  width: 18px;
  height: 18px;
  flex: none;
  object-fit: contain;
}
.mail-account-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-account.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-unread {
  margin-left: auto;
  min-width: 16px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--color-brand-ink);
  color: var(--color-canvas);
  font-size: var(--font-size-caption);
  text-align: center;
}
.mail-refresh {
  margin-top: 8px;
  cursor: pointer;
}
.mail-refresh:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.mail-list {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 4px;
}
.mail-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 32px;
  margin-bottom: 8px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-muted);
}
.mail-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  outline: none;
}
.mail-search input::-webkit-search-cancel-button {
  display: none;
}
.mail-more {
  width: 100%;
  margin-top: 8px;
}
.mail-message {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  text-align: left;
}
.mail-message:hover,
.mail-message.active {
  background: var(--color-fill-secondary);
}
.mail-message-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-from {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-date {
  flex: none;
}
.mail-subject {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  overflow: hidden;
  font-size: var(--font-size-label);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--color-brand-ink);
}
.mail-snippet {
  width: 100%;
  overflow: hidden;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-reader {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-left: 4px;
}
.mail-reader-toolbar {
  display: flex;
  justify-content: flex-end;
  height: 28px;
  margin-bottom: 8px;
}
.mail-compose-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
}
.mail-compose-form h2 {
  margin: 0;
  font-size: var(--font-size-section);
}
.mail-compose-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-compose-field input,
.mail-compose-field textarea {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  resize: vertical;
}
.mail-compose-field textarea {
  min-height: 160px;
}
.mail-compose-attachments {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  list-style: none;
}
.mail-compose-attachments li {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: var(--font-size-label);
}
.mail-compose-attachments li > span:nth-child(2) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-compose-remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}
.mail-compose-remove:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-compose-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mail-compose-spacer {
  flex: 1;
}
.mail-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.mail-loading svg {
  animation: mail-spin 900ms linear infinite;
}
@keyframes mail-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mail-loading svg {
    animation: none;
  }
}
.mail-reader-head {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-line);
}
.mail-reader-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.mail-reader-title h2 {
  margin: 0 0 6px;
}
.mail-read-toggle {
  flex: none;
  min-height: 26px;
  padding: 0 10px;
}
.mail-reader-head h2 {
  margin: 0 0 6px;
  font-size: var(--font-size-section);
  line-height: 1.35;
}
.mail-reader-head p {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.mail-reader-head p span {
  margin-left: 8px;
}
.mail-code {
  display: block;
  width: 100%;
  margin: 14px 0;
  border: 0;
  border-radius: var(--radius-card);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font: inherit;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 4px;
  text-align: center;
  line-height: 1.5;
}
.mail-content {
  padding: 10px 0;
  font-size: var(--font-size-label);
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.mail-content :deep(img) {
  display: none;
}
.mail-text {
  margin: 10px 0;
  white-space: pre-wrap;
  font: inherit;
  font-size: var(--font-size-label);
  line-height: 1.65;
}
.mail-attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--color-line);
  list-style: none;
}
.mail-attachments li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  font-size: var(--font-size-label);
}
.mail-attachments li span:nth-child(2) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-size {
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-attachments button {
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-caption);
}
.mail-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--radius-control);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
.mail-error-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.mail-attachment-summary {
  margin: 16px 0 4px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-code-note {
  margin: -8px 0 14px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-align: center;
}
.mail-code.expired {
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  cursor: default;
}
.mail-empty {
  padding: 24px 8px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  text-align: center;
}
.mail-reader-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
</style>
