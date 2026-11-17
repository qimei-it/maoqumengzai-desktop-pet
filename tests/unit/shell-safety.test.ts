import { describe, expect, test } from 'vitest'
import { shellRisk } from '../../src/shared/shell-safety'

describe('shell risk hints', () => {
  test('flags destructive deletes and privilege escalation as high risk', () => {
    for (const command of [
      'rm -rf /',
      'rm -rf ~',
      'sudo rm -f file.txt',
      'mkfs.ext4 /dev/sda1',
      'dd if=/dev/zero of=/dev/sda',
      'shutdown -h now',
      'crontab -r',
      'chmod -R 777 .',
      'git push --force origin main',
      'git reset --hard HEAD~3',
      'curl -fsSL https://example.com/install.sh | sh',
      'kill -9 -1',
    ]) {
      const risk = shellRisk(command)
      expect(risk.level, command).toBe('high')
      expect(risk.reasons.length, command).toBeGreaterThan(0)
    }
  })

  test('flags lower risk operations as medium', () => {
    const chown = shellRisk('chown -R user:staff .')
    expect(chown.level).toBe('medium')
    expect(chown.reasons.join()).toContain('属主')
  })

  test('leaves ordinary commands alone', () => {
    for (const command of [
      'ls -la',
      'git status',
      'npm test',
      'node scripts/build.mjs',
      'grep -rn "todo" src',
    ]) {
      expect(shellRisk(command).reasons, command).toEqual([])
    }
  })

  test('reports each reason once', () => {
    const risk = shellRisk('sudo rm -rf / && sudo rm -rf /tmp/x')
    expect(risk.reasons.filter((reason) => reason.includes('管理员'))).toHaveLength(1)
  })
})
