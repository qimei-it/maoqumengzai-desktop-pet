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
    :class="{ 'is-gmail': props.provider === 'gmail' }"
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
/* Gmail's artwork is 4:3 inside a square canvas; scale it optically so its
   visible height matches the square QQ and NetEase app icons. */
.mail-brand-icon.is-gmail {
  transform: scale(1.2);
}
</style>
