/**
 * dsh-updater 构建产物的契约校验（纯 Node，无第三方依赖）。
 *
 * 它证明的是「产物能被 DSH 装载器消费」这件事本身，而不是「我的构建脚本跑过了」：
 *
 *   1. package.json 的入口 / exports / dsh.bundle.patch / dsh.client 指向真实存在的文件；
 *   2. 主机半部是合法的 ESM，导出 apply / inject（装载器按此激活）；
 *   3. 浏览器半部是 __ModuleLoader__ 的 CJS 闭包工厂，且
 *      a. 工厂能在隔离 vm 里真正执行并交出 apply / inject；
 *      b. 它 require 的说明符全部落在外壳 module table 能应答的集合内
 *         （少一个就是浏览器里的必然抛错）；
 *      c. 产物里不再残留 process.env / import.meta 这类浏览器不存在的全局。
 *
 * 用法：`pnpm run verify`（或 `node scripts/verify-bundle.mjs`）。失败以非零码退出。
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
const PACKAGE_NAME = manifest.name

/** 外壳 module table 能应答的说明符（platform 模块 + 本包 dsh.client.external）。 */
const KNOWN_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  ...(manifest.dsh?.client?.external ?? []),
])

const failures = []
/** 记录一条失败，继续跑完其余检查。 */
function check(label, fn) {
  try {
    fn()
    console.log(`  ok    ${label}`)
  } catch (error) {
    failures.push(`${label}: ${error.message}`)
    console.log(`  FAIL  ${label}`)
    console.log(`        ${error.message}`)
  }
}

