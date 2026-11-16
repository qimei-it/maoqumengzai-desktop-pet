/** Local media protocol shared by the main process and the agent panel. */

export const mediaScheme = 'mqmz-media'
export const mediaHost = 'generated'

export function mediaUrl(name: string): string {
  return `${mediaScheme}://${mediaHost}/${encodeURIComponent(name)}`
}
