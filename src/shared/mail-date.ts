/** Date labels used by the mail list and reader. */
function parts(value: number): {
  date: Date
  day: string
  month: string
  year: string
} {
  const date = new Date(value)
  return {
    date,
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()),
  }
}

export function formatMailListDate(
  value: number | undefined,
  now = Date.now(),
): string {
  if (!value) return ''
  const { date, day, month, year } = parts(value)
  return date.getFullYear() === new Date(now).getFullYear()
    ? `${month}/${day}`
    : `${year}/${month}/${day}`
}

export function formatMailDateTime(
  value: number | undefined,
  now = Date.now(),
): string {
  if (!value) return ''
  const { date, day, month, year } = parts(value)
  const current = new Date(now)
  if (date.toDateString() === current.toDateString())
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  return date.getFullYear() === current.getFullYear()
    ? `${month}/${day}`
    : `${year}/${month}/${day}`
}
