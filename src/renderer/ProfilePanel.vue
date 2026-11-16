<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  normalizePetName,
  petNameConflict,
  petNameConflictError,
} from '../shared/pet-name'
import { getPetStyle, type PetPoseId } from '../shared/pet-style'
import PanelHeader from './PanelHeader.vue'
import catBase from './assets/pet/ragdoll/base.png'
import catBlink from './assets/pet/ragdoll/blink.png'
import catFocus from './assets/pet/ragdoll/focus.png'
import catLifted from './assets/pet/ragdoll/lifted.png'
import catMusic from './assets/pet/ragdoll/music.png'
import catPonder from './assets/pet/ragdoll/ponder.png'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const bundledPoses: Record<PetPoseId, string> = {
  base: catBase,
  blink: catBlink,
  focus: catFocus,
  lifted: catLifted,
  music: catMusic,
  ponder: catPonder,
}
const poseImages = computed(() =>
  getPetStyle().states.map((state) => ({
    id: state.id,
    label: state.label,
    src: props.state?.petAssets?.poses[state.id] ?? bundledPoses[state.id],
  })),
)
const currentPose = ref(0)
const currentPoseImage = computed(
  () => poseImages.value[currentPose.value] ?? poseImages.value[0]!,
)
const skipPoseTransition = ref(false)
const dragX = ref(0)
const dragging = ref(false)
const dragStyle = computed(() => ({
  transform: dragX.value ? `translateX(${dragX.value}px)` : undefined,
}))

let pointerId: number | undefined
let startX = 0
let startY = 0
let moved = false
let horizontal = false
let autoTimer: number | undefined
let wheelTimer: number | undefined
let wheelTotal = 0
let wheelDirection = 0
let wheelLocked = false
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const reduceMotion = ref(motionQuery.matches)

function stopAuto(): void {
  if (autoTimer !== undefined) {
    window.clearInterval(autoTimer)
    autoTimer = undefined
  }
}
function startAuto(): void {
  stopAuto()
  if (!props.state?.profileOpen || reduceMotion.value) return
  autoTimer = window.setInterval(() => {
    const length = poseImages.value.length
    if (length > 1) currentPose.value = (currentPose.value + 1) % length
  }, 5000)
}
function resetAuto(): void {
  if (props.state?.profileOpen) startAuto()
}
function goTo(index: number): void {
  const length = poseImages.value.length
  if (!length) return
  currentPose.value = ((index % length) + length) % length
  resetAuto()
}
function previousPose(): void {
  goTo(currentPose.value - 1)
}
function nextPose(): void {
  goTo(currentPose.value + 1)
}
function onMotionChange(event: MediaQueryListEvent): void {
  reduceMotion.value = event.matches
  if (event.matches) stopAuto()
  else resetAuto()
}
function onPointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0) return
  pointerId = event.pointerId
  startX = event.clientX
  startY = event.clientY
  moved = false
  horizontal = false
  dragX.value = 0
  dragging.value = true
  stopAuto()
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
    event.pointerId,
  )
}
function onPointerMove(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== pointerId) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (!moved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
    moved = true
    horizontal = Math.abs(dx) > Math.abs(dy)
  }
  if (!moved || !horizontal) return
  dragX.value = Math.max(-80, Math.min(80, dx))
}
function onPointerUp(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== pointerId) return
  const dx = dragX.value
  dragging.value = false
  pointerId = undefined
  dragX.value = 0
  if (moved && horizontal && Math.abs(dx) >= 40) {
    goTo(currentPose.value + (dx < 0 ? 1 : -1))
  } else if (!moved) {
    goTo(currentPose.value + 1)
  } else {
    resetAuto()
  }
  moved = false
  horizontal = false
}
function onPointerCancel(): void {
  if (!dragging.value) return
  dragging.value = false
  pointerId = undefined
  dragX.value = 0
  moved = false
  horizontal = false
  resetAuto()
}
function onWheel(event: WheelEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select')) return
  if (
    Math.abs(event.deltaX) < 2 ||
    Math.abs(event.deltaX) < Math.abs(event.deltaY) * 0.75
  )
    return
  event.preventDefault()
  stopAuto()
  const direction = Math.sign(event.deltaX)
  if (wheelDirection !== 0 && direction !== wheelDirection) wheelTotal = 0
  wheelDirection = direction
  wheelTotal += event.deltaX
  if (!wheelLocked && Math.abs(wheelTotal) > 24) {
    goTo(currentPose.value + (direction > 0 ? 1 : -1))
    wheelTotal = 0
    wheelLocked = true
  }
  if (wheelTimer !== undefined) window.clearTimeout(wheelTimer)
  wheelTimer = window.setTimeout(() => {
    wheelTotal = 0
    wheelDirection = 0
    wheelLocked = false
    resetAuto()
  }, 180)
}

