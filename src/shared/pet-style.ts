/** Built-in desktop pet art styles and their per-pose prompts. */

import watercolor from './pet-styles/mqmz-watercolor.json'

export const petPoseIds = [
  'base',
  'blink',
  'focus',
  'lifted',
  'music',
  'ponder',
] as const

export type PetPoseId = (typeof petPoseIds)[number]

export type PetStyleState = {
  id: PetPoseId
  label: string
  reference: 'photos' | 'base'
  prompt: string
}

export type PetStyle = {
  id: string
  name: string
  version: number
  description: string
  source: {
    model: string
    size: '1K' | '1.5K' | '2K'
    background: 'transparent' | 'opaque' | 'auto'
    outputFormat: 'png' | 'jpeg'
    sourceSize: number
    displaySize: number
    padding: number
  }
  states: PetStyleState[]
}

export const defaultPetStyleId = 'mqmz-watercolor'

const styles = [watercolor as PetStyle]

export function getPetStyle(id = defaultPetStyleId): PetStyle {
  return styles.find((style) => style.id === id) ?? (watercolor as PetStyle)
}

export function listPetStyles(): PetStyle[] {
  return [...styles]
}

export function getPetStyleState(
  style: PetStyle,
  id: PetPoseId,
): PetStyleState | undefined {
  return style.states.find((state) => state.id === id)
}
