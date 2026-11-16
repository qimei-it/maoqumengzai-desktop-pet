import { describe, expect, test } from 'vitest'
import {
  getPetStyle,
  getPetStyleState,
  listPetStyles,
  petPoseIds,
} from '../../src/shared/pet-style'

describe('built-in pet styles', () => {
  test('exposes the complete six-pose watercolor style', () => {
    const style = getPetStyle()
    expect(style.id).toBe('mqmz-watercolor')
    expect(style.states.map((state) => state.id)).toEqual([...petPoseIds])
    expect(style.states[0]?.reference).toBe('photos')
    expect(
      style.states.slice(1).every((state) => state.reference === 'base'),
    ).toBe(true)
    expect(listPetStyles()).toHaveLength(1)
  })

  test('fixes transparent Seedream parameters', () => {
    const { source } = getPetStyle()
    expect(source).toMatchObject({
      model: 'doubao-seedream-5-5-261028',
      size: '1K',
      background: 'transparent',
      outputFormat: 'png',
      sourceSize: 1024,
      displaySize: 448,
    })
    expect(source.padding).toBeCloseTo(0.08)
  })

  test('keeps prompts generic and complete', () => {
    const style = getPetStyle()
    for (const id of petPoseIds) {
      const state = getPetStyleState(style, id)
      expect(state).toBeDefined()
      expect(state?.prompt.length).toBeGreaterThan(60)
      expect(state?.prompt).toContain('透明')
      expect(state?.prompt).not.toMatch(/布偶|ragdoll|蓝眼睛|奶白色/i)
    }
  })

  test('keeps one outfit across multiple photos and all poses', () => {
    const style = getPetStyle()
    const base = getPetStyleState(style, 'base')
    expect(base?.prompt).toContain('同一只宠物的照片')
    expect(base?.prompt).toContain('有多张时综合判断')
    expect(base?.prompt).toContain('同一套')
    for (const id of petPoseIds) {
      const state = getPetStyleState(style, id)
      expect(state?.prompt).toContain('衣服')
      expect(state?.prompt).toContain('配饰')
      expect(state?.prompt).not.toContain('不穿衣服')
    }
  })
})
