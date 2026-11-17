<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Bold,
  Italic,
  List as ListIcon,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Paperclip,
  Redo2,
  Underline,
  Undo2,
  X,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  mailAccountLabel,
  mailAttachmentTotalLimit,
  mailRecipientError,
} from '../shared/mail'
import PanelHeader from './PanelHeader.vue'
import { pushToast } from './toasts'

const props = defineProps<{ state?: Snapshot }>()
const emit = defineEmits<{ command: [command: Command] }>()

const accounts = computed(() => props.state?.mail.accounts ?? [])
const compose = computed(() => props.state?.mailCompose)
const maximized = computed(() => props.state?.mailCompose.maximized === true)
const sending = computed(() => Boolean(compose.value?.sending))
function toggleDefault(): void {
  emit('command', { type: 'panel-control', action: 'toggle-default' })
}
function onFrameDoubleClick(event: MouseEvent): void {
  if (event.target !== event.currentTarget) return
  toggleDefault()
}
/** Snapshot the state before the native drag region may zoom the window. */
let headerPressMaximized = false
function onHeaderMouseDown(): void {
  headerPressMaximized = maximized.value
}
function onHeaderDoubleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button')) return
  const before = headerPressMaximized
  window.setTimeout(() => {
    if (maximized.value !== before) return
    toggleDefault()
  }, 220)
}
const accountId = ref('')
const to = ref('')
const cc = ref('')
const bcc = ref('')
const subject = ref('')
const bodyHtml = ref('')
const draftId = ref('')
const editor = ref<HTMLDivElement>()
const attachments = computed(() => compose.value?.attachments ?? [])
const attachmentTotal = computed(() =>
  attachments.value.reduce((total, item) => total + item.size, 0),
)
let saveTimer: ReturnType<typeof setTimeout> | undefined
let hydrating = false
const contacts = computed(() => compose.value?.contacts ?? [])
const contactOptions = computed(() =>
  contacts.value.map((contact) => ({
    ...contact,
    label: contact.name
      ? `${contact.name}（${contact.address}）`
      : contact.address,
  })),
)

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function textToHtml(value: string): string {
  return value
    .split('\n')
    .map((line) => `<div>${line ? escapeHtml(line) : '<br>'}</div>`)
    .join('')
}
function reset(): void {
  const draft = compose.value?.draft
  hydrating = true
  to.value = draft?.to ?? ''
  cc.value = draft?.cc ?? ''
  bcc.value = draft?.bcc ?? ''
  subject.value = draft?.subject ?? ''
  bodyHtml.value = draft?.bodyHtml || textToHtml(draft?.body ?? '')
  draftId.value = compose.value?.draftId ?? ''
  accountId.value =
    compose.value?.accountId ?? accounts.value[0]?.id ?? ''
  void nextTick(() => {
    if (editor.value) editor.value.innerHTML = bodyHtml.value
    hydrating = false
  })
}
watch(() => compose.value?.revision, reset, { immediate: true })
watch(
  () => compose.value?.accountId,
  (value) => {
    if (value) accountId.value = value
  },
)
watch(
  () => compose.value?.error,
  (value) => {
    if (value) pushToast(value, 'error')
  },
)
watch(
  () => compose.value?.draftId,
  (value) => {
    if (value) draftId.value = value
  },
)
function currentBody(): string {
  return editor.value?.innerText ?? ''
}
function isBlank(): boolean {
  const text = bodyHtml.value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return (
    !to.value.trim() &&
    !cc.value.trim() &&
    !bcc.value.trim() &&
    !subject.value.trim() &&
    !text &&
    !attachments.value.length
  )
}
async function saveDraft(): Promise<void> {
  if (sending.value || hydrating) return
  syncBody()
  if (!accountId.value) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (isBlank() && !draftId.value) return
  const result = await window.mqmz?.command({
    type: 'mail-draft-save',
    ...(draftId.value ? { draftId: draftId.value } : {}),
    accountId: accountId.value,
    to: to.value,
    cc: cc.value,
    bcc: bcc.value,
    subject: subject.value,
    body: currentBody(),
    bodyHtml: bodyHtml.value,
    attachmentIds: attachments.value.map((item) => item.id),
  })
  if (result?.ok && result.value.mailCompose.draftId)
    draftId.value = result.value.mailCompose.draftId
}
function scheduleSave(): void {
  if (hydrating || sending.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    void saveDraft()
  }, 900)
}
watch([to, cc, bcc, subject], scheduleSave)
watch(bodyHtml, scheduleSave)

