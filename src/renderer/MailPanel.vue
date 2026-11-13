<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Archive,
  CornerUpLeft,
  CornerUpRight,
  FileText,
  Folder,
  FolderInput,
  Inbox,
  LoaderCircle,
  Mail,
  MailPlus,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  formatMailBadge,
  mailAccountLabel,
  mailLocalDraftsFolder,
  type MailDraftSummary,
  type MailFolderKind,
  type MailMessageSummary,
} from '../shared/mail'
import {
  formatMailDateTime,
  formatMailListDate,
} from '../shared/mail-date'
import MailProviderIcon from './MailProviderIcon.vue'
import PanelHeader from './PanelHeader.vue'
import { pushToast } from './toasts'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()
const panel = computed(() => props.state?.mailPanel)
const accounts = computed(() => props.state?.mail.accounts ?? [])
const folderMap = computed(() => props.state?.mail.folders ?? {})
const folderIcons: Record<MailFolderKind, unknown> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
  all: Folder,
  other: Folder,
}
function foldersFor(accountId: string) {
  return folderMap.value[accountId] ?? []
}
function folderIcon(kind: MailFolderKind): unknown {
  return folderIcons[kind] ?? Folder
}
const selected = computed(() => panel.value?.selected)
const attachmentTotal = computed(() =>
  (selected.value?.attachments ?? []).reduce(
    (total, attachment) => total + attachment.size,
    0,
  ),
)
const messages = computed(() => panel.value?.messages ?? [])
const localDrafts = computed(() =>
  panel.value?.folder === mailLocalDraftsFolder
    ? panel.value?.drafts ?? []
    : [],
)
const allDrafts = computed(() => props.state?.mail.drafts ?? [])
function draftsFor(accountId: string): MailDraftSummary[] {
  return allDrafts.value.filter((draft) => draft.accountId === accountId)
}
const inLocalDrafts = computed(
  () => panel.value?.folder === mailLocalDraftsFolder,
)
const currentFolderKind = computed<MailFolderKind>(() => {
  const id = accountId.value
  if (!id || inLocalDrafts.value) return 'drafts'
  return (
    foldersFor(id).find((folder) => folder.path === panel.value?.folder)
      ?.kind ?? 'other'
  )
})
const inTrash = computed(() => currentFolderKind.value === 'trash')
const moveOpen = ref(false)
const moveTargets = computed(() => {
  const id = accountId.value
  if (!id) return []
  return foldersFor(id).filter(
    (folder) =>
      folder.path !== panel.value?.folder &&
      folder.kind !== 'drafts' &&
      folder.path !== mailLocalDraftsFolder,
  )
})
const currentFolderName = computed(() => {
  if (inLocalDrafts.value) return '草稿'
  const id = accountId.value
  if (!id) return '收件箱'
  return (
    foldersFor(id).find((folder) => folder.path === panel.value?.folder)
      ?.name ?? '收件箱'
  )
})
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
    return `有效期至 ${formatMailDateTime(detail.codeExpiresAt)}`
  return ''
})
function selectAccount(id: string): void {
  emit('command', { type: 'mail-open', accountId: id })
}
function selectFolder(accountId: string, folder: string): void {
  emit('command', {
    type: 'mail-folder',
    accountId,
    folder,
  })
}
function selectLocalDrafts(accountId: string): void {
  selectFolder(accountId, mailLocalDraftsFolder)
}
function selectMessage(
  message: MailMessageSummary,
  event?: Event,
): void {
  if (event) (event.currentTarget as HTMLElement | null)?.focus()
  emit('command', { type: 'mail-select', uid: message.uid })
}
function deleteMessage(message: MailMessageSummary): void {
  emit('command', { type: 'mail-delete', uid: message.uid })
}
function onMessageKeydown(
  message: MailMessageSummary,
  event: KeyboardEvent,
): void {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  event.preventDefault()
  event.stopPropagation()
  deleteMessage(message)
}
function moveTo(folder: string): void {
  if (!folder || !selected.value) return
  emit('command', {
    type: 'mail-move',
    uid: selected.value.uid,
    folder,
  })
  moveOpen.value = false
}
function closeMoveMenu(): void {
  moveOpen.value = false
}
function openDraft(draft: MailDraftSummary): void {
  emit('command', {
    type: 'mail-compose-open',
    accountId: draft.accountId,
    draftId: draft.id,
  })
}
function removeDraft(draft: MailDraftSummary): void {
  emit('command', { type: 'mail-draft-delete', id: draft.id })
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
  emit('command', {
    type: 'mail-compose-open',
    ...(accountId.value ? { accountId: accountId.value } : {}),
  })
}
function plainBody(): string {
  const detail = selected.value
  if (!detail) return ''
  if (detail.bodyText) return detail.bodyText
  if (!detail.bodyHtml) return ''
  return detail.bodyHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}
