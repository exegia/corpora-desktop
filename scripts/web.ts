import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { webSource } from './web-source'

const mode = process.argv[2]
if (mode !== 'dev' && mode !== 'build') throw new Error('Expected dev or build')

// Reuse Web's encrypted public environment locally; explicit CI/desktop vars win.
const envFile = resolve(webSource, '.env')
if (!process.env.CI && existsSync(envFile)) {
  const requireWeb = createRequire(resolve(webSource, 'package.json'))
  requireWeb('@dotenvx/dotenvx').config({
    path: envFile,
    envKeysFile: resolve(webSource, '.env.keys'),
    quiet: true,
  })
}

const { createServer, build } = await import('vite')
if (mode === 'build') {
  await build()
} else {
  const server = await createServer()
  await server.listen()
  server.printUrls()
}
