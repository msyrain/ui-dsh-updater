/**
 * dsh-updater 的独立打包脚本。
 *
 * 它不依赖 DSH 单体仓库的构建系统，只产出装载器真正消费的三个产物：
 *
 *   lib/index.js      主机半部（ESM，只引用 node 内建模块）
 *   lib/invariant.js  invariant 伴生件
 *   lib/client.js     浏览器半部（CJS 闭包工厂，由外壳 __ModuleLoader__ 消费）
 *
 * 客户端产物的契约与仓库 `packages/client/tsdown.client.ts` 一致：
 *
 *   - 整体包一层 `window.__ModuleLoader__.load({ id, factory: (require) => { ... } })`，
 *     装载器按包名（即 module table 的 id）登记这个工厂；
 *   - 平台模块（react / react-dom / @deepseek-ai/cordis / dsh-client-ui-*）
 *     保持 external，由外壳注入的 `require` 从 module table 取真实实例，
 *     因此本包不会打包出第二份 react，也不需要任何运行时依赖；
 *   - CSS Modules 在包内编译成「注入 <style> + 导出类名映射」的模块；
 *   - `process.env` / `import.meta.env` 静态替换，产物里不留浏览器不存在的全局。
 *
 * 用法：`pnpm run build`（或 `node scripts/build.mjs`）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import { transform } from 'lightningcss'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = join(PACKAGE_ROOT, 'lib')
const PACKAGE_NAME = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).name

/**
 * 外壳共享给每个浏览器插件的 platform 模块（`packages/client/web/src/platform.ts`
 * 的 PLATFORM_MODULES）。这些标识符必须保持 external：它们由 module table 提供
 * 单一实例，内联就会造出重复的 react / cordis 运行时。
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** 虚拟模块前缀：后缀刻意不是 `.css`，以免被 rolldown 自带的样式管线截走。 */
const CSS_VIRTUAL_PREFIX = '\0dsh-updater-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * 从 git 读取当前 commit，用于面板在 /status 不可用时的版本回退展示。
 *
 * 只在**显式**设置 `DSH_REPO` / `DSH_UPDATER_REPO` 时才烙进产物：默认不读任何固定路径，
 * 否则同一份源码在作者机器和 CI 上会产出不同的字节，`lib/` 的「已提交产物与源码一致」
 * 校验就没法做（而一份公开仓库的产物也不该带着某台机器的 checkout 状态）。
 * @returns 7 位短 commit，或空串。
 */
