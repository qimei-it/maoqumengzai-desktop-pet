/** Verification-code extraction for mail bodies, kept pure for unit tests. */

export type DetectedMailCode = {
  code: string
  expiresAt?: number
}

const CODE_CONTEXT =
  /(?:验证码|校验码|动态码|动态密码|动态口令|确认码|安全码|登录码|验证代码|verification\s*code|security\s*code|one[\s-]*time\s*(?:code|password)|otp|passcode|login\s*code|auth(?:entication)?\s*code)/gi

const DIGIT_SEQUENCE = /(?<!\d)(\d(?:[\s-]?\d){3,7})(?!\d)/g

const BEFORE_EXCLUDE =
  /(?:订单|快递|运单|物流|手机号|手机|电话|金额|价格|日期|时间|编号)[^\d]{0,10}$/

const AFTER_EXCLUDE =
  /^\s*(?:元|分钟|分|小时|钟头|天|年|月|日|个|次|位|条|件)/

type Candidate = { code: string; score: number }

function addCandidate(
  list: Candidate[],
  raw: string,
  before: string,
  after: string,
  score: number,
): void {
  const code = raw.replace(/[\s-]/g, '')
  if (code.length < 4 || code.length > 8) return
  if (BEFORE_EXCLUDE.test(before)) return
  if (AFTER_EXCLUDE.test(after)) return
  list.push({ code, score })
}

function collectAfterContext(source: string, score: number): Candidate[] {
  const found: Candidate[] = []
  for (const match of source.matchAll(CODE_CONTEXT)) {
    const start = (match.index ?? 0) + match[0].length
    const window = source.slice(start, start + 64)
    for (const candidate of window.matchAll(DIGIT_SEQUENCE)) {
      const index = candidate.index ?? 0
      addCandidate(
        found,
        candidate[1],
        window.slice(0, index),
        window.slice(index + candidate[0].length),
        score + Math.max(0, 64 - index),
      )
    }
  }
  return found
}

function collectBeforeContext(source: string, score: number): Candidate[] {
  const found: Candidate[] = []
  for (const match of source.matchAll(CODE_CONTEXT)) {
    const index = match.index ?? 0
    const window = source.slice(Math.max(0, index - 20), index)
    for (const candidate of window.matchAll(DIGIT_SEQUENCE)) {
      const start = candidate.index ?? 0
      addCandidate(
        found,
        candidate[1],
        window.slice(0, start),
        window.slice(start + candidate[0].length),
        score + Math.max(0, 20 - (window.length - start)),
      )
    }
  }
  return found
}

function expiryMinutes(source: string): number | undefined {
  const patterns = [
    /(\d{1,3})\s*(分钟|分|小时|钟头|天)\s*(?:内|之内)?\s*(?:有效|过期|失效)/i,
    /有效(?:期|时间)?\s*(?:为|是|：|:)?\s*(\d{1,3})\s*(分钟|分|小时|钟头|天)/i,
    /(?:expires?|valid)\s*(?:in|for|within)?\s*(\d{1,3})\s*(minutes?|mins?|hours?|days?)/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(source)
    if (!match) continue
    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) continue
    const unit = match[2].toLowerCase()
    const minutes =
      unit.startsWith('小时') || unit.startsWith('钟头') || unit.startsWith('hour')
        ? amount * 60
        : unit.startsWith('天') || unit.startsWith('day')
          ? amount * 24 * 60
          : amount
    if (minutes > 10080) continue
    return minutes
  }
  return undefined
}

/**
 * Finds the most plausible numeric verification code. A code is only emitted
 * when the mail contains an explicit verification context, which keeps order
 * numbers, phone numbers and amounts from being mistaken for codes.
 */
export function detectVerificationCode(
  subject: string,
  text: string,
  receivedAt = Date.now(),
): DetectedMailCode | undefined {
  const body = text.replace(/\u00a0/g, ' ')
  const candidates = [
    ...collectAfterContext(subject, 2000),
    ...collectAfterContext(body, 1000),
    ...collectBeforeContext(body, 500),
    ...collectBeforeContext(subject, 200),
  ]
  if (!candidates.length) return undefined
  const best = candidates.reduce((current, candidate) =>
    candidate.score > current.score ? candidate : current,
  )
  const minutes = expiryMinutes(`${subject}\n${body}`)
  return {
    code: best.code,
    ...(minutes
      ? { expiresAt: receivedAt + minutes * 60_000 }
      : {}),
  }
}