/** 把 package.json 里的相对路径解析成包内绝对路径。 */
function inPackage(relative) {
  return join(PACKAGE_ROOT, ...relative.replace(/^\.\//, '').split('/'))
}

console.log(`== 校验 ${PACKAGE_NAME} ==`)

// ── 1. 清单契约 ────────────────────────────────────────────────────────────

console.log('清单与注册层：')

check('main 指向存在的文件', () => {
  assert.ok(existsSync(inPackage(manifest.main)), `${manifest.main} 不存在，请先 pnpm run build`)
})

check('exports 的每个入口都指向存在的文件', () => {
  const entries = Object.entries(manifest.exports ?? {})
  assert.ok(entries.length > 0, 'package.json 没有 exports')
  for (const [key, value] of entries) {
    const target = typeof value === 'string' ? value : value?.default
    if (typeof target !== 'string' || !target.startsWith('./')) continue
    if (target.includes('*')) continue
    if (target.endsWith('.yml')) continue
    assert.ok(existsSync(inPackage(target)), `exports["${key}"] -> ${target} 不存在`)
  }
})

check('dsh.client 声明 web 平台与 ./client 导出', () => {
  assert.equal(manifest.dsh?.client?.platform, 'web', 'dsh.client.platform 必须是 web')
  const client = manifest.exports?.['./client']
  const clientPath = typeof client === 'string' ? client : client?.default
  assert.ok(typeof clientPath === 'string', '必须导出 ./client（client-modules 缺它会直接报错）')
  assert.ok(existsSync(inPackage(clientPath)), `./client -> ${clientPath} 不存在`)
})

check('dsh.bundle.patch 指向存在的层文件', () => {
  const patch = manifest.dsh?.bundle?.patch
  assert.ok(typeof patch === 'string', '未声明 dsh.bundle.patch：profile 不会把它当作插件层')
  assert.ok(existsSync(inPackage(patch)), `${patch} 不存在`)
})

check('注册层插入了本包的行', () => {
  const text = readFileSync(inPackage(manifest.dsh.bundle.patch), 'utf8')
  assert.match(text, /^-\s*insert:/mu, '层文件没有顶层 insert')
  assert.match(text, /id:\s*ui-dsh-updater\b/u, '层文件没有 ui-dsh-updater 行')
  assert.ok(text.includes(PACKAGE_NAME), `层文件没有引用 ${PACKAGE_NAME}`)
})

// ── 2. 主机半部 ────────────────────────────────────────────────────────────

console.log('主机半部（lib/index.js）：')

const host = await import(pathToFileURL(inPackage(manifest.main)).href)

check('导出 apply 函数', () => {
  assert.equal(typeof host.apply, 'function', 'apply 必须是函数')
})

check('inject 声明 connection 服务', () => {
  assert.ok(Array.isArray(host.inject), 'inject 必须是数组')
  assert.ok(host.inject.includes('connection'), '必须注入 connection（路由挂在其鉴权 Fetch 通道上）')
})

check('运行时只引用 node 内建模块', () => {
  const text = readFileSync(inPackage(manifest.main), 'utf8')
  const external = [...text.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1])
  const bare = external.filter((specifier) => !specifier.startsWith('node:'))
  assert.deepEqual(bare, [], `主机半部引用了非内建模块：${bare.join(', ')}`)
})

const invariantModule = await import(pathToFileURL(inPackage(manifest.exports['./invariant'])).href)
check('invariant 导出 apply 与 name', () => {
  assert.equal(typeof invariantModule.apply, 'function', 'invariant.apply 必须是函数')
  assert.equal(typeof invariantModule.name, 'string', 'invariant.name 必须是字符串')
})

// ── 3. 浏览器半部 ──────────────────────────────────────────────────────────

console.log('浏览器半部（lib/client.js）：')

const clientPath = typeof manifest.exports['./client'] === 'string'
  ? manifest.exports['./client']
  : manifest.exports['./client'].default
const clientSource = readFileSync(inPackage(clientPath), 'utf8')
const clientCode = clientSource.replace(/\n\/\/# sourceMappingURL=[^\n]*\s*$/u, '')

check('是 __ModuleLoader__ 的闭包工厂，且 id 就是包名', () => {
  // rolldown 会重新格式化 banner/footer，因此按空白归一化后再比对结构。
  const flat = (text) => text.replace(/\s+/gu, ' ').trim()
  const expectedBanner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`
  assert.ok(
    flat(clientCode).startsWith(flat(expectedBanner)),
    `开头不是约定的注册头，实际开头：${JSON.stringify(clientCode.slice(0, 80))}`,
  )
  assert.ok(
    flat(clientCode).endsWith('return module.exports; } });'),
    `结尾不是约定的工厂收尾，实际结尾：${JSON.stringify(clientCode.slice(-60))}`,
  )
})

check('没有残留 process.env / import.meta', () => {
  assert.ok(!/process\.env/u.test(clientCode), '产物里仍有 process.env：构建的 define 没生效')
  assert.ok(!/import\.meta/u.test(clientCode), '产物里仍有 import.meta：CJS 工厂无法承载')
})

check('require 的说明符全部在 module table 内', () => {
  const required = [...clientCode.matchAll(/require\(\s*["']([^"']+)["']\s*\)/gu)].map((match) => match[1])
  const unknown = [...new Set(required)].filter((specifier) => !KNOWN_EXTERNALS.has(specifier))
  assert.deepEqual(unknown, [], `这些 require 在浏览器里无人应答：${unknown.join(', ')}`)
})

// DSH 的图标导出名会随版本改名（0.1.6 是 IconDownloadOutline16，0.1.7 改成
// IconDownloadOutlineRegular）。浏览器半部的 primitives 由外壳 module table 在运行时提供
// 当前这一个版本，名字对不上时具名导出就是 undefined —— 渲染 undefined 组件会抛错，
// ui-renderer 随即让 list 席位的这条注册退位，表现是「点一下按钮，按钮消失、弹窗也不出来」。
// 所以图标一律用本包自带的字形（src/client/icons.tsx），产物里不允许再有对外部模块的 Icon* 读取。
check('不读取外壳模块的图标导出', () => {
  const externalIconReads = [...clientCode.matchAll(/\.[ \t]*(Icon[A-Za-z0-9_$]*)/gu)].map((match) => match[1])
  assert.deepEqual(
    [...new Set(externalIconReads)],
    [],
    `产物从外部模块读取图标导出：${[...new Set(externalIconReads)].join(', ')}。`
      + '图标改名后具名导出是 undefined，点击会抛错并让整个席位退位；请改用本包自带的字形。',
  )
})

check('工厂在隔离环境里能执行并交出 apply / inject', () => {
  const registrations = []
  const requested = []
  const stubFor = (specifier) => new Proxy(function () { return undefined }, {
    get: () => stubFor(specifier),
    apply: () => undefined,
  })
  const sandbox = {
    window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
    console,
  }
  vm.runInNewContext(clientCode, sandbox, { filename: 'client.js' })

  assert.equal(registrations.length, 1, `期望恰好注册一个工厂，实际 ${registrations.length}`)
  const registration = registrations[0]
  assert.equal(registration.id, PACKAGE_NAME, '注册的 id 不是包名')

  const exports = registration.factory((specifier) => {
    requested.push(specifier)
    if (!KNOWN_EXTERNALS.has(specifier)) throw new Error(`module table 无法应答 ${specifier}`)
    return stubFor(specifier)
  })
  assert.equal(typeof exports.apply, 'function', '工厂产出的模块没有 apply')
  assert.ok(Array.isArray(exports.inject), '工厂产出的模块没有 inject 数组')
  assert.ok(exports.inject.includes('slots'), '客户端 apply 需要 slots 服务')
  assert.ok(exports.inject.includes('locale'), '客户端 apply 需要 locale 服务')
  assert.ok(requested.length > 0, '工厂没有向 module table 请求任何模块（平台模块应保持 external）')
})

// ── 结果 ──────────────────────────────────────────────────────────────────

console.log('')
if (failures.length > 0) {
  console.error(`== 校验失败：${failures.length} 项 ==`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('== 校验通过：产物可被 DSH 装载器消费 ==')
