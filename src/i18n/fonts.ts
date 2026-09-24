// Lao font shipped with the app (works offline). It covers only Lao characters, so
// other text keeps the system font, and it downloads only when Lao text is on screen.
import w400 from '@fontsource/noto-sans-lao/files/noto-sans-lao-lao-400-normal.woff2?url'
import w500 from '@fontsource/noto-sans-lao/files/noto-sans-lao-lao-500-normal.woff2?url'
import w600 from '@fontsource/noto-sans-lao/files/noto-sans-lao-lao-600-normal.woff2?url'
import w700 from '@fontsource/noto-sans-lao/files/noto-sans-lao-lao-700-normal.woff2?url'

const LAO_RANGE = 'U+0E81-0EDF, U+200C-200D, U+25CC'

export function registerLaoFont() {
  if (typeof document === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined')
    return
  for (const [weight, url] of [
    ['400', w400],
    ['500', w500],
    ['600', w600],
    ['700', w700],
  ] as const) {
    document.fonts.add(
      new FontFace('Sun Lao', `url(${url}) format('woff2')`, {
        weight,
        unicodeRange: LAO_RANGE,
        display: 'swap',
      }),
    )
  }
}
