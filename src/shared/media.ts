/** Local media protocol shared by the main process and the agent panel. */

export const mediaScheme = 'mqmz-media'
/** Legacy flat generated directory. */
export const mediaHost = 'generated'
/** Current lookup by saved source id. */
export const mediaSourceHost = 'source'

export function mediaUrl(id: string): string {
  return `${mediaScheme}://${mediaSourceHost}/${encodeURIComponent(id)}`
}
