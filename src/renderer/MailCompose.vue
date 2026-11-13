<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Paperclip, X } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  mailAccountLabel,
  type MailAttachmentPick,
} from '../shared/mail'
import PanelHeader from './PanelHeader.vue'
import { pushToast } from './toasts'

const props = defineProps<{ state?: Snapshot }>()
const emit = defineEmits<{ command: [command: Command] }>()

const accounts = computed(() => props.state?.mail.accounts ?? [])
const compose = computed(() => props.state?.mailCompose)
const sending = computed(() => Boolean(compose.value?.sending))
const accountId = ref('')
const to = ref('')
const cc = ref('')
const subject = ref('')
const body = ref('')
const attachments = ref<MailAttachmentPick[]>([])

function reset(): void {
  const draft = compose.value?.draft
  to.value = draft?.to ?? ''
  cc.value = draft?.cc ?? ''
  subject.value = draft?.subject ?? ''
  body.value = draft?.body ?? ''
  attachments.value = []
  accountId.value =
    compose.value?.accountId ?? accounts.value[0]?.id ?? ''
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

async function chooseAttachments(): Promise<void> {
  const result = await window.mqmz?.mailChooseAttachments()
  if (!result) return
  if (!result.ok) {
    pushToast(result.error, 'error')
    return
  }
  attachments.value = result.value
}
function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter((item) => item.id !== id)
}
function close(): void {
  if (sending.value) return
  emit('command', { type: 'mail-compose-close' })
}
function send(): void {
  if (sending.value) return
  if (!accountId.value) {
    pushToast('请选择发件账户。', 'error')
    return
  }
  if (!to.value.trim()) {
    pushToast('请填写收件人。', 'error')
    return
  }
  emit('command', {
    type: 'mail-send',
    accountId: accountId.value,
    to: to.value.trim(),
    ...(cc.value.trim() ? { cc: cc.value.trim() } : {}),
    subject: subject.value,
    body: body.value,
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
    @keydown.esc="close"
  >
    <section class="compose-surface" aria-label="撰写邮件">
      <PanelHeader
        title="新邮件"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="close"
      />
      <div class="compose-body">
        <label class="compose-field">
          <span>发件人</span>
          <select v-model="accountId" :disabled="sending">
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
            placeholder="name@example.com"
          />
        </label>
        <label class="compose-field">
          <span>抄送</span>
          <input
            v-model="cc"
            type="text"
            autocomplete="off"
            placeholder="可选"
          />
        </label>
        <label class="compose-field">
          <span>主题</span>
          <input v-model="subject" type="text" maxlength="500" />
        </label>
        <textarea
          v-model="body"
          class="compose-content"
          placeholder="正文"
          spellcheck="false"
        />
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
            class="settings-button"
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
.compose-content {
  flex: 1;
  min-height: 180px;
  resize: none;
  padding: 10px 2px;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  line-height: 1.6;
  outline: none;
}
.compose-attachments {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  list-style: none;
}
.compose-attachments li {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: var(--font-size-label);
}
.compose-attachments li > span:nth-child(2) {
  flex: 1;
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
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-line);
}
.compose-spacer {
  flex: 1;
}
</style>
