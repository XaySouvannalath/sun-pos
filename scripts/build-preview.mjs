// Turns the single-file build into a page body for hosts that supply their own
// <html>/<head>/<body> shell: keeps <title>, styles, the app mount point and scripts.
// Uses a real HTML parser: bundled code can contain tag-like text (e.g. "<styleSheet")
// that a text search would mistake for markup.
import { readFileSync, writeFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const src = readFileSync('dist-preview/index.html', 'utf8')
const { document } = new JSDOM(src).window

const title = document.querySelector('title')?.outerHTML ?? '<title>Sun POS</title>'
const styles = [...document.querySelectorAll('head style')].map((el) => el.outerHTML)
const scripts = [...document.querySelectorAll('script')].map((el) => el.outerHTML)

// Module scripts in <head> would run before #app exists, so place them after it.
const out = [title, ...styles, '<div id="app"></div>', ...scripts].join('\n')

// Check the result parses back to the same structure before writing it.
const check = new JSDOM(`<!doctype html><html><head></head><body>${out}</body></html>`).window
  .document
const problems = []
if (!out.startsWith('<title>')) problems.push('output does not start with <title>')
if (check.querySelectorAll('script').length !== scripts.length)
  problems.push('script count changed')
if (check.querySelectorAll('style').length !== styles.length) problems.push('style count changed')
if (!check.getElementById('app')) problems.push('#app is missing')
if (!scripts.length || !styles.length) problems.push('no scripts or styles found')
for (const [i, el] of [...check.querySelectorAll('script')].entries())
  if (el.textContent !== document.querySelectorAll('script')[i]?.textContent)
    problems.push(`script ${i + 1} content changed`)
if (problems.length) {
  console.error(`build-preview: ${problems.join('; ')}`)
  process.exit(1)
}

writeFileSync('dist-preview/sun-pos.html', out)
console.log(
  `dist-preview/sun-pos.html  ${(out.length / 1024).toFixed(0)} kB  (${styles.length} style, ${scripts.length} script)`,
)
