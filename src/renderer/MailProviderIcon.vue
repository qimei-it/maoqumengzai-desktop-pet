<script setup lang="ts">
import type { MailProvider } from '../shared/mail'
import qqIcon from './assets/mail/qq.svg'
import mail163Icon from './assets/mail/163.svg'
import gmailIcon from './assets/mail/gmail.svg'

const props = defineProps<{ provider: MailProvider }>()
const icons: Record<MailProvider, string> = {
  qq: qqIcon,
  '163': mail163Icon,
  gmail: gmailIcon,
}
</script>

<template>
  <img
    class="mail-brand-icon"
    :src="icons[props.provider]"
    alt=""
    draggable="false"
  />
</template>

<style scoped>
.mail-brand-icon {
  width: 20px;
  height: 20px;
  flex: none;
  object-fit: contain;
}
</style>
