<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Snapshot } from '../shared/protocol'
import type {
  AiQuotaProviderState,
  AiQuotaWindow,
} from '../shared/ai-quota'
import {
  formatQuotaClock,
  formatQuotaFreshness,
  formatQuotaMoney,
  formatQuotaPercent,
  isQuotaProviderOutdated,
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
const refreshMinutes = computed(
  () => props.state?.settings.aiQuotaRefreshMinutes ?? 5,
)
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 15_000)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  ticker = undefined
})

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

function providerTip(
  label: string,
  provider: AiQuotaProviderState | undefined,
): string {
  if (!provider?.configured) return `${label}：未配置`
  const updated = provider.updatedAt
    ? `更新于 ${formatQuotaClock(provider.updatedAt)}（${formatQuotaFreshness(provider.updatedAt, now.value)}）`
    : '尚未更新'
  const lines = [`${label}：${updated}`]
  if (provider.error) lines.push(`读取失败：${provider.error}`)
  return lines.join('\n')
}
const openAiTip = computed(() => providerTip('OpenAI 额度', openai.value))
const deepSeekTip = computed(() => providerTip('DeepSeek 余额', deepseek.value))
const openAiOutdated = computed(() =>
  isQuotaProviderOutdated(
    openai.value,
    now.value,
    refreshMinutes.value,
  ),
)
const deepSeekOutdated = computed(() =>
  isQuotaProviderOutdated(
    deepseek.value,
    now.value,
    refreshMinutes.value,
  ),
)

</script>

<template>
  <main
    class="quota-surface"
    :class="{
      single: showOpenAi !== showDeepSeek,
      dual: showOpenAi && showDeepSeek,
      'has-deepseek': showDeepSeek,
    }"
    aria-label="AI 额度"
  >
    <section
      v-if="showOpenAi"
      class="quota-segment quota-openai"
      :class="{
        stale: openai?.status === 'stale' || openai?.status === 'error',
        'is-outdated': openAiOutdated,
        'is-error': openai?.status === 'error',
      }"
      :title="openAiTip"
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
        'is-outdated': deepSeekOutdated,
        'is-error': deepseek?.status === 'error',
      }"
      :title="deepSeekTip"
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
  padding: 6px var(--space-5);
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-stage);
  overflow: hidden;
  color: var(--color-ink);
  user-select: none;
}
.quota-surface.single {
  padding-left: var(--space-3);
  padding-right: var(--space-3);
  justify-content: flex-start;
}
.quota-surface.has-deepseek {
  padding-right: var(--space-8);
}
.quota-segment {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 46px;
}
.quota-segment.is-outdated::after {
  content: '';
  position: absolute;
  top: 1px;
  right: 0;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--color-warning);
  box-shadow: 0 0 0 2px var(--color-surface);
}
.quota-segment.is-outdated.is-error::after {
  background: var(--color-danger);
}
.quota-surface.dual .quota-openai {
  flex: 0 0 100px;
  justify-content: flex-start;
}
.quota-deepseek {
  flex: 1 1 auto;
  justify-content: flex-end;
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
.quota-segment.stale > * {
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
  font-family: var(--mqmz-font-mono);
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
  font-family: var(--mqmz-font-mono);
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
