import { _electron as electron, expect, test } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

// Independently transcribed from the requested screenshots and Ark model IDs.
const requested = [
  ['kimi-k3-1-pro-261024', 'Kimi-K3.1-Pro'],
  ['deepseek-v4-1-flash-economy-261017', 'DeepSeek-V4.1-Flash经济版'],
  ['doubao-seed-2-1-lite-260915', 'Doubao Seed 2.1 Lite'],
  ['deepseek-v4-1-flash-261017', 'DeepSeek-V4.1-Flash'],
  ['glm-5-3-flash-260828', 'GLM-5.3-Flash'],
  ['deepseek-v4-pro-ga-260813', 'DeepSeek-V4-Pro正式版'],
  ['deepseek-v4-flash-ga-260731', 'DeepSeek-V4-Flash正式版'],
  ['glm-5-2-260617', 'GLM-5.2'],
  ['doubao-seed-evolving', 'Doubao Seed Evolving'],
  ['doubao-seed-2-1-turbo-260628', 'Doubao Seed 2.1 Turbo'],
  ['doubao-seed-2-0-mini-260428', 'Doubao Seed 2.0 Mini'],
  ['doubao-seed-2-0-lite-260428', 'Doubao Seed 2.0 Lite'],
  ['doubao-seed-2-1-pro-260915', 'Doubao Seed 2.1 Pro'],
] as const

