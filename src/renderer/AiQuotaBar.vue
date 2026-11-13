<script setup lang="ts">
import { computed } from 'vue'
import type { Snapshot } from '../shared/protocol'
import type { AiQuotaWindow } from '../shared/ai-quota'
import {
  formatQuotaMoney,
  formatQuotaPercent,
} from '../shared/ai-quota'
import DeepSeekMark from './DeepSeekMark.vue'
import OpenAiMark from './OpenAiMark.vue'
import QuotaRings from './QuotaRings.vue'

const props = defineProps<{ state?: Snapshot }>()
const quota = computed(() => props.state?.aiQuota)
const openai = computed(() => quota.value?.openai)
const deepseek = computed(() => quota.value?.deepseek)
const showOpenAi = computed(() => Boolean(openai.value?.configured))
const showDeepSeek = computed(() => Boolean(deepseek.value?.configured))

function windowValue(
  windows: AiQuotaWindow[] | undefined,
  key: AiQuotaWindow['key'],
): number | undefined {
  return windows?.find((item) => item.key === key)?.remaining
}
const openAiFiveHour = computed(() =>
  windowValue(openai.value?.windows, 'fiveHour'),
)
const openAiWeek = computed(() => windowValue(openai.value?.windows, 'week'))
const deepSeekBalance = computed(() => {
  const balance = deepseek.value?.balance
  return balance ? formatQuotaMoney(balance) : '—'
})

</script>

<template>
  <main
    class="quota-surface"
    :class="{
      single: showOpenAi !== showDeepSeek,
      dual: showOpenAi && showDeepSeek,
    }"
    aria-label="AI 额度"
  >
    <section
      v-if="showOpenAi"
      class="quota-segment quota-openai"
      :class="{ stale: openai?.status === 'stale' || openai?.status === 'error' }"
    >
      <span class="quota-ring-wrap">
        <QuotaRings
          :size="46"
          :outer="openAiFiveHour"
          :inner="openAiWeek"
          color="var(--color-provider-openai)"
        />
        <OpenAiMark class="quota-ring-center" :size="14" />
      </span>
      <div class="quota-copy">
        <span class="quota-values">
          <span class="quota-value-label">5h</span>
          <span class="quota-value-number">{{
            formatQuotaPercent(openAiFiveHour)
          }}</span>
          <span class="quota-value-label">1w</span>
          <span class="quota-value-number">{{
            formatQuotaPercent(openAiWeek)
          }}</span>
        </span>
      </div>
    </section>

    <span v-if="showOpenAi && showDeepSeek" class="quota-divider" />

    <section
      v-if="showDeepSeek"
      class="quota-segment quota-deepseek"
      :class="{
        stale: deepseek?.status === 'stale' || deepseek?.status === 'error',
      }"
    >
      <DeepSeekMark :size="15" />
      <span class="quota-balance">{{ deepSeekBalance }}</span>
    </section>
  </main>
</template>

<style scoped>
.quota-surface {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100vw;
  height: 100vh;
  padding: 6px 10px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-stage);
  overflow: hidden;
  color: var(--color-ink);
  user-select: none;
}
.quota-surface.single {
  padding-left: 6px;
  padding-right: 6px;
  justify-content: flex-start;
}
.quota-segment {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 46px;
}
.quota-surface.dual .quota-segment {
  flex: 1 1 0;
}
.quota-surface.dual .quota-openai {
  justify-content: flex-start;
}
.quota-surface.dual .quota-deepseek {
  justify-content: flex-start;
}
.quota-ring-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex: none;
}
.quota-ring-center {
  position: absolute;
  left: 50%;
  top: 50%;
  color: var(--color-provider-openai);
  transform: translate(-50%, -50%);
}
.quota-segment.stale {
  opacity: 0.62;
}
.quota-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  min-width: 0;
}
.quota-values {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: start;
  column-gap: 4px;
  row-gap: 2px;
  color: var(--color-ink);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  white-space: nowrap;
}
.quota-value-number {
  text-align: right;
}
.quota-balance {
  color: var(--color-provider-deepseek);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  white-space: nowrap;
}
.quota-divider {
  width: 1px;
  height: 26px;
  margin: 0 8px;
  flex: none;
  background: var(--color-line);
}
</style>
