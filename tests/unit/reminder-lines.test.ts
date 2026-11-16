import { describe, expect, test } from 'vitest'
import {
  reminderLine,
  reminderLineMaxChars,
  type ReminderKind,
  type ReminderVars,
} from '../../src/shared/reminder-lines'

const kinds: ReminderKind[] = [
  'water',
  'sitting',
  'eyes',
  'focusDone',
  'breakDone',
  'todo',
  'quotaLow',
  'balanceLow',
  'quotaError',
]

const baseVars: ReminderVars = {
  name: '麻薯',
  count: 3,
  goal: 8,
  todo: '交周报',
  more: 2,
  left: '8%',
  service: 'OpenAI 额度',
}

function drawPool(kind: ReminderKind, vars: ReminderVars): string[] {
  const lines = new Set<string>()
  for (let step = 0; step < 40; step += 1) {
    lines.add(reminderLine(kind, vars, [], () => step / 40))
  }
  return [...lines]
}

describe('reminder lines', () => {
  test('every line speaks to the owner first', () => {
    for (const kind of kinds) {
      for (const line of drawPool(kind, baseVars)) {
        expect(line.startsWith('主人，')).toBe(true)
        expect(line).not.toMatch(/\{(name|todo|count|goal|more|service)\}/)
      }
    }
  })

  test('lines stay inside the bubble width budget', () => {
    const longVars: ReminderVars = {
      name: '甲乙丙丁戊己庚辛',
      count: 123,
      goal: 456,
      todo: '子丑寅卯辰巳午未申酉戌亥',
      more: 12,
      left: '¥123.45',
    }
    for (const kind of kinds) {
      for (const line of drawPool(kind, longVars)) {
        expect(Array.from(line).length).toBeLessThanOrEqual(reminderLineMaxChars)
        expect(line).not.toContain('庚辛')
        expect(line).not.toContain('酉')
      }
    }
    expect(drawPool('sitting', longVars).some((line) => line.includes('甲乙丙丁戊己'))).toBe(
      true,
    )
  })

  test('water lines can carry today progress', () => {
    const lines = drawPool('water', { name: '麻薯', count: 3, goal: 8 })
    for (const line of lines) {
      expect(line).not.toContain('{count}')
      expect(line).not.toContain('{goal}')
    }
    expect(lines.some((line) => line.includes('3'))).toBe(true)
    expect(lines.some((line) => line.includes('8'))).toBe(true)
  })

  test('todo lines use the due text and item count', () => {
    const lines = drawPool('todo', baseVars)
    expect(lines.some((line) => line.includes('交周报'))).toBe(true)
    expect(lines.some((line) => line.includes('2 件'))).toBe(true)
    for (const line of lines) expect(line).not.toContain('{todo}')
  })

  test('todo text is clipped before it enters the line', () => {
    const long = drawPool('todo', {
      name: '麻薯',
      todo: '把季度报告的第一版整理出来发给我',
    })
    expect(long.every((line) => Array.from(line).length <= reminderLineMaxChars)).toBe(
      true,
    )
    expect(long.some((line) => line.includes('把季度报告的第'))).toBe(true)
  })

  test('consecutive lines avoid the recent ones', () => {
    for (const kind of kinds) {
      const first = reminderLine(kind, baseVars, [], () => 0)
      const second = reminderLine(kind, baseVars, [first], () => 0)
      expect(second).not.toBe(first)
      expect(second.startsWith('主人，')).toBe(true)
    }
  })

  test('the pool wraps instead of running dry', () => {
    for (const kind of kinds) {
      const pool = drawPool(kind, baseVars)
      const recent = [...pool]
      const line = reminderLine(kind, baseVars, recent, () => 0.5)
      expect(pool).toContain(line)
    }
  })

  test('missing data falls back to a plain line', () => {
    for (const kind of kinds) {
      const line = reminderLine(kind, {}, [], () => 0.5)
      expect(line.startsWith('主人，')).toBe(true)
      expect(line).not.toMatch(/\{(name|todo|count|goal|more|service)\}/)
    }
    expect(reminderLine('todo', {}, [], () => 0)).toBe('主人，有件事到时间啦')
  })

  test('quota errors name the provider service', () => {
    const openai = drawPool('quotaError', { service: 'OpenAI 额度' })
    expect(openai.length).toBeGreaterThan(0)
    expect(openai.every((line) => line.includes('OpenAI 额度'))).toBe(true)
    const deepseek = drawPool('quotaError', { service: 'DeepSeek 余额' })
    expect(deepseek.every((line) => line.includes('DeepSeek 余额'))).toBe(true)
  })
})
