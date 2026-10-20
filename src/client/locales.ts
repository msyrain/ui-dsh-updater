/** DSH 更新器面板的本地化文案（固定中文，无英文兜底）。 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 本地化命名空间 id。 */
export const NS = 'dshUpdater'

/** 中文文案（唯一文案源；两个语言槽均指向它，保证始终显示中文）。 */
export const zh = {
  buttonLabel: 'DSH 更新',
  buttonLabelShort: '更新',
  current: '当前版本',
  latest: '最新版本',
  commit: '提交',
  latestNotAvailable: '暂未获取到',
  noUpdate: '当前已是最新版本',
  hasUpdate: '检测到新版本',
  checking: '正在检测版本…',
  checkFailed: '无法连接版本检测服务',
  // 版本事实不完整时的三种原因（host 半部只回机器码，这里翻译）。
  unknownBadge: '无法判断',
  currentUnknown: '无法判断当前版本：源码版需要 git 仓库或构建记录，桌面版需要应用清单。',
  feedUnreachable: '连不上版本源，暂不能判断是否有更新。',
  feedInvalid: '版本源返回了无法解析的清单，暂不能判断是否有更新。',
  // 桌面打包版：更新由桌面应用自己负责，本插件只如实报告。
  desktopManaged: '当前是 DeepSeek Harness 桌面版：更新由桌面应用自己负责，请在应用内检查并安装。',
  desktopUpdateHint: '桌面版已有新版本：请在 DeepSeek Harness 应用内更新。',
  upgradeDesktop: '桌面版请在应用内更新',
  upgradeDesktopManaged: '桌面版不支持一键升级：请在应用内检查并安装。',
  upgradeUnavailable: '一键升级不可用',
  checkNow: '立即检查',
  upgrade: '一键升级 DSH',
  upgradeStarted: '升级已启动，正在后台拉取代码、构建并重启服务…',
  upgradeNotStarted: '未能启动升级，请确认升级脚本（dsh-updater-run.ps1）是否存在',
  upgradeDisabled: '当前部署已禁用一键升级',
  upgradeRunning: '正在升级…',
  close: '关闭',
  empty: '暂无版本信息',
  dialogTitle: 'DSH 版本更新',
  dialogIntro: '自动检测最新版本，并在有更新时提示。升级会拉取主分支、同步依赖、完整构建并重启服务。',
  upgradeLatest: '确认升级到最新版本？',
  releaseNote: '发版说明',
  releaseNoteLink: '查看版本说明',
  oldVersionRunning: '（旧版本仍在本会话运行）',
} as const

/** 本命名空间的全部 key（以中文文案为原型）。 */
export type UpdaterLocaleKey = keyof typeof zh

/**
 * 弹窗降级路径的固定文案。
 *
 * 降级 UI 故意不查文案表：查表本身也可能抛错（正是它把注册从席位上带走过），
 * 而兜底路径再抛一次就没人接了。所以这里用常量，而不是 zh 里的一个 key。
 */
export const DIALOG_FAILURE_TEXT = '弹窗渲染失败，已就地降级（入口按钮不受影响）。请把下面的信息反馈给插件作者。'

/** 降级弹窗上关闭按钮的固定文案，理由同 {@link DIALOG_FAILURE_TEXT}。 */
export const CLOSE_TEXT = '关闭'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** DSH 更新器面板文案。 */
    dshUpdater: UpdaterLocaleKey
  }
}
