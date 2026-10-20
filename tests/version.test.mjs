/**
 * 版本判定逻辑的单元测试（纯逻辑，不装桌面版、不连网络）。
 *
 * 这里守的是那次误报的根因：桌面打包版既没有 git 仓库也没有构建记录，旧实现把
 * 「本地没有 tag」当成「远端有更新」，于是**已经是最新也恒定提示有更新**。
 * 现在 `decideUpdate` 在版本事实不全时只回 current-unknown / feed-unreachable，
 * 绝不谎报；桌面版只比发布通道里的版本号。
 *
 * 运行：node --test "tests/*.test.mjs"
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 把纯逻辑模块打成 CJS 后加载（与宿主构建同一套 rolldown）。
 * @returns {Promise<object>} src/version.ts 的导出。
 */
async function loadVersionModule() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-updater-version-'))
  const bundle = await rolldown({
    input: { version: join(PACKAGE_ROOT, 'src', 'version.ts') },
    platform: 'node',
    external: [/^node:/],
  })
  await bundle.write({ dir, format: 'cjs', entryFileNames: '[name].cjs' })
  await bundle.close()
  const file = join(dir, 'version.cjs')
  assert.ok(existsSync(file), '版本逻辑产物没有生成')
  try {
    return createRequire(file)(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const version = await loadVersionModule()

// ── 真实安装包里的两份清单（内容取自 0.2.1-rc.2 的桌面安装包）────────────────

/** resources/app-update.yml。 */
const APP_UPDATE_YML = [
  'provider: generic',
  'url: https://download.deepseek.com/dsh-desk/feeds/win-x64/',
  'channel: nightly',
  "updaterCacheDirName: '@deepseek-aidsh-desktop-updater'",
  'publisherName:',
  '  - CN=Hangzhou\\20DeepSeek\\20Artificial\\20Intelligence\\20Co.\\2c\\20Ltd.,O=Hangzhou\\20DeepSeek\\20Artificial\\20Intelligence\\20Co.\\2c\\20Ltd.,C=CN',
  '',
].join('\n')

/** feeds/win-x64/nightly.yml（节选，保留顶层 version 与块标量）。 */
const CHANNEL_YML = [
  'version: 0.2.1-rc.2',
  'files:',
  '  - url: >-',
  '      https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.2.1-rc.2-win-x64.exe',
  '    sha512: >-',
  '      39POl5osl9PKMqrP',
  "path: deepseek-harness-0.2.1-rc.2-win-x64.exe",
  "releaseDate: '2026-10-17T09:18:28.000Z'",
  '',
].join('\n')

test('semver：预发布版的排序与 tag 前缀', () => {
  assert.equal(version.compareSemVer('0.2.1-rc.2', '0.2.1-rc.2'), 0)
  assert.equal(version.compareSemVer('0.2.1-rc.2', '0.2.1-rc.10'), -1)
  assert.equal(version.compareSemVer('0.2.1-rc.10', '0.2.1'), -1)
  assert.equal(version.compareSemVer('0.2.1', '0.2.0'), 1)
  assert.equal(version.compareSemVer('dsh-0.1.7-alpha.1', '0.1.7-alpha.2'), -1)
  assert.equal(version.compareSemVer('v1.2.3', '1.2.3'), 0)
  assert.equal(version.compareSemVer('master', '1.0.0'), null)
  assert.equal(version.parseSemVer('not-a-version'), null)
})

test('app-update.yml：解析出更新源，拼出通道清单地址', () => {
  const feed = version.parseUpdateFeed(APP_UPDATE_YML)
  assert.ok(feed !== null, '应能解析出更新源')
  assert.equal(feed.provider, 'generic')
  assert.equal(feed.url, 'https://download.deepseek.com/dsh-desk/feeds/win-x64/')
  assert.equal(feed.channel, 'nightly')
  assert.equal(
    version.channelManifestUrl(feed.url, 'nightly', 'win32'),
    'https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml',
  )
  assert.equal(
    version.channelManifestUrl(feed.url, 'latest', 'darwin'),
    'https://download.deepseek.com/dsh-desk/feeds/win-x64/latest-mac.yml',
  )
})

test('通道清单：取出顶层 version，不受块标量里的 url 干扰', () => {
  assert.equal(version.versionFromChannelManifest(CHANNEL_YML), '0.2.1-rc.2')
  assert.equal(version.versionFromChannelManifest('files:\n  - url: https://x/y.exe\n'), null)
})

test('桌面版：装的就是通道里的最新版 → 不提示更新（本次误报的回归点）', () => {
  const current = { version: '0.2.1-rc.2', tag: null, commit: null }
  const latest = { version: '0.2.1-rc.2', tag: '0.2.1-rc.2', commit: null, publishedAt: null }
  assert.deepEqual(version.decideUpdate('desktop', current, latest), { hasUpdate: false, error: null })
})

test('桌面版：通道更高才提示，通道更低（换通道/回滚）不提示', () => {
  const current = { version: '0.2.1-rc.2', tag: null, commit: null }
  const newer = { version: '0.2.1-rc.3', tag: null, commit: null, publishedAt: null }
  const stable = { version: '0.2.1', tag: null, commit: null, publishedAt: null }
  const older = { version: '0.2.0', tag: null, commit: null, publishedAt: null }
  assert.equal(version.decideUpdate('desktop', current, newer).hasUpdate, true)
  assert.equal(version.decideUpdate('desktop', current, stable).hasUpdate, true)
  assert.equal(version.decideUpdate('desktop', current, older).hasUpdate, false)
})

test('版本事实不全时只报「无法判断」，绝不谎报有更新', () => {
  const unknownCurrent = { version: null, tag: null, commit: null }
  const latest = { version: '0.2.1-rc.2', tag: '0.2.1-rc.2', commit: 'abcdef1', publishedAt: null }
  assert.deepEqual(version.decideUpdate('desktop', unknownCurrent, latest), { hasUpdate: false, error: 'current-unknown' })
  assert.deepEqual(version.decideUpdate('source', unknownCurrent, latest), { hasUpdate: false, error: 'current-unknown' })
  assert.deepEqual(version.decideUpdate('unknown', unknownCurrent, latest), { hasUpdate: false, error: 'current-unknown' })
  // 远端取不到：同样不是「已是最新」，而是「连不上版本源」。
  assert.deepEqual(
    version.decideUpdate('desktop', { version: '0.2.1-rc.2', tag: null, commit: null }, null),
    { hasUpdate: false, error: 'feed-unreachable' },
  )
  // 清单里没有可解析版本。
  assert.deepEqual(
    version.decideUpdate('desktop', { version: '0.2.1-rc.2', tag: null, commit: null }, {
      version: null, tag: 'nightly', commit: null, publishedAt: null,
    }),
    { hasUpdate: false, error: 'feed-invalid' },
  )
})

test('源码版：tag 比较，同版本号比 commit（上游有新提交才算更新）', () => {
  const current = { version: '0.2.1', tag: 'dsh-0.2.1', commit: 'aaaaaaa' }
  assert.equal(version.decideUpdate('source', current, {
    version: '0.2.2', tag: 'dsh-0.2.2', commit: 'bbbbbbb', publishedAt: null,
  }).hasUpdate, true)
  assert.equal(version.decideUpdate('source', current, {
    version: '0.2.1', tag: 'dsh-0.2.1', commit: 'aaaaaaa', publishedAt: null,
  }).hasUpdate, false)
  assert.equal(version.decideUpdate('source', current, {
    version: '0.2.1', tag: 'dsh-0.2.1', commit: 'ccccccc', publishedAt: null,
  }).hasUpdate, true)
  // 没有 tag、只有 commit 时按 commit 比。
  assert.equal(version.decideUpdate('source', { version: null, tag: null, commit: 'aaaaaaa' }, {
    version: null, tag: null, commit: 'ddddddd', publishedAt: null,
  }).hasUpdate, true)
  // 本地就是最新提交。
  assert.equal(version.decideUpdate('source', { version: null, tag: null, commit: 'aaaaaaa' }, {
    version: null, tag: null, commit: 'aaaaaaa', publishedAt: null,
  }).hasUpdate, false)
})

test('桌面通道：应用清单缺省 nightly，显式 latest 才切通道', () => {
  assert.equal(version.desktopChannelFromManifest(undefined), 'nightly')
  assert.equal(version.desktopChannelFromManifest('latest'), 'latest')
  assert.equal(version.desktopChannelFromManifest('beta'), 'nightly')
})