test('方舟 Key 模型列表过滤未接入型号并支持切换', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mqmz-ark-models-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  env.MQMZ_DATA_DIR = join(root, 'data')
  env.MQMZ_SCREENSHOT_DIR = join(root, 'shots')
  await mkdir(env.MQMZ_DATA_DIR, { recursive: true })
  await mkdir(env.MQMZ_SCREENSHOT_DIR, { recursive: true })
  delete env.ELECTRON_RUN_AS_NODE
  const application = await electron.launch({ args: [resolve('.')], env })
  try {
    await waitForAppWindows(application)
    const pages = await Promise.all(application.windows().map(async (page) => ({ page, title: await page.title() })))
    const agent = pages.find((item) => item.title.includes('智能体'))!.page
    const settings = pages.find((item) => item.title.includes('设置'))!.page
    const removed = ['deepseek-v4-pro-260425', 'doubao-seed-2-0-code-preview-260215', 'doubao-seed-2-0-pro-260215']
    const extra = [...removed, 'unrelated-model', 'doubao-seedream-5-5-261028', 'doubao-seedream-4-5-251128']
    await application.evaluate((_electron, ids) => {
      globalThis.fetch = async () => Response.json({ data: ids.map((id) => ({ id })) })
    }, [...requested.map(([id]) => id), ...extra])
    await agent.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
    await settings.evaluate(() => window.mqmz!.command({ type: 'settings-section', section: 'ai' }))
    const row = settings.locator('.settings-row').filter({ hasText: '火山方舟' })
    await row.getByRole('button', { name: '添加', exact: true }).click()
    await settings.getByLabel('火山方舟 API Key').fill('ark-test-fixture')
    await row.getByRole('button', { name: '测试', exact: true }).click()
    const preview = settings.getByLabel('火山方舟可用模型')
    await expect(preview.locator('option')).toHaveCount(15) // placeholder, 13 text models and Seedream 5.5
    for (const [id, label] of requested)
      await expect(preview.locator(`option[value="${id}"]`)).toHaveText(label)
    await expect(preview.locator('option[value="doubao-seedream-5-5-261028"]')).toHaveText('Doubao Seedream 5.5')
    for (const id of [...removed, 'unrelated-model', 'doubao-seedream-4-5-251128'])
      await expect(preview.locator(`option[value="${id}"]`)).toHaveCount(0)
    await settings.locator('.settings-field-end').last().getByRole('button', { name: '添加', exact: true }).click()
    await expect.poll(async () => {
      const result = await agent.evaluate(() => window.mqmz!.snapshot())
      return result.ok ? result.value.ai.volcano.models?.length : 0
    }).toBe(19)
    await expect(row.getByRole('button', { name: '模型列表' })).toBeVisible()
    await row.getByRole('button', { name: '模型列表' }).click()
    const savedPreview = settings.getByLabel('火山方舟可用模型')
    await expect(savedPreview.locator('option')).toHaveCount(14)
    for (const id of removed) await expect(savedPreview.locator(`option[value="${id}"]`)).toHaveCount(0)
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-config', apiKey: 'sk-agent-test' }))
    const select = settings.getByLabel('默认对话模型')
    await expect(select.locator('optgroup[label="DeepSeek"] option[value="deepseek-v4-pro"]')).toHaveCount(1)
    for (const id of removed) await expect(select.locator(`option[value="${id}"]`)).toHaveCount(0)
    for (const [id, label] of requested) {
      await expect(select.locator(`option[value="${id}"]`)).toHaveText(label)
      await expect(select.locator(`option[value="${id}"]`)).toBeEnabled()
      await select.selectOption(id)
      await expect.poll(async () => {
        const result = await settings.evaluate(() => window.mqmz!.snapshot())
        return result.ok ? result.value.settings.agentDefaultChatModel : ''
      }).toBe(id)
    }
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
    for (const [id, label] of requested) {
      await agent.locator('.agent-model-trigger').click()
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const exact = agent.locator('.agent-model-group-toggle[aria-label="火山方舟"] ~ .agent-model-option')
        .filter({ has: agent.locator('.agent-model-option-label').filter({ hasText: new RegExp(`^${escaped}$`) }) })
      await expect(exact).toBeEnabled()
      const expectedBrand = id.startsWith('kimi-') ? 'kimi' : id.startsWith('glm-') ? 'zhipu' : id.startsWith('deepseek-') ? 'deepseek' : 'doubao'
      const mark = exact.locator('.model-brand-mark')
      await expect(mark).toHaveAttribute('data-model-brand', expectedBrand)
      if (expectedBrand === 'kimi' || expectedBrand === 'zhipu')
        await expect.poll(() => mark.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      await exact.click()
      await expect.poll(async () => {
        const result = await agent.evaluate(() => window.mqmz!.snapshot())
        return result.ok ? result.value.agent.selectedModel : ''
      }).toBe(id)
    }
    await agent.locator('.agent-model-trigger').click()
    await agent.locator('.agent-model-option-label').filter({ hasText: /^DeepSeek-V4-Pro$/ }).locator('..').click()
    await expect.poll(async () => {
      const result = await agent.evaluate(() => window.mqmz!.snapshot())
      return result.ok ? result.value.agent.selectedModel : ''
    }).toBe('deepseek-v4-pro')
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-reasoning', reasoning: 'off' }))
    await agent.locator('.agent-model-trigger').click()
    await agent.locator('.agent-model-option-label').filter({ hasText: /^Kimi-K3\.1-Pro$/ }).locator('..').click()
    await expect.poll(async () => {
      const result = await agent.evaluate(() => window.mqmz!.snapshot())
      return result.ok ? result.value.agent.reasoning : ''
    }).toBe('low')
    await agent.locator('.agent-model-trigger').click()
    await expect(agent.getByRole('menuitemradio', { name: '关闭', exact: true })).toHaveCount(0)
    await agent.locator('.agent-model-trigger').click()

    const unavailable = ['kimi-k3-1-pro-261024']
    await application.evaluate((_electron, ids) => {
      globalThis.fetch = async () => Response.json({ data: ids.map((id) => ({ id })) })
    }, requested.map(([id]) => id).filter((id) => !unavailable.includes(id)))
    await agent.evaluate(() => window.mqmz!.command({ type: 'volcano-models' }))
    await expect.poll(async () => {
      const result = await agent.evaluate(() => window.mqmz!.snapshot())
      return result.ok ? result.value.ai.volcano.models?.length : 0
    }).toBe(12)
    for (const id of unavailable)
      await expect(select.locator(`option[value="${id}"]`)).toBeDisabled()
    await agent.locator('.agent-model-trigger').click()
    await expect(agent.locator('.agent-model-option-label').filter({ hasText: /^Kimi-K3\.1-Pro$/ }).locator('..')).toBeDisabled()
    await expect(agent.locator('.agent-model-option-label').filter({ hasText: /^Doubao Seed 2\.0 Code$/ })).toHaveCount(0)
  } finally {
    await application.close()
    await rm(root, { recursive: true, force: true })
  }
})
