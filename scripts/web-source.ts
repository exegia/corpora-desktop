import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Worktrees can point to the original sibling checkout explicitly.
export const webSource = resolve(
  process.env.CORPORA_WEB_DIR || resolve(import.meta.dirname, '../../corpora-web')
)

if (!existsSync(resolve(webSource, 'node_modules/react-router/package.json'))) {
  throw new Error('Install corpora-web beside corpora-desktop, or set CORPORA_WEB_DIR to its installed checkout.')
}