const name = ref(props.state?.settings.petName ?? '麻薯')
const saved = ref(false)
const value = computed(() => name.value.trim())
const currentName = computed(() => props.state?.settings.petName ?? '')
const existingNames = computed(
  () => props.state?.petCreate.existingNames ?? [],
)
const nameConflict = computed(() => {
  if (!value.value) return false
  const others = existingNames.value.filter(
    (item) => normalizePetName(item) !== normalizePetName(currentName.value),
  )
  return petNameConflict(value.value, others)
})
const canSave = computed(
  () =>
    value.value.length > 0 &&
    value.value !== currentName.value &&
    !nameConflict.value,
)

watch(
  () => props.state?.settings.petName,
  (next) => {
    if (next) name.value = next
  },
)
watch(
  () => props.state?.profileOpen,
  (open) => {
    if (open) {
      if (currentPose.value !== 0) {
        skipPoseTransition.value = true
        currentPose.value = 0
        void nextTick(() => {
          skipPoseTransition.value = false
        })
      }
      startAuto()
    } else {
      stopAuto()
    }
  },
)
watch(
  () => props.state?.petAssets?.id ?? props.state?.settings.petId,
  () => {
    currentPose.value = 0
    resetAuto()
  },
)
onMounted(() => {
  motionQuery.addEventListener('change', onMotionChange)
  if (props.state?.profileOpen) startAuto()
})
onUnmounted(() => {
  motionQuery.removeEventListener('change', onMotionChange)
  stopAuto()
  if (wheelTimer !== undefined) window.clearTimeout(wheelTimer)
})
function save(): void {
  if (!canSave.value) return
  emit('command', {
    type: 'settings-update',
    patch: { petName: value.value },
  })
  saved.value = true
  window.setTimeout(() => {
    saved.value = false
  }, 1200)
}
function close(): void {
  emit('command', { type: 'profile-close' })
}
</script>

