import { describe, expect, test } from 'vitest'
import {
  getPetStyle,
  getPetStyleState,
  listPetStyles,
  petPoseIds,
  resolvePetStyleState,
} from '../../src/shared/pet-style'
import {
  petSpeciesGroup,
  petSpeciesGroupIds,
  petSpeciesOptions,
} from '../../src/shared/pet-species'

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
    expect(source.commonSuffix).toContain('透明')
    expect(source.commonSuffix).toContain('8%')
  })

  test('covers every species group on every pose', () => {
    const style = getPetStyle()
    for (const id of petPoseIds) {
      const state = getPetStyleState(style, id)
      expect(state).toBeDefined()
      expect(Object.keys(state!.variants).sort()).toEqual(
        [...petSpeciesGroupIds].sort(),
      )
      for (const group of petSpeciesGroupIds) {
        expect(state!.variants[group].prompt.length).toBeGreaterThan(60)
        expect(state!.variants[group].label.length).toBeGreaterThan(0)
      }
    }
  })

  test('keeps prompts free of the built-in cat identity', () => {
    const style = getPetStyle()
    for (const id of petPoseIds) {
      const state = getPetStyleState(style, id)!
      for (const group of petSpeciesGroupIds)
        expect(state.variants[group].prompt).not.toMatch(
          /布偶|ragdoll|蓝眼睛|奶白色/i,
        )
    }
  })

  test('every resolved prompt carries the shared transparency rules', () => {
    const style = getPetStyle()
    for (const id of petPoseIds) {
      for (const group of petSpeciesGroupIds) {
        const species = petSpeciesOptions.find(
          (option) => petSpeciesGroup(option) === group,
        )
        const resolved = resolvePetStyleState(style, id, species)
        expect(resolved).toBeDefined()
        expect(resolved!.prompt).toContain('透明')
        expect(resolved!.prompt).toContain('8%')
      }
    }
  })

  test('keeps one outfit across multiple photos and all poses', () => {
    const style = getPetStyle()
    const base = getPetStyleState(style, 'base')!
    for (const group of petSpeciesGroupIds.filter(
      (value) => value !== 'aquatic',
    )) {
      const prompt = base.variants[group].prompt
      expect(prompt).toContain('同一套')
      expect(prompt).toContain('不要换装或新增')
    }
    expect(base.variants.aquatic.prompt).toContain('没有衣服可穿')
    for (const id of petPoseIds) {
      const state = getPetStyleState(style, id)!
      for (const group of petSpeciesGroupIds) {
        expect(state.variants[group].prompt).not.toContain('不穿衣服')
      }
    }
  })
})

describe('species-aware pose wording', () => {
  const style = getPetStyle()

  test('mammals keep the sitting, fur and paw wording', () => {
    const prompt = getPetStyleState(style, 'base')!.variants.mammal.prompt
    expect(prompt).toContain('坐姿')
    expect(prompt).toContain('毛感柔软')
    expect(prompt).toContain('前爪')
  })

  test('a fish is asked for scales and fins, never fur or paws', () => {
    const prompt = getPetStyleState(style, 'base')!.variants.aquatic.prompt
    expect(prompt).toContain('鳞片')
    expect(prompt).toContain('鱼鳍')
    expect(prompt).toContain('头朝向观众')
    expect(prompt).toContain('侧转约 3/4')
    expect(prompt).not.toContain('毛感柔软')
    expect(prompt).not.toContain('前爪')
    expect(prompt).not.toContain('坐姿')
  })

  test('birds switch fur wording to feathers', () => {
    const prompt = getPetStyleState(style, 'base')!.variants.bird.prompt
    expect(prompt).toContain('羽毛')
    expect(prompt).not.toContain('毛感柔软')
    expect(prompt).not.toContain('前爪')
  })

  test('reptiles and arthropods switch fur wording to scales and shell', () => {
    const reptile = getPetStyleState(style, 'base')!.variants.reptile.prompt
    expect(reptile).toContain('鳞片')
    expect(reptile).toContain('蛇没有四肢')
    expect(reptile).not.toContain('毛感柔软')

    const arthropod = getPetStyleState(style, 'base')!.variants.arthropod.prompt
    expect(arthropod).toContain('甲壳')
    expect(arthropod).toContain('步足')
    expect(arthropod).not.toContain('毛感柔软')
  })

  test('every non-mammal base prompt forbids the fur body plan', () => {
    const base = getPetStyleState(style, 'base')!
    for (const group of petSpeciesGroupIds.filter(
      (value) => value !== 'mammal',
    )) {
      const prompt = base.variants[group].prompt
      expect(prompt).toMatch(/不要[^。]*毛|而不是哺乳动物的毛/)
    }
  })

  test('legless species are told not to grow limbs', () => {
    const reptile = getPetStyleState(style, 'base')!.variants.reptile.prompt
    expect(reptile).toContain('有几条腿就画几条腿')
    const focus = getPetStyleState(style, 'focus')!.variants.reptile.prompt
    expect(focus).toContain('不要凭空长出腿')
  })

  test('eyeless species get a motion frame instead of a blink', () => {
    expect(getPetStyleState(style, 'blink')!.variants.aquatic.label).toBe('微动')
    expect(
      getPetStyleState(style, 'blink')!.variants.arthropod.label,
    ).toBe('微动')
    expect(getPetStyleState(style, 'blink')!.variants.aquatic.prompt).toContain(
      '鱼没有眼睑',
    )
    expect(
      getPetStyleState(style, 'blink')!.variants.arthropod.prompt,
    ).toContain('节肢动物没有眼睑')
  })

  test('unknown or empty species fall back to the neutral wording', () => {
    const resolved = resolvePetStyleState(style, 'base', '')
    expect(resolved?.label).toBe('基础')
    expect(resolved?.prompt).toContain('不要把它画成猫或狗')
    expect(resolvePetStyleState(style, 'base', '其他')?.prompt).toBe(
      resolved?.prompt,
    )
  })
})
