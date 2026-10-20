/**
 * DSH 更新器插件，node half。在 connection 的鉴权通道上注册两个精确路由供浏览器半部调用：
 *  - GET  /api/dsh-updater/status  当前版本 + 最新版本 + 是否有新版本
 *  - POST /api/dsh-updater/update  触发一次安全的 DSH 升级流程
 * 走 connection.fetch 而不是 ctx.webServer：该注册表是传输中立的，Web 的
 * HTTP 服务器与 Electron 桌面版的 IPC 传输都从同一个 shared fetch handler 派发，
 * 因此本插件不会因为桌面组合按设计禁用 webserver 行而永远 pending。
 * 该包同时是 dsh.client 包，浏览器半部通过 exports["./client"] 提供。
 *
 * 两种运行形态各有各的版本来源，绝不混用：
 *  - 桌面打包版（Electron Node 模式）：当前版本取应用清单 / 宿主注入的 DSH_CLIENT_VERSION，
 *    最新版本取安装包 app-update.yml 指向的发布通道（和桌面自身的更新检查同一个源）。
 *    这条通道下没有 git 仓库，所以「一键升级」不适用，面板只负责如实报告。
 *  - 源码仓库（pnpm dsh web 从 checkout 启动）：当前版本取 git tag/commit（回退构建记录），
 *    最新版本取 GitHub 仓库。
 * 版本事实都拿不到时（mode=unknown）**不提示更新**，只报告「无法判断」。
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
// 拉取 connection 的模块声明，使 Context.connection 的类型附带进来。
import type {} from '@deepseek-ai/dsh-client-connection'
import {
  channelManifestUrl,
  decideUpdate,
  desktopChannelFromManifest,
  parseSemVer,
  parseUpdateFeed,
  versionFromChannelManifest,
  type RemoteVersionFacts,
  type RuntimeMode,
  type UpdateErrorCode,
  type UpdateFeed,
  type VersionFacts,
} from './version.ts'

/** 本包根目录（lib/index.js 的上一级），用于定位随包分发的升级脚本。 */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 随包分发的安全升级脚本文件名。 */
const BUNDLED_UPDATE_SCRIPT = 'dsh-updater-run.ps1'

/** 桌面安装包里的更新源清单（electron-builder 生成）。 */
const APP_UPDATE_MANIFEST = 'app-update.yml'

/** 桌面应用清单（Electron 打包后位于 app.asar 根）。 */
const APP_ASAR_MANIFEST = 'app.asar/package.json'

/** 桌面运行时描述（记录内置 dsh 的发布版本）。 */
const DESKTOP_RUNTIME_DESCRIPTOR = 'app.asar/dsh/desktop-runtime.json'

/** 插件配置。 */
export interface Config {
  /** DSH 仓库根路径；未配置时取进程工作目录（`pnpm dsh web` 从仓库内启动）。桌面版不读它。 */
  repoPath?: string
  /** 用于检测最新版本的 GitHub 仓库，形如 "owner/repo"（仅源码模式使用）。 */
  githubRepo?: string
  /**
   * 升级时执行的脚本：绝对路径，或相对 repoPath 的文件名。
   * 未配置时优先用随本包分发的 dsh-updater-run.ps1，
   * 该文件不在时回退到 repoPath 下的同名脚本（兼容旧的手工安装方式）。
   */
  updateScript?: string
  /** 开发服务器监听端口，升级重启时据此反查旧服务进程。 */
  port?: number
  /** 是否允许通过 POST /update 触发升级（默认 true）。 */
  allowUpdate?: boolean
}

/** /status 返回体。 */
export interface VersionStatus {
  ok: boolean
  /** 运行形态：桌面打包版 / 源码仓库 / 无法判断。 */
  mode: RuntimeMode
  current: VersionFacts
  latest: RemoteVersionFacts | null
  hasUpdate: boolean
  /** 一键升级是否适用于本机（桌面打包版恒为 false）。 */
  upgradeable: boolean
  /** 无法判断的原因。 */
  error: UpdateErrorCode | null
}

/** 注册路由所需服务：connection 提供传输中立的鉴权 Fetch 通道。 */
export const inject = ['connection']

/**
 * 读一个 JSON 文件；任何失败都当作「没有」。
 * @param path - 绝对路径。
 * @returns 解析结果或 undefined。
 */
function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

/**
 * Electron 打包版的 resources 目录；非桌面版返回 null。
 *
 * 判据是「跑在 Electron 里 + 安装包带 app-update.yml 更新源」：源码 checkout 用
 * `pnpm dsh web` 启动时 process.versions.electron 不存在，普通 Node 进程也拿不到 resourcesPath。
 * @returns resources 绝对路径或 null。
 */
function desktopResourcesDir(): string | null {
  if ((process.versions as Record<string, string | undefined>).electron === undefined) return null
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    ?? resolve(dirname(process.execPath), 'resources')
  return existsSync(resolve(resources, APP_UPDATE_MANIFEST)) ? resources : null
}

