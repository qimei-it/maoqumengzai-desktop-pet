/** Built-in desktop pet art styles and their per-species pose prompts. */

import watercolor from './pet-styles/mqmz-watercolor.json'
import {
  petSpeciesGroup,
  type PetSpecies,
  type PetSpeciesGroup,
} from './pet-species'

export const petPoseIds = [
  'base',
  'blink',
  'focus',
  'lifted',
  'music',
  'ponder',
] as const

export type PetPoseId = (typeof petPoseIds)[number]

/**
 * One pose rendered for one species group. Body-plan and pose wording change
 * per group so a fish is never asked for fur, paws or a sitting posture.
 */
export type PetStyleVariant = {
  label: string
  prompt: string
}

export type PetStyleState = {
  id: PetPoseId
  reference: 'photos' | 'base'
  variants: Record<PetSpeciesGroup, PetStyleVariant>
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
    /** Appended to every variant so transparency and margin rules live once. */
    commonSuffix: string
  }
  states: PetStyleState[]
}

export type ResolvedPetStyleState = {
  id: PetPoseId
  label: string
  reference: 'photos' | 'base'
  /** Variant prompt plus the shared transparency and margin constraints. */
  prompt: string
}

export const defaultPetStyleId = 'mqmz-watercolor'

const styles: PetStyle[] = [watercolor as PetStyle]

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

/** Resolve the pose wording for a species; unknown species fall back to `other`. */
export function resolvePetStyleState(
  style: PetStyle,
  id: PetPoseId,
  species?: PetSpecies | '',
): ResolvedPetStyleState | undefined {
  const state = getPetStyleState(style, id)
  if (!state) return undefined
  const group = petSpeciesGroup(species)
  const variant = state.variants[group] ?? state.variants.other
  if (!variant) return undefined
  return {
    id: state.id,
    label: variant.label,
    reference: state.reference,
    prompt: `${variant.prompt}${style.source.commonSuffix}`,
  }
}
