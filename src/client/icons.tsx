/**
 * 本包自带的 16px 字形（下载 / 刷新）。
 *
 * 为什么不从 `@deepseek-ai/dsh-client-ui-primitives` 取图标：浏览器半部把 primitives
 * 保持 external，运行时由外壳 module table 提供**当前这一个** DSH 版本的实例，而 DSH
 * 的图标导出名会随版本改名（0.1.6 是 `IconDownloadOutline16`，0.1.7 改成
 * `IconDownloadOutlineRegular`）。名字对不上时具名导出就是 `undefined`，
 * `React.createElement(undefined)` 直接抛错；`sidebar.footer.action` 是 list 席位，
 * ui-renderer 的 SlotErrorBoundary 会接住这个错并让该注册退位（abdicate），席位只剩
 * 一个空的 `data-slot-error` 行——表现就是「点一下按钮，按钮消失、弹窗也不出来」，
 * 刷新页面前回不来。自带字形让面板对 DSH 的图标改名免疫。
 *
 * 字形与 DSH ui-primitives 的 Regular（1px 描边）版本同形，取自同一项目（MIT）。
 */

/** 字形的公共 props：方形边长与外部类名，颜色跟随 currentColor。 */
export interface GlyphProps {
  /** 方形边长（px），默认 16。 */
  size?: number
  /** 外部类名（布局用）；颜色一律走 currentColor。 */
  className?: string
}

/** 与 DSH Regular 图标一致的 1px 描边。 */
const STROKE_WIDTH = 1

/** 下载字形（对应 DSH 的 IconDownloadOutline）。 */
export function DownloadGlyph({ size = 16, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={STROKE_WIDTH}
    >
      <path d="M8 1.95317V10.0469" stroke="currentColor" />
      <path d="M4.25 6.29688L8 10.0469L11.75 6.29688" stroke="currentColor" />
      <path d="M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469" stroke="currentColor" />
    </svg>
  )
}

/** 刷新字形（对应 DSH 的 IconRefreshOutline）。 */
export function RefreshGlyph({ size = 16, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={STROKE_WIDTH}
    >
      <path d="M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1" stroke="currentColor" />
      <path d="M14.4999 1.5V5.1H10.8999" stroke="currentColor" />
    </svg>
  )
}
