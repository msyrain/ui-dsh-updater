/**
 * 安装模式的行为测试：文件清单、junction / copy 安装、受管 patch 块、卸载、副本同步。
 *
 * 运行：node --test "tests/*.test.mjs"（或 npm test）。
 *
 * 这里验证的是安装器对**用户 profile** 的实际动作，且只用临时 DSH home，
 * 不碰真实的 ~/.dsh。
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import {
  BEGIN_MARKER,
  END_MARKER,
  INSTALL_DIR_NAME,
  ROW_ENTRY,
  install,
  isLink,
  uninstall,
  withManagedBlock,
} from '../install.mjs'
import { PACKAGE_ROOT, declaredEntries, packageFiles } from '../scripts/package-files.mjs'
import { runSync } from '../sync.mjs'

/** 一个从未被编辑过的 profile patch：用户行 + 空顶层数组。 */
const USER_PATCH = [
  '# Your patch layer for this dsh profile.',
  '',
  '- id: ui-settings-general',
  '  config:',
  '    welcomeNoticeVersion: 2026-08-13.1',
  '',
  '[]',
  '',
].join('\n')

/** 安静的输出通道：测试不关心安装器的提示语。 */
const silent = () => {}

/**
 * 造一个临时 DSH home，里面有一个像样的 web profile。
 * @returns {{root: string, profileDir: string, patchPath: string, options: object}} 测试现场。
 */
function makeProfile() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-updater-install-'))
  const profileDir = join(root, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-web', private: true }, null, 2) + '\n',
  )
  const patchPath = join(profileDir, 'cordis.patch.yml')
  writeFileSync(patchPath, USER_PATCH)
  return {
    root,
    profileDir,
    patchPath,
    options: { dshHome: root, profile: 'web', copy: false, uninstall: false, force: false, help: false },
  }
}

/**
 * 清掉临时现场。
 *
 * 联接下先单独删掉联接本身再删临时目录：绝不能让递归删除跟进到本仓库。
 * @param {string} root - 临时 DSH home。
 */
function cleanup(root) {
  const installed = join(root, 'profiles', 'web', INSTALL_DIR_NAME)
  try {
    if (isLink(installed)) rmSync(installed, { force: true })
  } catch { /* 清理失败不该掩盖测试结果 */ }
  rmSync(root, { recursive: true, force: true })
}