/**
 * 桌面版当前版本与更新通道。
 *
 * 版本来源按可信度排序：宿主注入的 DSH_CLIENT_VERSION（桌面壳把构建版本传给 Host）→
 * app.asar 的应用清单 → 桌面运行时描述里的 release.version。
 * @param resourcesDir - 桌面 resources 目录。
 * @returns 版本（可能为 null）与通道。
 */
function desktopVersionFacts(resourcesDir: string): { version: string | null; channel: string } {
  const manifest = readJsonFile<{ version?: unknown; dshDesktopUpdateChannel?: unknown }>(
    resolve(resourcesDir, APP_ASAR_MANIFEST),
  )
  const runtime = readJsonFile<{ release?: { version?: unknown } }>(resolve(resourcesDir, DESKTOP_RUNTIME_DESCRIPTOR))
  const candidates: (string | null)[] = [
    typeof process.env.DSH_CLIENT_VERSION === 'string' ? process.env.DSH_CLIENT_VERSION : null,
    typeof manifest?.version === 'string' ? manifest.version : null,
    typeof runtime?.release?.version === 'string' ? runtime.release.version : null,
  ]
  const version = candidates.find((value): value is string => value !== null && parseSemVer(value) !== null) ?? null
  // 桌面壳用应用清单的 dshDesktopUpdateChannel 决定通道（缺省 nightly），
  // 它会覆盖 electron-updater 从 app-update.yml 读到的通道；这里跟随桌面壳。
  return { version, channel: desktopChannelFromManifest(manifest?.dshDesktopUpdateChannel) }
}

/**
 * 读桌面安装包的更新源。
 * @param resourcesDir - 桌面 resources 目录。
 * @returns 更新源或 null。
 */
function desktopUpdateFeed(resourcesDir: string): UpdateFeed | null {
  try {
    return parseUpdateFeed(readFileSync(resolve(resourcesDir, APP_UPDATE_MANIFEST), 'utf8'))
  } catch {
    return null
  }
}

/** 从 .dsh-build 记录读取 commit 作为 git 失败时的回退。 */
function commitFromBuildRecord(repoPath: string): string | null {
  try {
    const raw = readFileSync(resolve(repoPath, '.dsh-build', 'client-build-environment.json'), 'utf8')
    const parsed = JSON.parse(raw) as { environment?: Record<string, string> }
    return parsed.environment?.DSH_CLIENT_COMMIT_HASH ?? null
  } catch {
    return null
  }
}

/**
 * 源码仓库模式的当前版本：优先 git tag/commit，其次构建记录。
 * @param repoPath - DSH 仓库根。
 * @returns 版本事实。
 */
function sourceVersionFacts(repoPath: string): VersionFacts {
  let commit: string | null = null
  let tag: string | null = null
  try {
    commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    commit = commitFromBuildRecord(repoPath)
  }
  try {
    const described = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    tag = described === '' ? null : described
  } catch {
    tag = null
  }
  // 版本号从 tag 里取（semver 解析会去掉 dsh-/v 前缀）；
  // 构建记录里的版本能补上「没有 tag 但有完整构建」的情况。
  let version: string | null = null
  if (tag !== null && parseSemVer(tag) !== null) version = tag.replace(/^dsh-/iu, '').replace(/^v/iu, '')
  return { version, tag, commit }
}

/** 运行形态探测结果。 */
interface RuntimeShape {
  mode: RuntimeMode
  current: VersionFacts
  feed: UpdateFeed | null
  channel: string | null
  repoPath: string
}

/**
 * 探测运行形态与当前版本。
 * @param config - 插件配置。
 * @returns 探测结果。
 */
function detectRuntime(config: Config): RuntimeShape {
  const repoPath = config.repoPath ?? process.cwd()
  const resources = desktopResourcesDir()
  if (resources !== null) {
    const { version, channel } = desktopVersionFacts(resources)
    return {
      mode: 'desktop',
      current: { version, tag: null, commit: null },
      feed: desktopUpdateFeed(resources),
      channel,
      repoPath,
    }
  }
  const current = sourceVersionFacts(repoPath)
  const known = current.version !== null || current.tag !== null || current.commit !== null
  return { mode: known ? 'source' : 'unknown', current, feed: null, channel: null, repoPath }
}

/**
 * 查询桌面发布通道的最新版本（与桌面应用自己的更新检查同一个清单）。
 * @param feed - 更新源。
 * @param channel - 通道名。
 * @returns 远端版本事实；取不到返回 null。
 */
async function desktopLatest(feed: UpdateFeed, channel: string): Promise<RemoteVersionFacts | null> {
  const url = channelManifestUrl(feed.url, channel)
  if (url === null) return null
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'dsh-updater' } })
    if (!response.ok) return null
    const version = versionFromChannelManifest(await response.text())
    if (version === null) return null
    return { version, tag: version, commit: null, publishedAt: null }
  } catch {
    return null
  }
}