function detectCommit() {
  const candidates = [process.env.DSH_REPO, process.env.DSH_UPDATER_REPO]
    .filter((dir) => typeof dir === 'string' && dir.length > 0)
  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    try {
      const commit = execFileSync('git', ['-C', dir, 'rev-parse', '--short=7', 'HEAD'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (commit.length > 0) return commit
    } catch {
      // 该目录不是 git 仓库或 git 不可用：尝试下一个候选，最后回退到空串。
    }
  }
  return ''
}

/** 把编译后的样式渲染成一个自注入的 JS 模块（可选导出 CSS Modules 类名映射）。 */
function styleModule(pluginId, fileId, css, classMap) {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${pluginId}/${basename(fileId)}`)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/** 把 import 说明符解析成磁盘上的绝对路径。 */
function styleFile(source, importer) {
  return isAbsolute(source) ? source : resolve(dirname(importer), source)
}

/**
 * 把包内绝对路径换成 POSIX 分隔符的相对路径。
 *
 * 虚拟模块 id 会出现在产物的 region 注释里，用绝对路径等于把作者机器的目录结构
 * 写进公开发布物，同一份源码在不同目录构建出的字节也就不同——「已提交产物与源码
 * 一致」的校验会因此永远失败。
 * @param absolute - 包内绝对路径。
 * @returns 相对包根的 POSIX 路径。
 */
function packageRelativePath(absolute) {
  return relative(PACKAGE_ROOT, absolute).replaceAll('\\', '/')
}

/**
 * 在包内编译样式：`x.module.css` 产出类名映射，普通 `.css` 只注入样式。
 * resolveId 用 `order: 'pre'`，保证在 rolldown 自带样式处理之前把它变成虚拟模块。
 * @param pluginId - 包名，写进注入的 style 标签，便于调试定位来源。
 * @returns rolldown 插件。
 */
function cssPlugin(pluginId) {
  return {
    name: 'dsh-updater-css',
    resolveId: {
      order: 'pre',
      handler(source, importer) {
        if (!source.endsWith('.css')) return null
        if (importer === undefined) return null
        // 虚拟 id 用包内相对路径：它会进产物的 region 注释，绝对路径会破坏可复现性。
        return CSS_VIRTUAL_PREFIX + packageRelativePath(styleFile(source, importer)) + CSS_VIRTUAL_SUFFIX
      },
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const relativeId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const fileId = join(PACKAGE_ROOT, relativeId)
      this.addWatchFile(fileId)
      const code = readFileSync(fileId)
      const cssModules = relativeId.endsWith('.module.css')
      const compiled = transform({
        filename: fileId,
        code,
        minify: true,
        // 类名前缀固定，不用 lightningcss 的 [hash]：那个 hash 取自文件路径，
        // 换个目录构建类名就变，产物字节随之不同。
        ...(cssModules ? { cssModules: { pattern: 'dshUpdater_[local]' } } : {}),
      })
      let classMap
      if (cssModules) {
        classMap = {}
        // 按类名排序再写入：lightningcss 的 exports 遍历顺序在进程间并不稳定（哈希表序），
        // 直接照抄会让同一份源码产出字节不同的产物。
        for (const local of Object.keys(compiled.exports ?? {}).sort()) {
          classMap[local] = compiled.exports[local].name
        }
      }
      return styleModule(pluginId, fileId, compiled.code.toString(), classMap)
    },
  }
}

/** 构建主机半部：ESM，node 内建模块保持 external，其余全部内联。 */
async function buildHostHalf() {
  const bundle = await rolldown({
    input: {
      index: join(PACKAGE_ROOT, 'src', 'index.ts'),
      invariant: join(PACKAGE_ROOT, 'src', 'invariant.ts'),
    },
    platform: 'node',
    external: [/^node:/],
  })
  await bundle.write({
    dir: LIB_DIR,
    format: 'esm',
    entryFileNames: '[name].js',
    sourcemap: false,
  })
  await bundle.close()
}

/** 构建浏览器半部：CJS 闭包工厂，平台模块 external，CSS Modules 内联。 */
async function buildClientHalf(commit) {
  const bundle = await rolldown({
    input: { client: join(PACKAGE_ROOT, 'src', 'client', 'index.ts') },
    platform: 'browser',
    external: [...PLATFORM_MODULES],
    transform: {
      define: {
        // 仓库同款约定：先给 `process.env` 一个空对象兜底，使未定义的静态属性读
        // 求值为 undefined，而不是在浏览器里抛 ReferenceError。
        'process.env': '{}',
        'process.env.NODE_ENV': JSON.stringify('production'),
        ...(commit === '' ? {} : { 'process.env.DSH_CLIENT_COMMIT_HASH': JSON.stringify(commit) }),
        'import.meta.env.MODE': JSON.stringify('production'),
        'import.meta.env': JSON.stringify({ MODE: 'production' }),
      },
    },
    plugins: [cssPlugin(PACKAGE_NAME)],
  })
  await bundle.write({
    dir: LIB_DIR,
    format: 'cjs',
    entryFileNames: 'client.js',
    sourcemap: true,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
  })
  await bundle.close()
}

/**
 * 构建期自检：产物一旦带着浏览器不存在的全局，就在这里失败，而不是等浏览器抛错。
 * 校验的正是 `transform.define` 是否真的生效——rolldown 1.x 中途把这个选项从
 * 顶层挪进了 `transform`，静默忽略时产物看起来完全正常，只在运行时崩。
 */
function assertClientArtifact() {
  const code = readFileSync(join(LIB_DIR, 'client.js'), 'utf8')
    .replace(/\n\/\/# sourceMappingURL=[^\n]*\s*$/u, '')
  // rolldown 会重新格式化 banner/footer，因此按空白归一化后再比对结构。
  const flat = (text) => text.replace(/\s+/gu, ' ').trim()
  const header = `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`
  const problems = []
  if (!flat(code).startsWith(flat(header))) problems.push('开头不是 __ModuleLoader__ 的注册头')
  if (!flat(code).endsWith('return module.exports; } });')) problems.push('结尾不是工厂的收尾语句')
  if (/process\.env/u.test(code)) problems.push('仍残留 process.env（transform.define 未生效）')
  if (/import\.meta/u.test(code)) problems.push('仍残留 import.meta（CJS 工厂无法承载）')
  // 可复现性：作者机器的绝对路径一旦进产物，同一份源码在不同目录构建出的字节就不同，
  // 「已提交产物与源码一致」的校验（CI）也就永远失败。
  if (code.includes(PACKAGE_ROOT)) problems.push('产物里含有本机绝对路径（CSS 虚拟模块 id 或 region 注释泄漏）')
  const escapedRoot = JSON.stringify(PACKAGE_ROOT).slice(1, -1)
  if (readFileSync(join(LIB_DIR, 'client.js.map'), 'utf8').includes(escapedRoot)) {
    problems.push('sourcemap 里含有本机绝对路径')
  }
  if (problems.length > 0) throw new Error(`客户端产物自检失败：\n  - ${problems.join('\n  - ')}`)
}

/** 报告一个产物的字节数。 */
function report(file) {
  const path = join(LIB_DIR, file)
  const bytes = existsSync(path) ? statSync(path).size : -1
  const label = bytes < 0 ? '缺失' : `${bytes} 字节`
  console.log(`  ${file.padEnd(16)} ${label}`)
}

const commit = detectCommit()
console.log(`== 构建 ${PACKAGE_NAME} ==`)
console.log(commit === '' ? '  版本徽标 commit：未取到（面板回退到 /status 的值）' : `  版本徽标 commit：${commit}`)

await rm(LIB_DIR, { recursive: true, force: true })
await mkdir(LIB_DIR, { recursive: true })

console.log('  主机半部 ...')
await buildHostHalf()
console.log('  浏览器半部 ...')
await buildClientHalf(commit)
assertClientArtifact()

console.log('== 产物 ==')
for (const file of ['index.js', 'invariant.js', 'client.js', 'client.js.map']) report(file)
console.log('== 完成。用 `pnpm run verify` 校验 bundle 契约，再执行 dsh plugin add。==')