async function chooseAttachments(): Promise<void> {
  const result = await window.mqmz?.mailChooseAttachments()
  if (!result) return
  if (!result.ok) {
    pushToast(result.error, 'error')
    return
  }
  scheduleSave()
}
function syncBody(): void {
  bodyHtml.value = editor.value?.innerHTML ?? ''
}
function onBodyInput(): void {
  syncBody()
  scheduleSave()
}
function indentOnTab(event: KeyboardEvent): void {
  editor.value?.focus()
  if (event.shiftKey) {
    document.execCommand('outdent', false)
  } else {
    document.execCommand('insertText', false, '  ')
  }
  syncBody()
}
function format(command: string): void {
  editor.value?.focus()
  document.execCommand(command, false)
  syncBody()
}
function removeAttachment(id: string): void {
  emit('command', { type: 'mail-remove-attachment', id })
  scheduleSave()
}
async function close(): Promise<void> {
  if (sending.value) return
  await saveDraft()
  emit('command', { type: 'mail-compose-close' })
}
function send(): void {
  if (sending.value) return
  if (!accountId.value) {
    pushToast('请选择发件账户。', 'error')
    return
  }
  const recipientError = mailRecipientError(to.value, true)
  if (recipientError) {
    pushToast(recipientError, 'error')
    return
  }
  const ccError = mailRecipientError(cc.value)
  if (ccError) {
    pushToast(ccError, 'error')
    return
  }
  const bccError = mailRecipientError(bcc.value)
  if (bccError) {
    pushToast(bccError, 'error')
    return
  }
  if (subject.value.length > 500) {
    pushToast('主题不能超过 500 个字符。', 'error')
    return
  }
  if (attachmentTotal.value > mailAttachmentTotalLimit) {
    pushToast('附件总大小不能超过 25 MB。', 'error')
    return
  }
  syncBody()
  const body = currentBody()
  if (bodyHtml.value.length > 1_000_000) {
    pushToast('正文过长，请精简后发送。', 'error')
    return
  }
  emit('command', {
    type: 'mail-send',
    accountId: accountId.value,
    ...(draftId.value ? { draftId: draftId.value } : {}),
    to: to.value.trim(),
    ...(cc.value.trim() ? { cc: cc.value.trim() } : {}),
    ...(bcc.value.trim() ? { bcc: bcc.value.trim() } : {}),
    subject: subject.value,
    body,
    bodyHtml: bodyHtml.value,
    attachmentIds: attachments.value.map((item) => item.id),
  })
}
function size(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
</script>

<template>
  <main
    class="compose-shell"
    :class="{ 'is-maximized': maximized }"
    @keydown.esc="close"
    @dblclick="onFrameDoubleClick"
  >
    <section class="compose-surface" aria-label="撰写邮件">
      <PanelHeader
        title="新邮件"
        :platform="state?.runtime.platform"
        resizable
        :maximized="maximized"
        @mousedown="onHeaderMouseDown"
        @dblclick="onHeaderDoubleClick"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @maximize="toggleDefault"
        @close="close"
      />
      <div class="compose-body">
        <datalist id="mail-contact-options">
          <option
            v-for="contact in contactOptions"
            :key="contact.address"
            :value="contact.address"
            :label="contact.label"
          />
        </datalist>
        <label class="compose-field">
          <span>发件人</span>
          <select v-model="accountId" :disabled="sending" @change="scheduleSave">
            <option
              v-for="account in accounts"
              :key="account.id"
              :value="account.id"
            >
              {{ mailAccountLabel(account) }}
            </option>
          </select>
        </label>
        <label class="compose-field">
          <span>收件人</span>
          <input
            v-model="to"
            type="text"
            autocomplete="off"
            list="mail-contact-options"
            placeholder="name@example.com"
            @input="scheduleSave"
          />
        </label>
        <label class="compose-field">
          <span>抄送</span>
          <input
            v-model="cc"
            type="text"
            autocomplete="off"
            list="mail-contact-options"
            placeholder="可选"
            @input="scheduleSave"
          />
        </label>
        <label class="compose-field">
          <span>密送</span>
          <input
            v-model="bcc"
            type="text"
            autocomplete="off"
            list="mail-contact-options"
            placeholder="可选"
            @input="scheduleSave"
          />
        </label>
        <label class="compose-field">
          <span>主题</span>
          <input
            v-model="subject"
            type="text"
            maxlength="500"
            @input="scheduleSave"
          />
        </label>
        <div class="compose-formatbar" role="toolbar" aria-label="正文格式">
          <button
            type="button"
            class="compose-format-button"
            title="撤销"
            aria-label="撤销"
            @mousedown.prevent="format('undo')"
          >
            <Undo2 :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="compose-format-button"
            title="重做"
            aria-label="重做"
            @mousedown.prevent="format('redo')"
          >
            <Redo2 :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <span class="compose-format-separator" />
          <button
            type="button"
            class="compose-format-button"
            title="加粗"
            aria-label="加粗"
            @mousedown.prevent="format('bold')"
          >
            <Bold :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="compose-format-button"
            title="斜体"
            aria-label="斜体"
            @mousedown.prevent="format('italic')"
          >
            <Italic :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="compose-format-button"
            title="下划线"
            aria-label="下划线"
            @mousedown.prevent="format('underline')"
          >
            <Underline :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <span class="compose-format-separator" />
          <button
            type="button"
            class="compose-format-button"
            title="无序列表"
            aria-label="无序列表"
            @mousedown.prevent="format('insertUnorderedList')"
          >
            <ListIcon :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="compose-format-button"
            title="有序列表"
            aria-label="有序列表"
            @mousedown.prevent="format('insertOrderedList')"
          >
            <ListOrdered :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
          <span class="compose-format-separator" />
          <button
            type="button"
            class="compose-format-button"
            title="增加缩进"
            aria-label="增加缩进"
            @mousedown.prevent="format('indent')"
          >
            <ListIndentIncrease
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="compose-format-button"
            title="减少缩进"
            aria-label="减少缩进"
            @mousedown.prevent="format('outdent')"
          >
            <ListIndentDecrease
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </div>
        <div
          ref="editor"
          class="compose-content"
          contenteditable="true"
          role="textbox"
          aria-label="正文"
          aria-multiline="true"
          data-placeholder="正文"
          spellcheck="false"
          @input="onBodyInput"
          @keydown.tab.prevent="indentOnTab"
        />
        <p
          v-if="attachments.length"
          class="compose-attachment-summary"
          :class="{ over: attachmentTotal > mailAttachmentTotalLimit }"
        >
          {{ attachments.length }} 个附件 · {{ size(attachmentTotal) }}
        </p>
        <ul v-if="attachments.length" class="compose-attachments">
          <li v-for="attachment in attachments" :key="attachment.id">
            <Paperclip :size="13" :stroke-width="2" aria-hidden="true" />
            <span>{{ attachment.name }}</span>
            <span class="compose-size">{{ size(attachment.size) }}</span>
            <button
              type="button"
              class="compose-remove"
              aria-label="移除附件"
              @click="removeAttachment(attachment.id)"
            >
              <X :size="12" :stroke-width="2" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="compose-actions">
          <button
            type="button"
            class="settings-button compose-attach-button"
            :disabled="sending"
            @click="chooseAttachments"
          >
            <Paperclip :size="13" :stroke-width="2" aria-hidden="true" />
            添加附件
          </button>
          <span class="compose-spacer" />
          <button
            type="button"
            class="settings-button"
            :disabled="sending"
            @click="close"
          >
            取消
          </button>
          <button
            type="button"
            class="settings-button primary"
            :disabled="sending"
            @click="send"
          >
            {{ sending ? '发送中…' : '发送' }}
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.compose-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
}
.compose-shell.is-maximized {
  background: var(--color-canvas);
}
.compose-shell.is-maximized .compose-surface {
  border-radius: 0;
  box-shadow: none;
}
.compose-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.compose-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
}
.compose-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  border-bottom: 1px solid var(--color-line);
}
.compose-field > span {
  flex: none;
  width: 64px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.compose-field input,
.compose-field select {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  outline: none;
}
.compose-formatbar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  padding: 3px 0;
  border-bottom: 1px solid var(--color-line);
}
.compose-format-button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}
.compose-format-button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.compose-format-separator {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--color-line);
}
.compose-content {
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  padding: 10px 2px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  line-height: 1.6;
  white-space: pre-wrap;
  outline: none;
}
.compose-content::-webkit-scrollbar {
  width: 6px;
}
.compose-content::-webkit-scrollbar-track {
  background: transparent;
}
.compose-content::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-line);
}
.compose-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-muted);
}
.compose-content:empty::before {
  content: attr(data-placeholder);
  color: var(--color-muted);
}
.compose-attachments {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 132px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.compose-attachment-summary {
  flex: none;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.compose-attachment-summary.over {
  color: var(--color-danger);
}
.compose-attachments li {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  width: fit-content;
  max-width: 100%;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  font-size: var(--font-size-label);
}
.compose-attachments li > span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compose-size {
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.compose-remove {
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
.compose-remove:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.compose-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding-top: 12px;
  background: var(--color-canvas);
  border-top: 1px solid var(--color-line);
}
.compose-spacer {
  flex: 1;
}
.compose-attach-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
