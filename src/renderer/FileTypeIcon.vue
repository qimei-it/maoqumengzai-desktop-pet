<script setup lang="ts">
import { computed } from 'vue'
import { fileIconFor } from './file-icons'

const props = withDefaults(
  defineProps<{ name: string; size?: number }>(),
  { size: 18 },
)
const source = computed(() => fileIconFor(props.name))
</script>

<template>
  <img
    :src="source"
    :width="size"
    :height="size"
    class="file-type-icon"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
</template>

<style scoped>
.file-type-icon {
  display: block;
  flex: none;
  object-fit: contain;
}
</style>
