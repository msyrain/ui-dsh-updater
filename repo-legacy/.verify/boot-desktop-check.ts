/**
 * Throwaway verification harness: boot the REAL Electron desktop composition
 * (profile bundles + the desktop-host overlay patch) against the current
 * workspace and report every Loader entry that failed to activate.
 *
 * This reproduces the user-visible failure
 *   `dsh desktop: plugin tree failed to load: dsh desktop: 1 entry did not activate
 *    @deepseek-ai/dsh-client-ui-dsh-updater: pending (waiting for service: webServer)`
 * without touching the running Desktop application.
 *
 * Archived: the layout this harness targets no longer exists in the current
 * Desktop build. The checkout root is taken from `DSH_REPO` (no absolute path
 * is baked in), so the file stays runnable if anyone revives it.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot/src/profile.ts'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

const PROJECT = resolve(process.argv[2] ?? '')
/** DSH checkout 根：用 DSH_REPO 指明；未设置时按当前工作目录解析。 */
const DSH_ROOT = resolve(process.env.DSH_REPO ?? process.cwd())
const DESKTOP_PATCH = resolve(DSH_ROOT, 'apps/desktop-host/config/desktop.cordis.patch.yml')
const ROOT_CONFIG_FILENAME = 'desktop.cordis.yml'

function packageManifestPath(projectDir: string, packageName: string): string {
  const path = join(projectDir, 'node_modules', ...packageName.split('/'), 'package.json')
  if (!existsSync(path)) throw new Error(`dsh desktop: installed package ${JSON.stringify(packageName)} has no manifest`)
  return path
}

function desktopPatches(projectDir: string): PatchOptions[] {
  const dshRoot = dirname(packageManifestPath(projectDir, '@deepseek-ai/dsh'))
  const profile = loadProfileDirectory('dsh desktop', projectDir, join(dshRoot, 'package.json'))
  const layers = [
    ...profile.layers.map(layer => layer.patches),
    profile.patches,
    loadOverlayPatches('dsh desktop', DESKTOP_PATCH),
  ]
  const rows = new Map(layers.flat().flatMap(row => typeof row.id === 'string' ? [[row.id, row] as const] : []))
  const agentPresets = rows.get('agent-presets')
  if (agentPresets !== undefined) {
    layers.push([{
      id: 'agent-presets',
      config: {
        ...(agentPresets.config ?? {}) as Record<string, unknown>,
        roots: [{ path: join(dshRoot, 'config', 'agent-presets'), trust: 'system' }],
      },
    }])
  }
  return layers.flat()
}

const rootConfig = join(PROJECT, ROOT_CONFIG_FILENAME)

const ctx = await boot('dsh desktop', rootConfig, structuredClone(desktopPatches(PROJECT)))

const connection = ctx.get('connection')
const clientModules = ctx.get('clientModules')
const gateway = ctx.get('typertGateway')
console.log(`BOOT OK: connection=${connection !== undefined} clientModules=${clientModules !== undefined} gateway=${gateway !== undefined}`)
console.log(`BOOT OK: webServer present=${ctx.get('webServer') !== undefined}`)

const api = (connection as { createSharedFetchHandler(channel: '/api'): { fetch(request: Request): Promise<Response> } })
  .createSharedFetchHandler('/api')
const status = await api.fetch(new Request('http://localhost/api/dsh-updater/status'))
console.log(`ROUTE /api/dsh-updater/status -> ${String(status.status)} ${await status.text()}`)
const update = await api.fetch(new Request('http://localhost/api/dsh-updater/update', { method: 'POST' }))
console.log(`ROUTE /api/dsh-updater/update -> ${String(update.status)} ${await update.text()}`)

await ctx.fiber.dispose()
console.log('DISPOSED OK')
