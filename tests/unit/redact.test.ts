import { describe, expect, test } from 'vitest'
import { redactSecrets } from '../../src/shared/redact'

describe('secret redaction', () => {
  test('masks provider keys and bearer tokens', () => {
    expect(redactSecrets('key sk-abcdef1234567890xyz failed')).toBe(
      'key sk-*** failed',
    )
    expect(redactSecrets('Authorization: Bearer abcdef1234567890')).toContain(
      'Bearer ***',
    )
  })

  test('masks query parameters and form fields', () => {
    const text = 'GET /v1?api_key=secret123&x=1 password=hunter2'
    const masked = redactSecrets(text)
    expect(masked).not.toContain('secret123')
    expect(masked).not.toContain('hunter2')
    expect(masked).toContain('x=1')
  })

  test('masks JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk'
    expect(redactSecrets(`token ${jwt}`)).toBe('token ***')
  })

  test('keeps ordinary error text intact', () => {
    const text = 'connect ECONNREFUSED 127.0.0.1:1'
    expect(redactSecrets(text)).toBe(text)
  })
})
