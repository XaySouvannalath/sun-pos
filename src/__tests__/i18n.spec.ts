import { afterEach, describe, expect, it } from 'vitest'
import { language, t } from '@/i18n'
import en from '@/i18n/locales/en'
import lo from '@/i18n/locales/lo'
import zh from '@/i18n/locales/zh'
import vi from '@/i18n/locales/vi'
import { autoMap, getSpec, parseText } from '@/utils/importer'

type Tree = { [k: string]: string | Tree }
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tree))
    Object.assign(out, typeof v === 'string' ? { [prefix + k]: v } : flatten(v, `${prefix}${k}.`))
  return out
}
const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort()

afterEach(() => {
  language.value = 'en'
})

describe('translations', () => {
  const base = flatten(en as unknown as Tree)

  it.each([
    ['lo', lo],
    ['zh', zh],
    ['vi', vi],
  ])('%s has every key, with the same placeholders, and no empty text', (_, messages) => {
    const other = flatten(messages as unknown as Tree)
    expect(Object.keys(other).sort()).toEqual(Object.keys(base).sort())
    for (const [key, text] of Object.entries(base)) {
      // The key is part of the value so a failure names the text that is wrong.
      expect({ key, placeholders: placeholders(other[key]!) }).toEqual({
        key,
        placeholders: placeholders(text),
      })
      expect({ key, empty: other[key]!.trim() === '' }).toEqual({ key, empty: false })
    }
  })
})

describe('t()', () => {
  it('fills placeholders and picks English plural forms', () => {
    expect(t('sell.added', { name: 'Latte' })).toBe('Added Latte')
    expect(t('common.items', { n: 1 })).toBe('1 item')
    expect(t('common.items', { n: 3 })).toBe('3 items')
  })

  it('switches language at runtime', () => {
    language.value = 'vi'
    expect(t('nav.sell')).toBe('Bán hàng')
    language.value = 'zh'
    expect(t('common.items', { n: 3 })).toBe('3 件')
    language.value = 'lo'
    expect(t('nav.sell')).toBe('ຂາຍ')
  })
})

describe('import column matching in other languages', () => {
  it('matches Lao and Chinese headings, as well as English ones', async () => {
    language.value = 'lo'
    const lao = await parseText('ຊື່\tໝວດໝູ່\tລາຄາ\nກາເຟ\tເຄື່ອງດື່ມ\t25000')
    expect(autoMap(lao.headers, getSpec('products'))).toMatchObject({
      name: 0,
      category: 1,
      price: 2,
    })

    language.value = 'zh'
    const chinese = await parseText('名称,分类,价格,Barcode\n拿铁,咖啡,28,123')
    expect(autoMap(chinese.headers, getSpec('products'))).toMatchObject({
      name: 0,
      category: 1,
      price: 2,
      barcode: 3,
    })
  })
})
