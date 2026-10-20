/**
 * 版本判定的纯逻辑：semver 解析比较、electron-updater 通道清单解析、安装清单解析。
 *
 * 这里刻意不碰文件系统与网络：宿主半部负责读文件/发请求，本模块只负责「给定事实，
 * 是否有更新」。因此它可以被 tests/version.test.mjs 用 rolldown 直接打包运行，
 * 不需要真的装着桌面版或连得上更新源。
 *
 * 判定原则：**当前版本未知时绝不谎报有更新**。旧实现里「本地没有 tag 就当远端更新」
 * 这一条，在桌面打包版上会恒定成立（那里既没有 git 仓库也没有构建记录），
 * 于是「已经是最新还提示有更新」。
 */

/** 运行形态：桌面打包版 / 源码仓库 / 无法判断。 */
export type RuntimeMode = 'desktop' | 'source' | 'unknown'

/** 一侧版本事实；任何一项都可能未知。 */
export interface VersionFacts {
  /** semver 版本号（桌面版来自应用清单，源码版可来自 tag 或构建记录）。 */
  version: string | null
  /** git tag。 */
  tag: string | null
  /** 7 位 commit。 */
  commit: string | null
}

/** 远端版本事实。 */
export interface RemoteVersionFacts extends VersionFacts {
  /** 发布时间（ISO 字符串），没有则为 null。 */
  publishedAt: string | null
}

/** 无法判断的原因（机器可读，由浏览器半部翻译成文案）。 */
export type UpdateErrorCode = 'current-unknown' | 'feed-unreachable' | 'feed-invalid'

/** 判定结果。 */
export interface UpdateDecision {
  /** 是否真的有更新。 */
  hasUpdate: boolean
  /** 无法判断时的原因；判断成功为 null。 */
  error: UpdateErrorCode | null
}

/** 解析后的 semver。 */
export interface SemVer {
  /** 主版本号。 */
  major: number
  /** 次版本号。 */
  minor: number
  /** 补丁号。 */
  patch: number
  /** 预发布标识（数字段已转成 number，便于按 semver 规则比较）。 */
  prerelease: readonly (string | number)[]
}

/** semver 文本形态；允许省略次/补丁位，允许 rc 这类预发布标识。 */
const SEMVER_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/

/** 去掉 git tag 常见的 `dsh-` / `v` 前缀。 */
function stripVersionPrefix(value: string): string {
  return value.trim().replace(/^dsh-/iu, '').replace(/^v/iu, '')
}

/**
 * 解析 semver。
 * @param value - 版本或 tag 文本；null/undefined/不可解析返回 null。
 * @returns 解析结果或 null。
 */
export function parseSemVer(value: string | null | undefined): SemVer | null {
  if (typeof value !== 'string') return null
  const matched = SEMVER_PATTERN.exec(stripVersionPrefix(value))
  if (matched === null) return null
  const prerelease = matched[4] === undefined
    ? []
    : matched[4].split('.').map(part => /^\d+$/u.test(part) ? Number(part) : part)
  return {
    major: Number(matched[1]),
    minor: Number(matched[2] ?? '0'),
    patch: Number(matched[3] ?? '0'),
    prerelease,
  }
}

/**
 * 比较两个版本（semver 规则：0.2.1-rc.2 < 0.2.1-rc.10 < 0.2.1）。
 * @param left - 左侧版本。
 * @param right - 右侧版本。
 * @returns -1/0/1；任一不可解析返回 null。
 */
export function compareSemVer(left: string | null | undefined, right: string | null | undefined): -1 | 0 | 1 | null {
  const a = parseSemVer(left)
  const b = parseSemVer(right)
  if (a === null || b === null) return null
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  // 没有预发布标识的版本高于任何同号预发布版本。
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const partA = a.prerelease[index]
    const partB = b.prerelease[index]
    // 前缀更短的预发布版本优先级更低。
    if (partA === undefined) return -1
    if (partB === undefined) return 1
    if (partA === partB) continue
    if (typeof partA === 'number' && typeof partB === 'number') return partA < partB ? -1 : 1
    // 数字标识优先级低于字母标识。
    if (typeof partA === 'number') return -1
    if (typeof partB === 'number') return 1
    return partA < partB ? -1 : 1
  }
  return 0
}

/**
 * 判断远端是否真的领先。
 *
 * 桌面版只比版本号：更新源是桌面应用自己的发布通道，宁可说「无法判断」也不猜。
 * 源码版先比版本号（tag/构建记录），版本相同再比 commit，语义是「上游有新提交」。
 * @param mode - 运行形态。
 * @param current - 当前版本事实。
 * @param latest - 远端版本事实；取不到为 null。
 * @returns 判定结果。
 */
