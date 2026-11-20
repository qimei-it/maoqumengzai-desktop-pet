/**
 * Version string for outbound User-Agent and IMAP ID headers.
 *
 * Kept as a constant because the modules that send it are unit tested without
 * an Electron runtime. `tests/unit/app-version.test.ts` fails when this drifts
 * from package.json.
 */
export const appVersion = '1.0.5'

export const appUserAgent = `MaoquMengzai/${appVersion}`

export const appSourceUrl = 'https://github.com/qimei-it/maoqumengzai-desktop-pet'