test('文件清单来自 package.json 的 files 字段，且每条都真实存在', () => {
  const files = packageFiles()
  assert.ok(files.length > 0, '清单不为空')
  for (const relative of files) {
    assert.ok(existsSync(join(PACKAGE_ROOT, relative)), relative + ' 被声明却不存在')
  }
  for (const required of [
    'package.json',
    'README.md',
    'cordis.patch.yml',
    'dsh-updater-run.ps1',
    'lib/index.js',
    'lib/client.js',
    'install.mjs',
    'sync.mjs',
    'scripts/package-files.mjs',
  ]) {
    assert.ok(files.includes(required), '安装副本必须带 ' + required)
  }
  for (const relative of files) {
    assert.equal(/^(tests|node_modules)\//.test(relative), false, relative + ' 不该进发布物')
    assert.equal(relative.startsWith('.'), false, relative + ' 不该进发布物')
  }
})

test('目录条目被展开：声明的每一项都有内容落地', () => {
  const files = new Set(packageFiles())
  for (const entry of declaredEntries()) {
    if (files.has(entry)) continue
    assert.ok([...files].some(file => file.startsWith(entry + '/')), entry + ' 没有贡献任何文件')
  }
})

test('安装器复制的清单与 npm 实际发布的一致', () => {
  const destination = mkdtempSync(join(tmpdir(), 'dsh-updater-pack-'))
  try {
    const stdout = execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--pack-destination', destination],
      { cwd: PACKAGE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    )
    const parsed = JSON.parse(stdout)
    const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
    assert.ok(entry && Array.isArray(entry.files), 'npm pack --json 没有给出文件清单')
    const fromNpm = entry.files.map(file => String(file.path).split('\\').join('/')).sort()
    assert.deepEqual(packageFiles(), fromNpm, 'package-files.mjs 与发布物不一致')
  } finally {
    rmSync(destination, { recursive: true, force: true })
  }
})

test('受管块合并：丢掉空数组、保留用户行、重复合并仍只有一块', () => {
  const once = withManagedBlock(USER_PATCH)
  assert.ok(once.includes(BEGIN_MARKER) && once.includes(END_MARKER))
  assert.equal(once.split(BEGIN_MARKER).length - 1, 1)
  assert.equal(/^\s*\[\s*\]\s*$/m.test(once), false, '空顶层数组必须被丢掉')
  assert.ok(once.includes('- id: ui-settings-general'), '用户已有的行必须保留')
  assert.ok(once.includes(ROW_ENTRY))

  const twice = withManagedBlock(once)
  assert.equal(twice.split(BEGIN_MARKER).length - 1, 1, '重复安装不应产生第二块')
  assert.ok(twice.includes('- id: ui-settings-general'))
})

test('junction 安装：建联接、写受管块；卸载后双方复原', () => {
  const { root, patchPath, options } = makeProfile()
  try {
    const summary = install(options, silent)
    assert.equal(summary.linked, true)
    assert.ok(isLink(summary.installedDir), '安装目录应当是 junction')
    assert.equal(resolve(realpathSync(summary.installedDir)).toLowerCase(), resolve(PACKAGE_ROOT).toLowerCase())

    const text = readFileSync(patchPath, 'utf8')
    assert.ok(text.includes(BEGIN_MARKER))
    assert.ok(text.includes('- id: ui-dsh-updater'))
    assert.ok(text.includes(ROW_ENTRY))
    assert.ok(text.includes('- id: ui-settings-general'), '用户的行必须原样保留')

    install(options, silent)
    assert.equal(readFileSync(patchPath, 'utf8').split(BEGIN_MARKER).length - 1, 1, '重复安装是幂等的')

    const result = uninstall(options, silent)
    assert.equal(result.removedBlock, true)
    assert.equal(result.removedDir, true)
    assert.equal(isLink(summary.installedDir), false)
    assert.equal(existsSync(summary.installedDir), false)

    const after = readFileSync(patchPath, 'utf8')
    assert.equal(after.includes(BEGIN_MARKER), false)
    assert.ok(after.includes('welcomeNoticeVersion'), '卸载不能动用户自己的 patch')
  } finally {
    cleanup(root)
  }
})

test('copy 安装：副本带齐全部发布文件；sync 报漂移并修好', () => {
  const { root, options } = makeProfile()
  try {
    const copyOptions = { ...options, copy: true }
    const { installedDir } = install(copyOptions, silent)
    assert.equal(isLink(installedDir), false, 'copy 模式必须落成真实目录')
    for (const relative of packageFiles()) {
      assert.ok(existsSync(join(installedDir, relative)), relative + ' 没被复制进副本')
    }

    assert.equal(runSync({ ...options, check: true }, silent), 'clean', '刚复制完应当无漂移')

    writeFileSync(join(installedDir, 'lib', 'index.js'), '// drifted\n')
    assert.equal(runSync({ ...options, check: true }, silent), 'drift', '--check 必须报出漂移')
    assert.equal(readFileSync(join(installedDir, 'lib', 'index.js'), 'utf8'), '// drifted\n', '--check 不该写入')

    assert.equal(runSync({ ...options, check: false }, silent), 'synced')
    assert.equal(runSync({ ...options, check: true }, silent), 'clean')

    // 同一个安装目录换成非联接时，不带 --force 的安装必须拒绝覆盖。
    assert.throws(() => install(options, silent), /--force/)

    uninstall(options, silent)
    install(options, silent)
    assert.equal(runSync({ ...options, check: true }, silent), 'linked', '联接下无需同步')
  } finally {
    cleanup(root)
  }
})

test('安装目录是悬空联接（源头被改名或删除）时，安装必须重建而不是报 EEXIST', () => {
  const { root, options } = makeProfile()
  try {
    // 先造一个指向临时目录的联接，再把那个目录删掉：联接本身还在，目标却没了。
    // 源码目录被改名 / 移动后，profile 里留下的正是这种悬空联接。
    const goneSource = mkdtempSync(join(tmpdir(), 'dsh-updater-gone-'))
    const installed = join(root, 'profiles', 'web', INSTALL_DIR_NAME)
    symlinkSync(goneSource, installed, process.platform === 'win32' ? 'junction' : 'dir')
    rmSync(goneSource, { recursive: true, force: true })

    assert.equal(existsSync(installed), false, '悬空联接在 existsSync 眼里应当不存在')
    assert.equal(isLink(installed), true, '但 lstat 仍然认得出它是个联接')
    assert.equal(
      runSync({ ...options, check: true }, silent),
      'wrong-target',
      '悬空联接要给出重建提示，而不是抛 realpath 的 ENOENT',
    )

    const summary = install(options, silent)
    assert.ok(isLink(summary.installedDir), '应当重建出联接而不是抛错')
    assert.equal(
      resolve(realpathSync(summary.installedDir)).toLowerCase(),
      resolve(PACKAGE_ROOT).toLowerCase(),
      '重建后的联接必须指向本仓库',
    )
  } finally {
    cleanup(root)
  }
})

test('profile 不存在时报错，而不是到处乱写', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-updater-missing-'))
  try {
    assert.throws(
      () => install({ dshHome: root, profile: 'web', copy: false, force: false }, silent),
      /not found/,
    )
    assert.throws(
      () => runSync({ dshHome: root, profile: 'web', check: true }, silent),
      /no installed plugin/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
