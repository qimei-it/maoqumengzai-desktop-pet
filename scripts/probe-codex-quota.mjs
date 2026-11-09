#!/usr/bin/env node
/**
 * P0 probe: read OpenAI/Codex subscription usage through the locally
 * authenticated Codex app server.
 *
 * It never prints e-mail addresses, tokens or raw account objects; only the
 * plan type, rate-limit windows and aggregate usage counters.
 *
 * Usage: node scripts/probe-codex-quota.mjs
 */
import { spawn } from 'node:child_process'

const timeoutMs = 25_000
const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] })
const responses = new Map()
let buffer = ''
let stderr = ''
let finished = false

child.on('error', () => finish('codex-unavailable'))
child.stderr.on('data', (chunk) => {
  stderr = (stderr + chunk.toString()).slice(-2000)
})
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    try {
      const message = JSON.parse(line)
      if (message.id !== undefined) responses.set(message.id, message)
    } catch {
      /* The server may log non-JSON lines to stdout. */
    }
  }
})

const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
send({
  id: 1,
  method: 'initialize',
  params: {
    clientInfo: { name: 'mqmz_p0_probe', version: '0.0.1' },
    capabilities: { experimentalApi: true },
  },
})
send({ id: 2, method: 'initialized' })
send({ id: 3, method: 'account/read', params: {} })
send({ id: 4, method: 'account/rateLimits/read', params: {} })
send({ id: 5, method: 'account/usage/read', params: {} })

const timer = setTimeout(() => finish('timeout'), timeoutMs)
setTimeout(() => finish('done'), 12_000)

function errorOf(message) {
  if (!message) return null
  if (message.error) return String(message.error.message || 'error').slice(0, 200)
  return null
}

function windowOf(window) {
  if (!window) return null
  return {
    usedPercent: window.usedPercent ?? null,
    windowMinutes: window.windowDurationMins ?? null,
    resetsAt: window.resetsAt ?? null,
  }
}

function finish(reason) {
  if (finished) return
  finished = true
  clearTimeout(timer)
  const initialize = responses.get(1)
  const account = responses.get(3)
  const rateLimits = responses.get(4)
  const usage = responses.get(5)
  const limits = rateLimits?.result?.rateLimits
  const report = {
    reason,
    source: 'codex app-server · account/rateLimits/read',
    codexUserAgent: initialize?.result?.userAgent ?? null,
    account: account?.result?.account
      ? { present: true, planType: account.result.account.planType ?? null }
      : { present: false, error: errorOf(account) },
    rateLimits: limits
      ? {
          planType: limits.planType ?? null,
          credits: limits.credits ?? null,
          primary: windowOf(limits.primary),
          secondary: windowOf(limits.secondary),
          rateLimitReachedType: limits.rateLimitReachedType ?? null,
        }
      : { error: errorOf(rateLimits) },
    usage: usage?.result?.summary ?? { error: errorOf(usage) },
    stderr: stderr.trim().slice(-300) || undefined,
  }
  console.log(JSON.stringify(report, null, 2))
  child.kill()
  process.exit(reason === 'done' ? 0 : 1)
}