<template>
  <main class="profile-shell" @keydown.esc="close">
    <section
      class="profile-surface"
      aria-label="宠物档案"
      @wheel="onWheel"
    >
      <PanelHeader
        title="宠物档案"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div class="profile-carousel">
        <div
          class="profile-portrait"
          :class="{ 'is-dragging': dragging }"
          role="tabpanel"
          :aria-label="`${name || '麻薯'}的${currentPoseImage.label}状态`"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <div class="profile-pose-stage" :style="dragStyle">
            <Transition
              :css="!skipPoseTransition"
              name="profile-pose"
              mode="out-in"
            >
              <img
                :key="currentPoseImage.id"
                :src="currentPoseImage.src"
                :alt="`${name || '麻薯'}的${currentPoseImage.label}状态`"
                draggable="false"
              />
            </Transition>
          </div>
          <button
            type="button"
            class="profile-preview profile-preview-prev"
            aria-label="上一张"
            title="上一张"
            @pointerdown.stop
            @pointerup.stop
            @click.stop="previousPose"
          >
            <ChevronLeft
              :size="28"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="profile-preview profile-preview-next"
            aria-label="下一张"
            title="下一张"
            @pointerdown.stop
            @pointerup.stop
            @click.stop="nextPose"
          >
            <ChevronRight
              :size="28"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </div>
        <div class="profile-pose-dots" role="tablist" aria-label="桌宠状态">
          <button
            v-for="(pose, index) in poseImages"
            :key="pose.id"
            type="button"
            class="profile-pose-dot"
            :class="{ active: index === currentPose }"
            role="tab"
            :aria-selected="index === currentPose"
            :aria-label="`查看${pose.label}状态`"
            :title="pose.label"
            @click="goTo(index)"
          />
        </div>
      </div>

      <div class="profile-body">
        <div class="profile-row">
          <span class="profile-label">名字</span>
          <span class="profile-edit">
            <input
              v-model="name"
              type="text"
              maxlength="20"
              aria-label="宠物名字"
              :aria-invalid="nameConflict"
              :aria-describedby="
                nameConflict ? 'profile-name-conflict' : undefined
              "
              @keydown.enter.prevent="save"
            />
            <button
              type="button"
              class="profile-save"
              :disabled="!canSave"
              aria-label="保存名字"
              title="保存"
              @click="save"
            >
              保存
            </button>
          </span>
        </div>
      </div>

      <p v-if="saved" class="profile-notice" role="status">名字已保存</p>
      <p
        v-if="nameConflict"
        id="profile-name-conflict"
        class="profile-error"
        role="alert"
      >
        {{ petNameConflictError }}
      </p>
      <p v-if="error" class="profile-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.profile-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.profile-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.profile-carousel {
  display: flex;
  flex-direction: column;
}
.profile-portrait {
  position: relative;
  display: grid;
  place-items: center;
  height: 236px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  cursor: grab;
  touch-action: pan-y;
}
.profile-portrait.is-dragging {
  cursor: grabbing;
}
.profile-preview {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-brand-ink);
  cursor: pointer;
  transform: translateY(-50%);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.profile-preview-prev {
  left: 8px;
}
.profile-preview-next {
  right: 8px;
}
.profile-preview:hover,
.profile-preview:focus-visible {
  background: var(--color-brand-soft);
  color: var(--color-brand-pressed);
}
.profile-preview:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.profile-pose-stage {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}
.profile-portrait img {
  width: 180px;
  height: 180px;
  object-fit: contain;
}
.profile-pose-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  margin-top: 8px;
}
.profile-pose-dot {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  cursor: pointer;
}
.profile-pose-dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-action-cover);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.profile-pose-dot:hover::before {
  background: var(--color-brand);
}
.profile-pose-dot.active::before {
  background: var(--color-brand-ink);
  transform: scale(1.15);
}
.profile-pose-dot:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.profile-pose-enter-active,
.profile-pose-leave-active {
  transition:
    opacity 0.16s var(--ease-standard),
    transform 0.2s var(--ease-standard);
}
.profile-pose-enter-from {
  opacity: 0;
  transform: scale(0.98);
}
.profile-pose-leave-to {
  opacity: 0;
  transform: scale(1.02);
}
.profile-body {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  font-size: var(--font-size-body);
}
.profile-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-ink);
}
.profile-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}
.profile-edit input {
  width: 150px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.profile-edit input:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.profile-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-width: 0;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.profile-save:hover:not(:disabled) {
  background: var(--color-brand);
  color: var(--color-on-brand);
}
.profile-save:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.profile-save:disabled {
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  cursor: default;
}
.profile-notice {
  margin: 10px 0 0;
  color: var(--color-brand-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.profile-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
@media (prefers-reduced-motion: reduce) {
  .profile-pose-enter-active,
  .profile-pose-leave-active,
  .profile-pose-dot::before,
  .profile-preview {
    transition: none;
  }
}
</style>
