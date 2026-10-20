/** DSH 更新器槽位的注册面与 /status 返回类型。 */
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** 运行形态：桌面打包版 / 源码仓库 / 无法判断。 */
export type RuntimeMode = 'desktop' | 'source' | 'unknown'

/** 无法判断是否有更新的原因。 */
export type UpdateErrorCode = 'current-unknown' | 'feed-unreachable' | 'feed-invalid'

/** /api/dsh-updater/status 的返回体（与 host 半部保持一致）。 */
export interface VersionStatus {
  ok: boolean
  /** 运行形态；决定当前版本从哪来、一键升级是否适用。 */
  mode: RuntimeMode
  current: { version: string | null; commit: string | null; tag: string | null }
  latest: { version: string | null; tag: string | null; publishedAt: string | null; commit: string | null } | null
  hasUpdate: boolean
  /** 一键升级是否适用于本机（桌面打包版恒为 false）。 */
  upgradeable: boolean
  /** 无法判断的原因；判断成功为 null。 */
  error: UpdateErrorCode | null
}

/** /api/dsh-updater/update 的返回体。 */
export interface UpdateResult {
  started: boolean
  /** 未启动的原因：update-disabled / desktop-managed / current-unknown / 脚本缺失。 */
  reason?: string
  script?: string
}

/**
 * 面板注入面。面板自行通过 fetch 拉取版本状态并轮询，
 * 这里保留为空的注册面以维持 slots.register 的约定。
 */
export interface UpdaterPanelFace {}
