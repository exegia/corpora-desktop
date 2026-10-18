import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import packageJson from './package.json'
import { webSource } from './scripts/web-source'

const host = process.env.TAURI_DEV_HOST
const webApp = resolve(webSource, 'app')

// Read Web's route table at build time; framework tooling stays out of the
// browser bundle. Explicit imports let Vite split each route normally.
function webRoutes(): Plugin {
  const id = 'virtual:corpora-web-routes'
  return {
    name: 'corpora-web-routes',
    enforce: 'pre',
    transform(code, id) {
      if (id === resolve(import.meta.dirname, 'src/css/global.css')) {
        return code + `\n@source ${JSON.stringify(webApp)};\n`
      }
    },
    resolveId: source => source === id ? '\0' + id : undefined,
    async load(source) {
      if (source !== '\0' + id) return
      const file = resolve(webApp, 'routes.ts')
      this.addWatchFile(file)
      const { default: routes } = await import(pathToFileURL(file).href)
      type Entry = { file: string; id?: string; path?: string; index?: boolean; caseSensitive?: boolean; children?: Entry[] }
      const emit = (entries: Entry[]): string => '[' + entries.map(entry => {
        const { file, children, ...options } = entry
        return `{...${JSON.stringify({ ...options, id: options.id ?? file.replace(/\.[^.]+$/, '') })},` +
          `lazy:()=>import(${JSON.stringify(resolve(webApp, file))}).then(adaptRoute),` +
          (children ? `children:${emit(children)},` : '') + '}'
      }).join(',') + ']'
      return `import { adaptRoute } from ${JSON.stringify(resolve(import.meta.dirname, 'src/lib/web-route.tsx'))}; export default ${emit(routes)};`
    },
    handleHotUpdate({ file, server }) {
      if (file === resolve(webApp, 'routes.ts')) server.ws.send({ type: 'full-reload' })
    },
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  plugins: [webRoutes(), react(), tailwindcss()],
  publicDir: resolve(webSource, 'public'),
  envDir: webSource,
  resolve: {
    alias: { '@corpora-web': webApp, '@': webApp },
    // Source checkouts must share hook and provider/context identities.
    dedupe: ['react', 'react-dom', 'react-router', 'jotai', '@base-ui/react', '@exegia/corpora-ui'],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || '127.0.0.1',
    fs: { allow: [import.meta.dirname, webSource] },
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
