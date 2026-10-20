/** DSH 更新器浏览器半部：在 Settings 上方的侧边栏底部入口注册更新面板。 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { UpdaterPanel } from './UpdaterPanel.tsx'
import type { UpdaterPanelFace } from './slots.ts'
import { NS, zh } from './locales.ts'

/** 所需服务：UI 槽位注册表与本地化。 */
export const inject = ['slots', 'locale']

/**
 * 注册 DSH 更新器入口。
 * @param ctx - Client root context。
 */
export function apply(ctx: ClientContext): void {
  // 固定中文：把中文文案同时注册到 zh 与 en 两个语言槽，去掉英文兜底，
  // 使活动语言为中文、英文或浏览器默认语言时都渲染中文。
  ctx.effect(() => ctx.locale.register(NS, { zh, en: zh }), 'dsh-updater: dictionaries')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-updater',
    locale: NS,
    inject: (): UpdaterPanelFace => ({}),
  }, UpdaterPanel))
}
