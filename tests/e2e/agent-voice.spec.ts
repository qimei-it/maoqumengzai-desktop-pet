import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-voice-'))
  const data = join(directory, 'data')
  await mkdir(data, { recursive: true })
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = data
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true })
  application = await electron.launch({
    args: [
      resolve('.'),
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
    env: environment,
  })
  await waitForAppWindows(application)
  const pages = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  )
  agent = pages.find((item) => item.title.includes('智能体'))!.page
})

test.afterAll(async () => {
  await application.close()
})

test('records a voice message and offers read-aloud', async () => {
  // Voice input and read-aloud were removed in 104d161; re-enable when the
  // feature returns to the composer.
  test.skip(true, '语音输入与朗读当前未在输入框提供')
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-voice-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
  await application.evaluate(() => {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/tools/asr'))
        return new Response(JSON.stringify({ text: '今天天气不错' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      if (url.includes('/chat/completions'))
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: '好的' } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      return new Response('{}', { status: 503 })
    }
  })

  await agent.getByLabel('语音输入').click()
  await expect(agent.getByLabel('停止录音')).toBeVisible()
  await agent.waitForTimeout(900)
  await agent.getByLabel('停止录音').click()
  await expect(agent.getByLabel('给智能体发送指令')).toHaveText(
    /今天天气不错/,
    { timeout: 15_000 },
  )

  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('好的')).toBeVisible({ timeout: 15_000 })
  await expect(
    agent
      .locator('.agent-message.assistant')
      .last()
      .getByRole('button', { name: '朗读' }),
  ).toBeVisible()
})