function quotedBody(heading: string): string {
  const detail = selected.value
  if (!detail) return ''
  const from =
    detail.fromName || detail.fromAddress || '未知发件人'
  return `\n\n----- ${heading} -----\n发件人: ${from}\n时间: ${
    detail.date ? formatMailDateTime(detail.date) : ''
  }\n\n${plainBody()}`
}
function draftAttachments() {
  const detail = selected.value
  if (!detail) return []
  return detail.attachments
    .filter((attachment) => Boolean(attachment.localPath))
    .map((attachment) => ({
      path: attachment.localPath!,
      name: attachment.filename,
      size: attachment.size,
    }))
}
function reply(): void {
  const detail = selected.value
  if (!detail?.fromAddress) {
    pushToast('原邮件没有可回复的发件人。', 'error')
    return
  }
  const attachments = draftAttachments()
  emit('command', {
    type: 'mail-compose-open',
    accountId: accountId.value,
    draft: {
      to: detail.fromAddress,
      subject: /^re:/i.test(detail.subject)
        ? detail.subject
        : `Re: ${detail.subject}`,
      body: quotedBody('原邮件'),
      ...(attachments.length ? { attachments } : {}),
    },
  })
}
function forward(): void {
  const detail = selected.value
  if (!detail) return
  const attachments = draftAttachments()
  emit('command', {
    type: 'mail-compose-open',
    accountId: accountId.value,
    draft: {
      subject: /^fwd:/i.test(detail.subject)
        ? detail.subject
        : `Fwd: ${detail.subject}`,
      body: quotedBody('转发邮件'),
      ...(attachments.length ? { attachments } : {}),
    },
  })
}
function archiveMail(): void {
  if (!selected.value) return
  emit('command', {
    type: 'mail-archive',
    uid: selected.value.uid,
  })
}
function deleteMail(): void {
  if (!selected.value) return
  emit('command', {
    type: 'mail-delete',
    uid: selected.value.uid,
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
function badgeShape(count: number): string {
  return formatMailBadge(count).length === 1 ? 'is-single' : 'is-pill'
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
onMounted(() => {
  document.addEventListener('pointerdown', closeMoveMenu)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', closeMoveMenu)
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
    if (notice) pushToast(notice, 'success')
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
            <div class="mail-accounts-title">
              <span>邮箱账户</span>
              <button
                type="button"
                class="mail-refresh-icon"
                aria-label="刷新邮件"
                title="刷新"
                :disabled="panel?.loading"
                @click="refresh"
              >
                <RefreshCw :size="15" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
            <div class="mail-accounts-head-actions">
              <button
                type="button"
                class="mail-compose"
                aria-label="新建邮件"
                title="写邮件"
                :disabled="!accounts.length"
                @click="openCompose"
              >
                <PenLine :size="15" :stroke-width="2" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="mail-account-add"
                aria-label="添加邮箱账户"
                title="添加邮箱账户"
                @click="openMailSettings"
              >
                <MailPlus :size="15" :stroke-width="2" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="mail-settings"
                aria-label="邮件设置"
                title="邮件设置"
                @click="openMailSettings"
              >
                <Settings :size="15" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div
            v-for="item in accounts"
            :key="item.id"
            class="mail-account-group"
          >
            <button
              type="button"
              class="mail-account"
              :class="{ active: item.id === accountId }"
              @click="selectAccount(item.id)"
            >
              <MailProviderIcon :provider="item.provider" />
              <span class="mail-account-label" :title="mailAccountLabel(item)">{{
                mailAccountLabel(item)
              }}</span>
              <span
                v-if="item.unread && (state?.mail.config.unreadBadge ?? true)"
                class="mail-unread"
                :class="badgeShape(item.unread)"
                :title="`${item.unread} 封未读`"
                >{{ formatMailBadge(item.unread) }}</span
              >
            </button>
            <button
              v-if="draftsFor(item.id).length"
              type="button"
              class="mail-folder mail-folder-drafts"
              :class="{
                active:
                  item.id === accountId &&
                  panel?.folder === mailLocalDraftsFolder,
              }"
              title="草稿"
              @click="selectLocalDrafts(item.id)"
            >
              <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
              <span class="mail-folder-name">草稿</span>
              <span class="mail-folder-count">{{
                draftsFor(item.id).length
              }}</span>
            </button>
            <button
              v-for="folder in foldersFor(item.id)"
              :key="`${item.id}:${folder.path}`"
              type="button"
              class="mail-folder"
              :class="{
                active:
                  item.id === accountId && folder.path === panel?.folder,
              }"
              :title="folder.name"
              @click="selectFolder(item.id, folder.path)"
            >
              <component
                :is="folderIcon(folder.kind)"
                :size="14"
                :stroke-width="1.8"
                aria-hidden="true"
              />
              <span class="mail-folder-name">{{ folder.name }}</span>
              <span v-if="folder.total" class="mail-folder-count">{{
                folder.total
              }}</span>
            </button>
          </div>
        </aside>
        <section class="mail-list" aria-label="邮件列表">
          <div class="mail-list-head">
            <span>{{ currentFolderName }}</span>
            <span>{{
              inLocalDrafts ? localDrafts.length : messages.length
            }} 封</span>
          </div>
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
          <div
            v-for="message in messages"
            :key="message.uid"
            class="mail-message-row"
          >
            <button
              type="button"
              class="mail-message"
              :class="{ active: selected?.uid === message.uid }"
              @click="selectMessage(message, $event)"
              @keydown="onMessageKeydown(message, $event)"
            >
              <span class="mail-message-top">
                <span class="mail-from">{{ message.fromName || message.fromAddress || '未知发件人' }}</span>
                <span class="mail-date">{{ formatMailListDate(message.date) }}</span>
              </span>
              <span class="mail-subject">
                <span v-if="message.unread" class="mail-dot" />
                {{ message.subject }}
                <Paperclip v-if="message.hasAttachments" :size="12" :stroke-width="2" aria-hidden="true" />
              </span>
              <span v-if="message.snippet" class="mail-snippet">{{ message.snippet }}</span>
            </button>
          </div>
          <div
            v-for="draft in localDrafts"
            :key="draft.id"
            class="mail-draft-row"
            role="button"
            tabindex="0"
            @click="openDraft(draft)"
            @keydown.enter.prevent="openDraft(draft)"
          >
            <span class="mail-draft-meta">
              <span class="mail-draft-to">{{
                draft.to || '未填写收件人'
              }}</span>
              <span class="mail-draft-subject">{{
                draft.subject || '(无主题)'
              }}</span>
            </span>
            <button
              type="button"
              class="mail-draft-remove"
              title="删除草稿"
              aria-label="删除草稿"
              @click.stop="removeDraft(draft)"
            >
              <Trash2 :size="13" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <div
            v-if="!panel?.loading && !messages.length && !localDrafts.length"
            class="mail-empty"
          >
            {{ panel?.query ? '没有匹配的邮件' : '暂无邮件' }}
          </div>
          <button
            v-if="panel?.hasMore"
            type="button"
            class="settings-button mail-more"
            :disabled="panel?.loading"
            @click="loadMore"
          >
            {{ loadingMore ? '正在加载…' : '加载更多' }}
          </button>
        </section>
        <article class="mail-reader">
          <div v-if="readerLoading" class="mail-loading" role="status">
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
                <div class="mail-reader-actions">
                  <button
                    type="button"
                    class="mail-reader-icon"
                    aria-label="回复"
                    title="回复"
                    @click="reply"
                  >
                    <CornerUpLeft :size="15" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="mail-reader-icon"
                    aria-label="转发"
                    title="转发"
                    @click="forward"
                  >
                    <CornerUpRight :size="15" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="mail-reader-icon"
                    aria-label="归档"
                    title="归档"
                    @click="archiveMail"
                  >
                    <Archive :size="15" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <div class="mail-move-wrap" @pointerdown.stop>
                    <button
                      type="button"
                      class="mail-reader-icon"
                      aria-label="移动"
                      title="移动"
                      :aria-expanded="moveOpen"
                      @click.stop="moveOpen = !moveOpen"
                    >
                      <FolderInput :size="15" :stroke-width="2" aria-hidden="true" />
                    </button>
                    <div
                      v-if="moveOpen"
                      class="mail-move-menu"
                      role="menu"
                      aria-label="移动到文件夹"
                      @click.stop
                    >
                      <button
                        v-for="folder in moveTargets"
                        :key="folder.path"
                        type="button"
                        role="menuitem"
                        @click="moveTo(folder.path)"
                      >
                        {{ folder.name }}
                      </button>
                      <span v-if="!moveTargets.length" class="mail-move-empty">
                        没有其他文件夹
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="mail-reader-icon danger"
                    :aria-label="inTrash ? '永久删除' : '删除'"
                    :title="inTrash ? '永久删除' : '删除'"
                    @click="deleteMail"
                  >
                    <Trash2 :size="15" :stroke-width="2" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p>
                {{ selected.fromName || selected.fromAddress || '未知发件人' }}
                <span v-if="selected.date">{{ formatMailDateTime(selected.date) }}</span>
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
  min-height: 0;
  overflow-y: auto;
  padding-right: 12px;
  border-right: 1px solid var(--color-line);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
}
.mail-account-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mail-folder {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 8px 0 30px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
  cursor: pointer;
}
.mail-folder:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.mail-folder.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-folder svg {
  flex: none;
}
.mail-folder-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-folder-count {
  flex: none;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.mail-accounts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 0 0 0 4px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.mail-accounts-title {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.mail-accounts-head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: -12px;
}
.mail-account-add,
.mail-compose,
.mail-settings,
.mail-refresh-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-brand-ink);
  cursor: pointer;
}
.mail-account-add:hover,
.mail-compose:hover:not(:disabled),
.mail-settings:hover,
.mail-refresh-icon:hover:not(:disabled) {
  background: var(--color-brand-soft);
}
.mail-compose:disabled,
.mail-refresh-icon:disabled {
  color: var(--color-muted);
  cursor: default;
  opacity: 0.45;
}
.mail-account {
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
  display: grid;
  flex: none;
  place-items: center;
  height: 18px;
  margin-left: auto;
  margin-right: -5px;
  background: var(--color-brand-ink);
  color: var(--color-canvas);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-align: center;
}
.mail-unread.is-single {
  width: 18px;
  border-radius: 50%;
}
.mail-unread.is-pill {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
}
.mail-list {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
}
.mail-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 0 4px 8px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-list-head > span:first-child {
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
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
  flex: 1;
  min-width: 0;
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
.mail-message-row {
  display: flex;
  align-items: flex-start;
}
.mail-draft-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 8px 8px 10px;
  border-radius: var(--radius-control);
  color: var(--color-ink);
  cursor: pointer;
}
.mail-draft-row:hover {
  background: var(--color-fill-secondary);
}
.mail-draft-meta {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.mail-draft-to {
  overflow: hidden;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-draft-subject {
  overflow: hidden;
  font-size: var(--font-size-label);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mail-draft-remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}
.mail-draft-remove:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
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
  margin-right: calc(-1 * var(--mqmz-panel-padding));
  padding-left: 4px;
  padding-right: 6px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
}
.mail-accounts::-webkit-scrollbar,
.mail-list::-webkit-scrollbar,
.mail-reader::-webkit-scrollbar {
  width: 6px;
}
.mail-accounts::-webkit-scrollbar-track,
.mail-list::-webkit-scrollbar-track,
.mail-reader::-webkit-scrollbar-track {
  background: transparent;
}
.mail-accounts::-webkit-scrollbar-thumb,
.mail-list::-webkit-scrollbar-thumb,
.mail-reader::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-line);
}
.mail-accounts::-webkit-scrollbar-thumb:hover,
.mail-list::-webkit-scrollbar-thumb:hover,
.mail-reader::-webkit-scrollbar-thumb:hover {
  background: var(--color-muted);
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
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mail-reader-title h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  line-height: 26px;
  overflow-wrap: anywhere;
}
.mail-reader-actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: 2px;
}
.mail-reader-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}
.mail-reader-icon:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-reader-icon.danger:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.mail-move-wrap {
  position: relative;
  flex: none;
}
.mail-move-menu {
  position: absolute;
  z-index: 4;
  top: calc(100% + 4px);
  right: 0;
  min-width: 132px;
  max-height: 236px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--shadow-stage);
}
.mail-move-menu > button {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.mail-move-menu > button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.mail-move-empty {
  display: block;
  padding: 8px 10px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.mail-reader-head h2 {
  margin: 0 0 6px;
  font-size: var(--font-size-section);
  line-height: 1.35;
}
.mail-reader-title h2 {
  margin: 0;
  line-height: 26px;
}
.mail-reader-head p {
  margin: 6px 0 0;
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
