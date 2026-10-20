/**
 * 浏览器半部的行为冒烟测试：**点入口 → 弹窗出现，入口按钮不消失**；弹窗内部抛错 →
 * 就地降级而不是让整个席位退位。
 *
 * 为什么需要它：`sidebar.footer.action` 是 list 席位，entry 在渲染里抛错会被 ui-renderer
 * 的 SlotErrorBoundary 接住，然后 `reportEntryError(..., { abdicate: true })` 让这条注册
 * 退位 —— 席位只剩一个空的 `data-slot-error` 行。用户在界面上看到的就是「点一下『DSH 更新』，
 * 按钮消失、弹窗也不出来，刷新前回不来」。那次事故的成因是面板从
 * `@deepseek-ai/dsh-client-ui-primitives` 里取 `IconDownloadOutline16`，而运行中的 DSH
 * 已把图标改名为 `IconDownloadOutlineRegular`，具名导出成了 undefined。
 *
 * 测试方式：用 rolldown 按生产同款配置把真实的 `src/client/UpdaterPanel.tsx` 与
 * `src/client/locales.ts` 打成 CJS（CSS 用桩），在 jsdom + react-dom 里真挂载、真点按钮。
 * 它验证的是产物行为，不是源码文本。
 *
 * 依赖从 DSH 仓库取（react / react-dom / jsdom 是 DSH 自己的依赖，本包不为此新增依赖）：
 *   DSH_UPDATER_VERIFY_DEPS=<仓库根>   显式指定
 *   DSH_REPO=<仓库根>                  其次
 *   默认 D:\deepseek-harness
 * 取不到就整组 skip（不是失败）：在没装这些依赖的机器上 `pnpm test` 仍应通过。
 *
 * 运行：node --test "tests/*.test.mjs"
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 虚拟 CSS 模块：面板的样式类名只用于 className，测试里返回类名本身即可。 */
const CSS_STUB = '\0dsh-updater-test-css'

/** 把 `.css` 收成桩模块的 rolldown 插件（必须先于内置样式管线命中）。 */
const cssStubPlugin = {
  name: 'dsh-updater-test-css',
  resolveId: {
    order: 'pre',
    handler(source) {
      return source.endsWith('.css') ? CSS_STUB : null
    },
  },
  load(id) {
    if (id !== CSS_STUB) return null
    return 'const classes = new Proxy({}, { get: (_target, key) => String(key) }); export default classes;'
  },
}

/**
 * 候选的 DSH checkout 根：显式环境变量优先。最后那个值只是作者开发机上的回落值，
 * 与插件源码放在哪个目录无关；换台机器请用环境变量指定，否则整组测试 skip。
 * @returns {string} 候选根目录。
 */
function repoRoot() {
  return process.env.DSH_UPDATER_VERIFY_DEPS
    ?? process.env.DSH_REPO
    ?? 'D:\\deepseek-harness'
}

/**
 * 从 DSH 仓库里找出渲染冒烟测试需要的依赖。
 * @returns {{react: object, jsxRuntime: object, ReactDOMClient: object, JSDOM: Function} | undefined} 依赖集合，缺一即 undefined。
 */
function harnessDeps() {
  const root = repoRoot()
  const pnpm = join(root, 'node_modules', '.pnpm')
  if (!existsSync(pnpm)) return undefined
  // react-dom 从 pnpm 的 peer 目录取：它的 node_modules 里同时有 react 与 react-dom，
  // 于是 react-dom 内部 require 到的 react 与测试用的就是同一份实例（hooks 才不会散）。
  const entry = readdirSync(pnpm, { withFileTypes: true })
    .filter(item => item.isDirectory() && item.name.startsWith('react-dom@'))
    .map(item => item.name)
    .sort()
    .at(-1)
  if (entry === undefined) return undefined
  const peerEntry = join(pnpm, entry)
  if (!existsSync(join(peerEntry, 'node_modules', 'react-dom', 'package.json'))) return undefined
  if (!existsSync(join(peerEntry, 'node_modules', 'react', 'package.json'))) return undefined
  const jsdomManifest = join(root, 'node_modules', 'jsdom', 'package.json')
  if (!existsSync(jsdomManifest)) return undefined
  const peerRequire = createRequire(join(peerEntry, 'index.js'))
  return {
    react: peerRequire('react'),
    jsxRuntime: peerRequire('react/jsx-runtime'),
    ReactDOMClient: peerRequire('react-dom/client'),
    JSDOM: createRequire(join(root, 'package.json'))('jsdom').JSDOM,
  }
}

