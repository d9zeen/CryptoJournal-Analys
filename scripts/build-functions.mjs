// Собирает общий код синхронизации (src/lib/sync/server.ts) в один файл для серверной функции sync-worker (Deno).
// Запуск: npm run build:functions. Готовый файл кладётся в репозиторий: его выкладывают в Supabase вместе с index.ts.
import { build } from 'rolldown'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = `${root}supabase/functions/sync-worker/engine.js`

await build({
  input: `${root}src/lib/sync/server.ts`,
  resolve: { alias: { '@': `${root}src` } },
  platform: 'neutral',
  output: { file: out, format: 'esm', minify: false },
  logLevel: 'warn',
})

const header = '// СГЕНЕРИРОВАНО `npm run build:functions` из src/lib/sync/server.ts — не править руками.\n'
writeFileSync(out, header + readFileSync(out, 'utf8'))
console.log('ok:', out)
