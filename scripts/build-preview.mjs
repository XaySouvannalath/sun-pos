// Turns the single-file build into a page body for hosts that supply their own
// <html>/<head>/<body> shell: keeps <title>, styles, the app mount point and scripts.
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('dist-preview/index.html', 'utf8')
const title = src.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Sun POS</title>'
const styles = src.match(/<style[\s\S]*?<\/style>/g) ?? []
const scripts = src.match(/<script[\s\S]*?<\/script>/g) ?? []
// Module scripts in <head> would run before #app exists, so place them after it.
const out = [title, ...styles, '<div id="app"></div>', ...scripts].join('\n')
writeFileSync('dist-preview/sun-pos.html', out)
console.log(`dist-preview/sun-pos.html  ${(out.length / 1024).toFixed(0)} kB`)
