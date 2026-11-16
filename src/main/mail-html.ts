/** Allowlisted HTML for received mail and composed messages. */
import sanitizeHtml from 'sanitize-html'

/**
 * Bump whenever the allowlist changes in a way that old cached bodies cannot
 * express. Messages saved with an older version are fetched once from IMAP.
 */
export const mailBodyVersion = 2

const color = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\([^)]*\)$/i,
  /^hsla?\([^)]*\)$/i,
  /^[a-z]{3,20}$/i,
]
const length = [/^0$/, /^\d+(\.\d+)?(px|pt|em|rem|%)$/i]
const lengthOrAuto = [...length, /^auto$/i]
const lengthToken = '(?:0|\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%))'
const spacing = [new RegExp(`^${lengthToken}(?: ${lengthToken}){0,3}$`, 'i')]
const marginToken = '(?:auto|0|\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%))'
const margin = [new RegExp(`^${marginToken}(?: ${marginToken}){0,3}$`, 'i')]
const border = [
  /^(0|none)$/i,
  /^(\d+(\.\d+)?(px|pt|em|rem) )?(solid|dashed|dotted|double)( (#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+))?$/i,
]
const borderWidth = [
  /^\d+(\.\d+)?(px|pt|em|rem)( \d+(\.\d+)?(px|pt|em|rem)){0,3}$/i,
]
const borderStyle = [
  /^(none|solid|dashed|dotted|double)( (none|solid|dashed|dotted|double)){0,3}$/i,
]
const borderColor = color
const radius = [new RegExp(`^${lengthToken}(?: ${lengthToken}){0,3}$`, 'i')]

const allowedStyles: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    color,
    'background-color': color,
    'font-size': length,
    'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
    'font-style': [/^(normal|italic|oblique)$/i],
    'font-family': [/^[a-z0-9\s,'"-]{1,160}$/i],
    'line-height': [/^(normal|\d+(\.\d+)?(px|pt|em|rem|%)?)$/i],
    'letter-spacing': [/^-?\d+(\.\d+)?(px|pt|em|rem)$/i],
    'text-align': [/^(left|right|center|justify|start|end)$/i],
    'vertical-align': [
      /^(baseline|top|middle|bottom|sub|super|text-top|text-bottom)$/i,
    ],
    'text-decoration': [
      /^(none|underline|overline|line-through)( (none|underline|overline|line-through))*$/i,
    ],
    'text-transform': [/^(none|capitalize|uppercase|lowercase)$/i],
    'text-indent': [/^-?\d+(\.\d+)?(px|pt|em|rem)$/i],
    'white-space': [/^(normal|pre|pre-wrap|pre-line|nowrap)$/i],
    'word-break': [/^(normal|break-all|keep-all|break-word)$/i],
    'overflow-wrap': [/^(normal|break-word|anywhere)$/i],
    display: [
      /^(block|inline|inline-block|table|table-row|table-cell|table-header-group|table-row-group|table-footer-group|list-item|none)$/i,
    ],
    padding: spacing,
    'padding-top': spacing,
    'padding-right': spacing,
    'padding-bottom': spacing,
    'padding-left': spacing,
    margin,
    'margin-top': margin,
    'margin-right': margin,
    'margin-bottom': margin,
    'margin-left': margin,
    width: lengthOrAuto,
    height: lengthOrAuto,
    'min-width': length,
    'max-width': lengthOrAuto,
    border,
    'border-top': border,
    'border-right': border,
    'border-bottom': border,
    'border-left': border,
    'border-width': borderWidth,
    'border-style': borderStyle,
    'border-color': borderColor,
    'border-collapse': [/^(collapse|separate)$/i],
    'border-spacing': spacing,
    'border-radius': radius,
    'list-style-type': [
      /^(disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|none)$/i,
    ],
    'list-style-position': [/^(inside|outside)$/i],
  },
}

const allowedTags = [
  'a',
  'address',
  'article',
  'b',
  'big',
  'blockquote',
  'br',
  'caption',
  'center',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'font',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
]

const allowedAttributes: sanitizeHtml.IOptions['allowedAttributes'] = {
  // `style` is filtered property by property through allowedStyles.
  '*': ['style', 'title', 'dir', 'lang', 'align', 'valign'],
  a: ['href', 'title', 'target', 'rel'],
  table: [
    'width',
    'height',
    'align',
    'valign',
    'bgcolor',
    'border',
    'cellpadding',
    'cellspacing',
    'frame',
    'rules',
    'summary',
  ],
  tr: ['align', 'valign', 'bgcolor', 'height'],
  td: [
    'colspan',
    'rowspan',
    'headers',
    'scope',
    'abbr',
    'width',
    'height',
    'align',
    'valign',
    'bgcolor',
    'nowrap',
    'axis',
  ],
  th: [
    'colspan',
    'rowspan',
    'headers',
    'scope',
    'abbr',
    'width',
    'height',
    'align',
    'valign',
    'bgcolor',
    'nowrap',
    'axis',
  ],
  col: ['span', 'width', 'align', 'valign'],
  colgroup: ['span', 'width', 'align', 'valign'],
  font: ['color', 'face', 'size'],
  ol: ['start', 'type', 'reversed'],
  ul: ['type'],
  hr: ['width', 'size', 'noshade', 'align'],
}

const options: sanitizeHtml.IOptions = {
  allowedTags,
  allowedAttributes,
  allowedStyles,
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => {
      const next = { ...attribs }
      // The panel opens links through IPC; keep the anchor inert inside the
      // renderer window and tag it for the default browser.
      next.rel = 'noopener noreferrer'
      return { tagName, attribs: next }
    },
  },
}

export function sanitizeMailBodyHtml(html: string): string {
  return sanitizeHtml(html, options)
}
