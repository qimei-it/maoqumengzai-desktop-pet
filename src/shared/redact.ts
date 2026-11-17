/**
 * Removes credentials from text that may end up in logs, events or error
 * bubbles. Applied to anything derived from a network error or a tool result.
 */

const patterns: Array<[RegExp, string]> = [
  // Provider keys and generic bearer tokens.
  [/\bsk-[A-Za-z0-9_-]{12,}/g, 'sk-***'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***'],
  // Query parameters and form fields that carry secrets.
  [
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization)=([^&\s"']+)/gi,
    '$1=***',
  ],
  // Long opaque tokens (JWTs, signed URLs) that are not caught above.
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '***'],
]

export function redactSecrets(text: string): string {
  let result = text
  for (const [pattern, replacement] of patterns) {
    result = result.replace(pattern, replacement)
  }
  return result
}