/** 查询 GitHub 远端状态：默认分支 HEAD commit + 最新 release/tag（源码模式）。 */
async function githubLatest(githubRepo: string): Promise<RemoteVersionFacts | null> {
  const headers = { 'User-Agent': 'deepseek-harness' }
  let commit: string | null = null
  let tag: string | null = null
  let publishedAt: string | null = null
  try {
    const response = await fetch(`https://api.github.com/repos/${githubRepo}/commits/master`, { headers })
    if (response.ok) {
      const data = (await response.json()) as { sha?: string }
      commit = (data.sha ?? '').slice(0, 7) || null
    }
  } catch { /* ignore */ }
  try {
    const response = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, { headers })
    if (response.ok) {
      const data = (await response.json()) as { tag_name?: string; published_at?: string }
      tag = data.tag_name ?? null
      publishedAt = data.published_at ?? null
    }
  } catch { /* ignore */ }
  if (!tag) {
    try {
      const response = await fetch(`https://api.github.com/repos/${githubRepo}/tags`, { headers })
      if (response.ok) {
        const arr = (await response.json()) as Array<{ name?: string }>
        tag = arr?.[0]?.name ?? null
      }
    } catch { /* ignore */ }
  }
  if (!commit && !tag) return null
  const version = tag !== null && parseSemVer(tag) !== null
    ? tag.replace(/^dsh-/iu, '').replace(/^v/iu, '')
    : null
  return { version, tag, publishedAt, commit }
}

/**
 * 组装 /status 响应。
 * @param config - 插件配置。
 * @param allowUpdate - 是否允许一键升级。
 * @returns 版本状态。
 */
async function buildStatus(config: Config, allowUpdate: boolean): Promise<VersionStatus> {
  const shape = detectRuntime(config)

  if (shape.mode === 'desktop') {
    const latest = shape.feed === null ? null : await desktopLatest(shape.feed, shape.channel ?? 'nightly')
    const decision = decideUpdate('desktop', shape.current, latest)
    return {
      ok: true,
      mode: 'desktop',
      current: shape.current,
      latest,
      hasUpdate: decision.hasUpdate,
      // 桌面版是签名的打包应用，没有仓库可拉、也没有可写的产物目录：一键升级不适用。
      upgradeable: false,
      error: decision.error,
    }
  }

  if (shape.mode === 'source') {
    const githubRepo = config.githubRepo ?? 'deepseek-ai/deepseek-harness'
    const latest = await githubLatest(githubRepo)
    const decision = decideUpdate('source', shape.current, latest)
    return {
      ok: true,
      mode: 'source',
      current: shape.current,
      latest,
      hasUpdate: decision.hasUpdate,
      upgradeable: allowUpdate && existsSync(resolveUpdateScript(shape.repoPath, config.updateScript)),
      error: decision.error,
    }
  }

  // 既不是桌面打包版，也不在 git 仓库/完整构建里：无从判断版本。
  return {
    ok: true,
    mode: 'unknown',
    current: shape.current,
    latest: null,
    hasUpdate: false,
    upgradeable: false,
    error: 'current-unknown',
  }
}

/** 写一个 JSON 响应。 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/**
 * 定位升级脚本：配置优先，其次随包分发的脚本，最后回退到仓库根的同名脚本。
 * @param repoPath - DSH 仓库根。
 * @param configured - 配置里的 updateScript。
 * @returns 升级脚本的绝对路径（脚本不存在时也返回，由调用方报告）。
 */
function resolveUpdateScript(repoPath: string, configured: string | undefined): string {
  if (configured !== undefined && configured !== '') {
    return isAbsolute(configured) ? configured : resolve(repoPath, configured)
  }
  const bundled = resolve(PACKAGE_ROOT, BUNDLED_UPDATE_SCRIPT)
  if (existsSync(bundled)) return bundled
  return resolve(repoPath, BUNDLED_UPDATE_SCRIPT)
}

/** 触发升级：以分离进程启动安全升级脚本。 */
function triggerUpdate(repoPath: string, script: string, port: number): { started: boolean; script: string } {
  if (!existsSync(script)) {
    return { started: false, script }
  }
  try {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-Repo', repoPath,
      '-Port', String(port),
    ], {
      cwd: repoPath,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return { started: true, script }
  } catch {
    return { started: false, script }
  }
}

/**
 * 注册更新器路由。
 * @param ctx - host context，提供 connection 的鉴权 Fetch 通道。
 * @param config - 插件配置。
 */
export function apply(ctx: Context, config: Config = {}): void {
  const port = config.port ?? 3080
  const allowUpdate = config.allowUpdate ?? true

  ctx.connection.fetch.register({
    path: '/api/dsh-updater/status',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (): Promise<Response> => json(await buildStatus(config, allowUpdate)),
  })

  ctx.connection.fetch.register({
    path: '/api/dsh-updater/update',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (): Promise<Response> => {
      if (!allowUpdate) return Promise.resolve(json({ started: false, reason: 'update-disabled' }, 403))
      const shape = detectRuntime(config)
      // 桌面版没有可拉取的仓库：如实告诉面板，由面板提示走应用内更新。
      if (shape.mode !== 'source') {
        return Promise.resolve(json({ started: false, reason: shape.mode === 'desktop' ? 'desktop-managed' : 'current-unknown' }))
      }
      const script = resolveUpdateScript(shape.repoPath, config.updateScript)
      return Promise.resolve(json(triggerUpdate(shape.repoPath, script, port)))
    },
  })
}