/**
 * 按生产同款配置把面板与文案打成 CJS 包，写进临时目录。
 * @returns {Promise<{dir: string, panel: string, locales: string}>} 产物路径。
 */
async function buildPanelBundle() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-updater-panel-'))
  const bundle = await rolldown({
    input: {
      panel: join(PACKAGE_ROOT, 'src', 'client', 'UpdaterPanel.tsx'),
      locales: join(PACKAGE_ROOT, 'src', 'client', 'locales.ts'),
    },
    platform: 'browser',
    external: ['react', 'react/jsx-runtime'],
    transform: {
      define: {
        'process.env': '{}',
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    },
    plugins: [cssStubPlugin],
  })
  await bundle.write({ dir, format: 'cjs', entryFileNames: '[name].cjs', chunkFileNames: '[name].cjs' })
  await bundle.close()
  return { dir, panel: join(dir, 'panel.cjs'), locales: join(dir, 'locales.cjs') }
}

/**
 * 在临时 bundle 上把 react / react-jsx-runtime 换成 DSH 那一份，避免出现第二份 React。
 * @param {string} file - bundle 路径。
 * @param {object} deps - 依赖集合。
 * @returns {object} bundle 的导出。
 */
function loadBundle(file, deps) {
  const original = Module._load
  Module._load = function patched(request, parent, isMain) {
    if (request === 'react') return deps.react
    if (request === 'react/jsx-runtime') return deps.jsxRuntime
    return original.call(this, request, parent, isMain)
  }
  try {
    return createRequire(file)(file)
  } finally {
    Module._load = original
  }
}

/**
 * 轮询等待某个条件成立，避免对调度时机做固定假设。
 * @param {() => boolean} predicate - 条件。
 * @param {string} label - 超时时的失败信息。
 */
async function waitFor(predicate, label) {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return
    await new Promise((done) => { setTimeout(done, 5) })
  }
  assert.fail(label)
}

/**
 * 造一套 jsdom 环境并把 react-dom 需要的全局装好。
 * @param {Function} JSDOM - jsdom 的 JSDOM 构造器。
 * @returns {object} jsdom 实例（测试结束由调用方关闭）。
 */
function installDom(JSDOM) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:3080/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.Event = dom.window.Event
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.requestAnimationFrame = (callback) => { setTimeout(() => { callback(Date.now()) }, 0) }
  globalThis.cancelAnimationFrame = (handle) => { clearTimeout(handle) }
  return dom
}

/**
 * 挂载到容器。React 会把「渲染期抛错但被 error boundary 接住」的恢复过程报给全局错误通道，
 * 默认实现会在测试进程里变成 uncaughtException；这里接住它，让断言自己说话。
 * @param {object} container - DOM 容器。
 * @returns {object} react-dom 的 root。
 */
function mount(container) {
  return deps.ReactDOMClient.createRoot(container, { onRecoverableError: () => {} })
}

/** 源码版、有新版本时的 /status 响应体。 */
const STATUS_BODY = {
  ok: true,
  mode: 'source',
  current: { version: '0.1.7-alpha.1', commit: 'c36a83f', tag: 'dsh-0.1.7-alpha.1' },
  latest: { version: '0.1.7-alpha.2', tag: 'dsh-0.1.7-alpha.2', publishedAt: null, commit: 'abcdef1' },
  hasUpdate: true,
  upgradeable: true,
  error: null,
}

/** 桌面版、装的就是通道最新版时的 /status 响应体（本次误报的现场）。 */
const DESKTOP_UP_TO_DATE_BODY = {
  ok: true,
  mode: 'desktop',
  current: { version: '0.2.1-rc.2', commit: null, tag: null },
  latest: { version: '0.2.1-rc.2', tag: '0.2.1-rc.2', publishedAt: null, commit: null },
  hasUpdate: false,
  upgradeable: false,
  error: null,
}

/**
 * 用一份固定的 /status 响应体接管 fetch，并返回还原函数。
 * @param {object} body - 响应体。
 * @returns {() => void} 还原函数。
 */
function stubStatusFetch(body) {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  return () => { globalThis.fetch = original }
}

