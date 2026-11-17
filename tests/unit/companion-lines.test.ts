import { describe, expect, test } from 'vitest'
import {
  fileEatenLine,
  fileTransferLine,
  mailArrivalLine,
  musicAiDailyLimitLine,
  musicAiFallbackLine,
  reminderSnoozeLine,
  saveCopyLine,
  shelfReceivedLine,
  todoDoneLine,
} from '../../src/shared/companion-lines'

describe('companion lines', () => {
  test('shelf lines keep the destination visible', () => {
    expect(shelfReceivedLine('screenshot')).toBe('截图我收进置物架啦')
    expect(shelfReceivedLine('clipboard')).toBe('图片我收进置物架啦')
  })

  test('snooze lines answer in the pet voice and keep the kind', () => {
    expect(reminderSnoozeLine('water', 10)).toBe(
      '好，10 分钟后我再来叫你喝水',
    )
    expect(reminderSnoozeLine('sitting', 10)).toBe(
      '好，10 分钟后我再来叫你起来',
    )
    expect(reminderSnoozeLine('eyes', 10)).toBe(
      '好，10 分钟后我喊你看远处',
    )
  })

  test('snooze minutes stay inside the supported range', () => {
    expect(reminderSnoozeLine('water', 0)).toContain('1 分钟')
    expect(reminderSnoozeLine('water', 999)).toContain('60 分钟')
  })

  test('file actions read as the pet acting on the user behalf', () => {
    expect(fileEatenLine()).toBe('吃掉啦，7 天内到置物架找我')
    expect(saveCopyLine()).toBe('副本保存好啦')
    expect(fileTransferLine('copy', '报告.pdf', 1, '归档')).toBe(
      '我把「报告.pdf」复制到「归档」啦',
    )
    expect(fileTransferLine('move', '报告.pdf', 3, '归档')).toBe(
      '我把「报告.pdf」等 3 项移动到「归档」啦',
    )
  })

  test('AI fallback keeps the cause and reassures the user', () => {
    expect(musicAiFallbackLine('key')).toContain('Key 失效')
    expect(musicAiFallbackLine('balance')).toContain('余额不足')
    expect(musicAiFallbackLine('rate')).toContain('请求过多')
    expect(musicAiFallbackLine('network')).toContain('连不上')
    expect(musicAiFallbackLine('other')).toContain('生成失败')
    for (const reason of ['key', 'balance', 'rate', 'network', 'other'] as const)
      expect(musicAiFallbackLine(reason)).toContain('我先用自己的话陪你听')
    expect(musicAiDailyLimitLine()).toContain('我先用自己的话陪你听')
  })

  test('todo completion clips long text and still praises', () => {
    expect(todoDoneLine('交周报')).toBe('「交周报」完成啦，真棒')
    expect(todoDoneLine('把季度报告的第一版整理出来发给我')).toBe(
      '「把季度报告的第一版」完成啦，真棒',
    )
    expect(todoDoneLine('   ')).toBe('又完成一件，真棒')
  })

  test('mail arrival greets the owner', () => {
    expect(mailArrivalLine()).toBe('主人，来邮件啦')
  })
})