export function decideUpdate(
  mode: RuntimeMode,
  current: VersionFacts,
  latest: RemoteVersionFacts | null,
): UpdateDecision {
  if (latest === null) return { hasUpdate: false, error: 'feed-unreachable' }

  if (mode === 'desktop') {
    const currentVersion = current.version ?? current.tag
    if (currentVersion === null) return { hasUpdate: false, error: 'current-unknown' }
    const latestVersion = latest.version ?? latest.tag
    if (latestVersion === null) return { hasUpdate: false, error: 'feed-invalid' }
    const order = compareSemVer(latestVersion, currentVersion)
    if (order === null) return { hasUpdate: false, error: 'feed-invalid' }
    // 只在远端更高时提示；远端更低（换过通道、回滚）不提示「有更新」，更不提示降级。
    return { hasUpdate: order > 0, error: null }
  }

  if (mode === 'source') {
    const order = compareSemVer(latest.version ?? latest.tag, current.version ?? current.tag)
    if (order !== null) {
      if (order !== 0) return { hasUpdate: order > 0, error: null }
      // 版本号相同：远端同版本号上有本地没有的提交，按「上游有新提交」算更新。
      if (latest.commit !== null && current.commit !== null
        && latest.commit.toLowerCase() !== current.commit.toLowerCase()) {
        return { hasUpdate: true, error: null }
      }
      return { hasUpdate: false, error: null }
    }
    if (latest.commit !== null && current.commit !== null) {
      return { hasUpdate: latest.commit.toLowerCase() !== current.commit.toLowerCase(), error: null }
    }
    return { hasUpdate: false, error: 'current-unknown' }
  }

  return { hasUpdate: false, error: 'current-unknown' }
}

/** 桌面更新源（来自安装包里的 app-update.yml）。 */
export interface UpdateFeed {
  /** electron-updater 的 provider；本插件只认 generic。 */
  provider: string
  /** 通道清单所在目录。 */
  url: string
  /** app-update.yml 里声明的通道（可能被应用清单的 dshDesktopUpdateChannel 覆盖）。 */
  channel: string | null
}

/** 顶层标量行：`key: value`，不匹配缩进行与块标量。 */
const TOP_LEVEL_SCALAR = /^([A-Za-z][\w-]*):[ \t]+(.*)$/u

/**
 * 取 YAML 顶层的标量键值（够用即止：本插件只读 provider/url/channel/version 这类一行值）。
 * @param text - YAML 文本。
 * @returns 顶层标量映射。
 */
function topLevelScalars(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    // 缩进行属于上一个键（列表或块标量的续行），不是顶层键。
    if (/^[ \t]/u.test(line)) continue
    const matched = TOP_LEVEL_SCALAR.exec(line)
    if (matched === null) continue
    const value = matched[2].trim()
    // `key: >-` / `key: |` 是块标量，续行已由缩进过滤掉，这里不记录值。
    if (value === '>' || value === '>-' || value === '|' || value === '|-') continue
    values[matched[1]] = value.replace(/^(['"])(.*)\1$/u, '$2')
  }
  return values
}

/**
 * 解析 app-update.yml。
 * @param text - 文件内容。
 * @returns 更新源；没有 url 时返回 null（此时无法检查更新）。
 */
export function parseUpdateFeed(text: string): UpdateFeed | null {
  const values = topLevelScalars(text)
  const url = values.url
  if (url === undefined || url === '') return null
  return {
    provider: values.provider ?? 'generic',
    url,
    channel: values.channel ?? null,
  }
}

/**
 * 拼出通道清单地址（electron-updater 约定：Windows `<channel>.yml`，macOS `<channel>-mac.yml`）。
 * @param feedUrl - 更新源目录（可以没有结尾斜杠）。
 * @param channel - 通道名。
 * @param platform - 目标平台，默认当前进程。
 * @returns 清单绝对地址；拼不出来返回 null。
 */
export function channelManifestUrl(
  feedUrl: string,
  channel: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const suffix = platform === 'darwin' ? '-mac' : platform === 'linux' ? '-linux' : ''
  const base = feedUrl.endsWith('/') ? feedUrl : `${feedUrl}/`
  try {
    return new URL(`${channel}${suffix}.yml`, base).href
  } catch {
    return null
  }
}

/**
 * 从 electron-updater 的通道清单里取顶层 version。
 * @param text - `<channel>.yml` 内容。
 * @returns 版本号或 null。
 */
export function versionFromChannelManifest(text: string): string | null {
  const version = topLevelScalars(text).version
  if (version === undefined || parseSemVer(version) === null) return null
  return version
}

/**
 * 从桌面应用清单里取更新通道（缺省 nightly，与桌面壳的 update-channel.ts 一致）。
 * @param value - app.asar/package.json 的 dshDesktopUpdateChannel 字段。
 * @returns 通道名。
 */
export function desktopChannelFromManifest(value: unknown): string {
  return value === 'latest' ? 'latest' : 'nightly'
}