const deps = harnessDeps()
const SKIP = deps === undefined
  ? `找不到 react/react-dom/jsdom（DSH 仓库根：${repoRoot()}，可用 DSH_UPDATER_VERIFY_DEPS 指定）`
  : false

test('点击入口：弹窗出现，入口按钮不消失', { skip: SKIP }, async (ctx) => {
  const dom = installDom(deps.JSDOM)
  const restoreFetch = stubStatusFetch(STATUS_BODY)
  const built = await buildPanelBundle()
  try {
    assert.ok(existsSync(built.panel), '面板产物没有生成')
    const { UpdaterPanel } = loadBundle(built.panel, deps)
    const zh = { ...loadBundle(built.locales, deps).zh }
    assert.equal(typeof zh.dialogTitle, 'string', '文案表里必须有 dialogTitle')
    const container = document.getElementById('root')
    const root = mount(container)
    root.render(deps.react.createElement(UpdaterPanel, { wide: true, t: key => zh[key] ?? key }))
    await waitFor(
      () => container.querySelector('button[aria-haspopup="dialog"]') !== null,
      '挂载后应出现侧边栏入口按钮',
    )

    const trigger = container.querySelector('button[aria-haspopup="dialog"]')
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await waitFor(
      () => container.querySelector('[role="dialog"]') !== null,
      '点击入口后应出现弹窗（这一条正是「点了没反应」事故的回归点）',
    )

    const dialog = container.querySelector('[role="dialog"]')
    assert.ok(dialog !== null, '点击入口后应出现弹窗（这一条正是「点了没反应」事故的回归点）')
    assert.match(dialog.textContent, new RegExp(zh.dialogTitle, 'u'), '弹窗应带标题文案')
    assert.ok(
      container.querySelector('button[aria-haspopup="dialog"]') !== null,
      '弹窗打开时入口按钮必须还在（list 席位一旦 abdicate 就只剩空的 data-slot-error 行）',
    )
    assert.ok(dialog.querySelector('svg') !== null, '弹窗里的图标必须是本包自带的字形')

    root.unmount()
  } finally {
    restoreFetch()
    rmSync(built.dir, { recursive: true, force: true })
    dom.window.close()
  }
  ctx.diagnostic('弹窗打开且入口按钮存活')
})

test('桌面版且已是最新：不显示「检测到新版本」，一键升级不可用并指向应用内更新', { skip: SKIP }, async (ctx) => {
  const dom = installDom(deps.JSDOM)
  const restoreFetch = stubStatusFetch(DESKTOP_UP_TO_DATE_BODY)
  const built = await buildPanelBundle()
  try {
    const { UpdaterPanel } = loadBundle(built.panel, deps)
    const zh = { ...loadBundle(built.locales, deps).zh }
    const container = document.getElementById('root')
    const root = mount(container)
    root.render(deps.react.createElement(UpdaterPanel, { wide: true, t: key => zh[key] ?? key }))
    await waitFor(
      () => container.querySelector('button[aria-haspopup="dialog"]') !== null,
      '挂载后应出现侧边栏入口按钮',
    )

    container.querySelector('button[aria-haspopup="dialog"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await waitFor(
      () => container.querySelector('[role="dialog"]') !== null,
      '点击入口后应出现弹窗',
    )

    const dialog = container.querySelector('[role="dialog"]')
    const text = dialog.textContent
    assert.match(text, new RegExp(zh.noUpdate, 'u'), '已是最新时应显示「当前已是最新版本」')
    assert.ok(!text.includes(zh.hasUpdate), '已是最新时绝不能出现「检测到新版本」')
    assert.match(text, /0\.2\.1-rc\.2/u, '弹窗应显示真实的桌面版本号')
    assert.match(text, new RegExp(zh.desktopManaged, 'u'), '桌面版应说明更新由应用自身负责')

    const upgradeButton = [...dialog.querySelectorAll('button')].find(button => button.disabled)
    assert.ok(upgradeButton !== undefined, '桌面版的一键升级按钮必须是禁用的')
    assert.match(upgradeButton.textContent, new RegExp(zh.upgradeDesktop, 'u'), '禁用按钮应说明走应用内更新')

    root.unmount()
  } finally {
    restoreFetch()
    rmSync(built.dir, { recursive: true, force: true })
    dom.window.close()
  }
  ctx.diagnostic('桌面版已是最新：无更新提示，升级按钮禁用')
})

