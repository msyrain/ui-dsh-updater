/** DSH 更新器面板：在设置上方的侧边栏入口 + 版本详情弹窗。 */
import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { UpdateResult, VersionStatus } from './slots.ts'
import { DownloadGlyph, RefreshGlyph } from './icons.tsx'
import { CLOSE_TEXT, DIALOG_FAILURE_TEXT } from './locales.ts'
import css from './UpdaterPanel.module.css'

/** 轮询间隔：30 分钟一次。 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

/** 面板完整 props。 */
export type UpdaterPanelProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'dshUpdater'>

/** 文案查询函数的类型（来自 locale 席位的 props）。 */
type Translate = PropsLocale<'dshUpdater'>['t']

/** 编译期烙入的当前 commit，作为 /status 不可用时的回退展示。 */
const BUILD_COMMIT = process.env.DSH_CLIENT_COMMIT_HASH

/** 拉取一次版本状态。 */
async function fetchStatus(): Promise<VersionStatus | null> {
  try {
    const response = await fetch('/api/dsh-updater/status', { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as VersionStatus
  } catch {
    return null
  }
}

/** 触发升级。 */
async function postUpdate(): Promise<UpdateResult | null> {
  try {
    const response = await fetch('/api/dsh-updater/update', { method: 'POST' })
    return (await response.json()) as UpdateResult
  } catch {
    return null
  }
}

/**
 * 把一次 /status 的结果翻译成一行状态文案。
 *
 * 关键点：`error` 非空时绝不渲染成「当前已是最新版本」——版本事实不全和「确实最新」
 * 是两件事，混在一起正是「明明最新却显示有新版本 / 反过来」的来源。
 * @param status - 版本状态。
 * @param t - 文案查询函数。
 * @returns 状态文案。
 */
function statusMessage(status: VersionStatus, t: Translate): string {
  if (status.error === 'feed-unreachable') return t('feedUnreachable')
  if (status.error === 'feed-invalid') return t('feedInvalid')
  if (status.error === 'current-unknown') return t('currentUnknown')
  return status.hasUpdate ? t('hasUpdate') : t('noUpdate')
}

/**
 * 弹窗子树的最小错误边界。
 *
 * 为什么必须有它：`sidebar.footer.action` 是 list 席位，entry 在渲染中抛错会被 ui-renderer
 * 的 SlotErrorBoundary 接住，随后 `reportEntryError(..., { abdicate: true })` 让这条注册退位，
 * 席位只剩一个空的 `data-slot-error` 行——界面上就是「点一下『DSH 更新』，按钮消失、
 * 弹窗也不出来」，刷新页面前回不来。
 *
 * 为什么边界包的必须是**另一个组件**：updater 面板自己 render 时内联求值的 JSX 抛错，
 * 抛在边界元素「被返回之前」，任何放在它里面的边界都来不及接——错误会直接冲到席位边界。
 * 所以弹窗内容拆成独立的 {@link UpdaterDialog}，由这里渲染它、接它的错。
 * 边界自己渲染兜底 UI 时也不再查文案表（{@link DIALOG_FAILURE_TEXT} 是常量），
 * 免得降级路径二次抛错。
 */
class DialogBoundary extends Component<
  { children: ReactNode; renderFallback: (error: unknown) => ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('dsh-updater: 弹窗渲染失败，已就地降级', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== null) return this.props.renderFallback(this.state.error)
    return this.props.children
  }
}

/** 弹窗内容所需的全部数据与回调（拆分出来才能被 DialogBoundary 保护）。 */
interface UpdaterDialogProps {
  status: VersionStatus | null
  checking: boolean
  message: string | null
  busy: boolean
  hasUpdate: boolean
  currentLabel: string | null
  latestLabel: string | null
  t: Translate
  onUpgrade: () => void
  onCheck: () => void
  onClose: () => void
}

/** 版本详情弹窗的内容。 */
function UpdaterDialog({
  status, checking, message, busy, hasUpdate, currentLabel, latestLabel, t, onUpgrade, onCheck, onClose,
}: UpdaterDialogProps) {
  // 版本事实不全（error 非空）时徽标是「无法判断」，不能冒充「已是最新」。
  const unknown = status !== null && status.error !== null && !hasUpdate
  const badgeClass = hasUpdate
    ? css.badge + ' ' + css.badgeUpdate
    : unknown ? css.badge + ' ' + css.badgeUnknown : css.badge + ' ' + css.badgeOk
  const badgeText = hasUpdate ? t('hasUpdate') : unknown ? t('unknownBadge') : t('noUpdate')
  const desktop = status?.mode === 'desktop'
  const upgradeable = status === null ? true : status.upgradeable
  return (
    <div className={css.overlay} role="presentation" onClick={onClose}>
      <div className={css.mask} aria-hidden="true" />
      <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('dialogTitle')} onClick={(event) => { event.stopPropagation() }}>
        <h2 className={css.heading}>{t('dialogTitle')}</h2>
        <p className={css.intro}>{t('dialogIntro')}</p>

        <div className={css.rows}>
          <div className={css.row}>
            <span className={css.rowKey}>{t('current')}</span>
            <span className={css.rowValue}>{currentLabel ?? t('latestNotAvailable')}</span>
          </div>
          <div className={css.row}>
            <span className={css.rowKey}>{t('latest')}</span>
            <span className={css.rowValue}>{latestLabel ?? t('latestNotAvailable')}</span>
          </div>
        </div>

        {status && <span className={badgeClass}>{badgeText}</span>}

        {desktop && (
          <p className={css.statusLine}>{hasUpdate ? t('desktopUpdateHint') : t('desktopManaged')}</p>
        )}

        {checking && <p className={css.statusLine}>{t('checking')}</p>}
        {message && !checking && <p className={css.statusLine}>{message}</p>}
        {status === null && !message && !checking && <p className={css.statusLine}>{t('checking')}</p>}

        <div className={css.actions}>
          <button
            type="button"
            className={css.primary}
            disabled={busy || !hasUpdate || !upgradeable}
            onClick={onUpgrade}
          >
            <DownloadGlyph size={14} />
            {desktop ? t('upgradeDesktop') : upgradeable ? t('upgrade') : t('upgradeUnavailable')}
          </button>
          <button type="button" className={css.secondary} onClick={onCheck}>
            <RefreshGlyph size={14} />
            {t('checkNow')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 渲染侧边栏底部入口（位于 Settings 上方）及其版本详情弹窗。
 */
export function UpdaterPanel({ wide, t }: UpdaterPanelProps) {
  const [status, setStatus] = useState<VersionStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const alive = useRef(true)

  const check = useCallback(async () => {
    setChecking(true)
    setMessage(null)
    const result = await fetchStatus()
    if (!alive.current) return
    setStatus(result)
    setChecking(false)
    setMessage(result ? statusMessage(result, t) : t('checkFailed'))
  }, [t])

  useEffect(() => {
    alive.current = true
    void check()
    const timer = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      alive.current = false
      window.clearInterval(timer)
    }
  }, [check])

  const hasUpdate = status?.hasUpdate === true
  // /status 是网络来的 JSON：字段缺失不该让入口按钮跟着陪葬，所以这里按最坏情况取。
  const currentLabel = status?.current?.version ?? status?.current?.tag ?? status?.current?.commit ?? BUILD_COMMIT ?? null
  const latestLabel = status?.latest?.version ?? status?.latest?.tag ?? null

  const onUpgrade = useCallback(async () => {
    if (!status?.hasUpdate && !latestLabel) return
    setBusy(true)
    setMessage(t('upgradeRunning'))
    const result = await postUpdate()
    if (!alive.current) return
    setBusy(false)
    if (result?.started) {
      setMessage(t('upgradeStarted'))
    } else if (result?.reason === 'desktop-managed') {
      setMessage(t('upgradeDesktopManaged'))
    } else if (result?.reason === 'update-disabled') {
      setMessage(t('upgradeDisabled'))
    } else {
      setMessage(t('upgradeNotStarted'))
    }
  }, [status?.hasUpdate, latestLabel, t])

  const close = useCallback(() => { setOpen(false) }, [])
  const cellClass = wide ? css.root : css.root + ' ' + css.rail
  const dotClass = hasUpdate ? css.dot + ' ' + css.updateDot : css.dot

  return (
    <>
      <button
        type="button"
        className={cellClass}
        aria-label={t('buttonLabel')}
        aria-haspopup="dialog"
        onClick={() => { setOpen(true) }}
      >
        {wide ? (
          <span className={css.label}>
            <span className={dotClass} aria-hidden="true" />
            {t('buttonLabel')}
          </span>
        ) : (
          <span className={dotClass} aria-hidden="true" />
        )}
      </button>

      {open && (
        <DialogBoundary
          renderFallback={(error) => (
            <div className={css.overlay} role="presentation" onClick={close}>
              <div className={css.mask} aria-hidden="true" />
              <div className={css.panel} role="dialog" aria-modal="true" onClick={(event) => { event.stopPropagation() }}>
                <h2 className={css.heading}>{DIALOG_FAILURE_TEXT}</h2>
                <pre className={css.detail}>{error instanceof Error ? error.message : String(error)}</pre>
                <div className={css.actions}>
                  <button type="button" className={css.secondary} onClick={close}>{CLOSE_TEXT}</button>
                </div>
              </div>
            </div>
          )}
        >
          <UpdaterDialog
            status={status}
            checking={checking}
            message={message}
            busy={busy}
            hasUpdate={hasUpdate}
            currentLabel={currentLabel}
            latestLabel={latestLabel}
            t={t}
            onUpgrade={() => { void onUpgrade() }}
            onCheck={() => { void check() }}
            onClose={close}
          />
        </DialogBoundary>
      )}
    </>
  )
}