test('版本事实不全：徽标显示「无法判断」，不冒充已是最新', { skip: SKIP }, async (ctx) => {
  const dom = installDom(deps.JSDOM)
  const restoreFetch = stubStatusFetch({
    ok: true,
    mode: 'unknown',
    current: { version: null, commit: null, tag: null },
    latest: null,
    hasUpdate: false,
    upgradeable: false,
    error: 'current-unknown',
  })
  const built = await buildPanelBundle()
  try {
    const { UpdaterPanel } = loadBundle(built.panel, deps)
    const zh = { ...loadBundle(built.locales, deps).zh }
    const container = document.getElementById('root')
    const root = mount(container)
    root.render(deps.react.createElement(UpdaterPanel, { wide: true, t: key => zh[key] ?? key }))
    await waitFor(
      () => container.querySelector('button[aria-haspopup="dialog"]') !== null,
      '挂载后应出现侧边栏入口按钮',
    )
    container.querySelector('button[aria-haspopup="dialog"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await waitFor(
      () => container.querySelector('[role="dialog"]') !== null,
      '点击入口后应出现弹窗',
    )

    const text = container.querySelector('[role="dialog"]').textContent
    assert.match(text, new RegExp(zh.unknownBadge, 'u'), '应显示「无法判断」徽标')
    assert.match(text, new RegExp(zh.currentUnknown, 'u'), '应说明为什么无法判断')
    assert.ok(!text.includes(zh.hasUpdate), '版本不明时绝不能提示有更新')
    assert.ok(!text.includes(zh.noUpdate), '版本不明时也不能说「已是最新」')

    root.unmount()
  } finally {
    restoreFetch()
    rmSync(built.dir, { recursive: true, force: true })
    dom.window.close()
  }
  ctx.diagnostic('版本不明时既不谎报更新也不谎报最新')
})

test('弹窗内部抛错：就地降级，入口按钮仍然可用', { skip: SKIP }, async (ctx) => {
  const dom = installDom(deps.JSDOM)
  const built = await buildPanelBundle()
  const errors = []
  const originalError = console.error
  console.error = (...args) => { errors.push(args) }
  try {
    const { UpdaterPanel } = loadBundle(built.panel, deps)
    const zh = { ...loadBundle(built.locales, deps).zh }
    const { DIALOG_FAILURE_TEXT } = loadBundle(built.locales, deps)
    assert.equal(typeof DIALOG_FAILURE_TEXT, 'string', '文案表里必须有降级提示常量')
    assert.ok(DIALOG_FAILURE_TEXT.length > 0, '降级提示不能是空串')
    const container = document.getElementById('root')
    const root = mount(container)
    // 只在弹窗内部用到的键上抛错：入口按钮的渲染不能受影响。
    const t = (key) => {
      if (key === 'dialogIntro') throw new Error('boom: dialog render failed')
      return zh[key] ?? key
    }
    root.render(deps.react.createElement(UpdaterPanel, { wide: true, t }))
    await waitFor(
      () => container.querySelector('button[aria-haspopup="dialog"]') !== null,
      '挂载后应出现侧边栏入口按钮',
    )

    const trigger = container.querySelector('button[aria-haspopup="dialog"]')
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await waitFor(
      () => container.textContent.includes(DIALOG_FAILURE_TEXT),
      '弹窗内部抛错后应就地降级成一条带错误详情的弹窗',
    )

    assert.ok(container.querySelector('[role="dialog"]') !== null, '降级后仍应是一个弹窗（带错误详情与关闭）')
    assert.match(container.textContent, new RegExp(DIALOG_FAILURE_TEXT, 'u'), '降级弹窗里应有本地化的失败提示')
    assert.match(container.textContent, /boom/u, '降级弹窗里应带上原始错误信息')
    assert.ok(
      container.querySelector('button[aria-haspopup="dialog"]') !== null,
      '弹窗内部抛错绝不能把入口按钮一起带走',
    )
    assert.ok(errors.length > 0, '被接住的错误必须仍然打到 console.error，否则线上无从排查')

    root.unmount()
  } finally {
    console.error = originalError
    rmSync(built.dir, { recursive: true, force: true })
    dom.window.close()
  }
  ctx.diagnostic('弹窗抛错时就地降级，入口按钮存活')
})
