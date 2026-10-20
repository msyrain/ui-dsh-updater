#!/usr/bin/env node
/**
 * 把 dsh-updater 插件安装进某个 dsh profile，或从其中卸载。
 *
 *   node install.mjs                 # 开发模式：在 web profile 里建 junction 指向本目录
 *   node install.mjs --copy          # 交付模式：把包内文件复制进 profile
 *   node install.mjs --uninstall     # 卸载（移除 patch 行与安装目录）
 *   node install.mjs --force         # 覆盖一个已存在、但不是联接的安装目录
 *   node install.mjs --profile sdk --dsh-home D:\other-dsh
 *
 * 为什么是两种策略：dsh 插件模块的裸 import 从「模块自己所在的目录」解析，
 * 所以 profile 里必须有一份能被解析到的模块。
 *
 * - link（默认）— 在 <profile>/ui-dsh-updater 建目录联接（junction）指向本仓库。
 *   Node 会把 junction 解析成真实路径，于是插件依然通过 profile 的 node_modules
 *   解析 @deepseek-ai/*，而本目录的每次改动都立即生效。junction 不是符号链接，
 *   因此不需要管理员权限；这是开发回路。
 * - copy — 把运行文件真正复制进 profile，用来验证「用户实际拿到的那一份」。
 *   副本不会跟随本目录的改动，改完必须跑 node sync.mjs。
 *
 * 两种策略都只改 profile 自己的 cordis.patch.yml，而且只动自己那段标记块，
 * 用户已有的其他 patch 原样保留。宿主在启动时装配 profile 的 patch 层，所以装完
 * 需要重启一次宿主（dsh web 服务或 DeepSeek Harness 桌面版）；插件代码本身的改动
 * 同样需要重启（发布组合里模块热重载是关的）。
 *
 * 刻意用 Node 而不是 PowerShell 实现：Windows PowerShell 5.1 会按控制台代码页来回
 * 转写非 ASCII 字面量，容易弄坏带中文的配置或路径。
 *
 * @module dsh-updater/install
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { packageFiles } from './scripts/package-files.mjs'

/** 本仓库（包）根目录：安装器就住在包根。 */
const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))

/** 受管标记块的起止行：install.mjs 只认这两行之间的内容。 */
export const BEGIN_MARKER = '# >>> ui-dsh-updater (managed by install.mjs) >>>'
export const END_MARKER = '# <<< ui-dsh-updater <<<'

/** profile 下的安装目录名，同时也是 patch 行的 id。 */
export const INSTALL_DIR_NAME = 'ui-dsh-updater'

/** patch 行的 id。 */
export const ROW_ID = 'ui-dsh-updater'

/** 装载器加载的主机半部入口，相对 profile 目录。 */
export const ROW_ENTRY = './' + INSTALL_DIR_NAME + '/lib/index.js'

/** 本包在 package.json 里的名字（用于提示「组合包模式」的重复安装）。 */
const PACKAGE_NAME = JSON.parse(readFileSync(join(SOURCE_DIR, 'package.json'), 'utf8')).name

const USAGE = [
  'Install dsh-updater into a dsh profile.',
  '',
  '  node install.mjs [--profile <name>] [--dsh-home <path>] [--copy] [--force]',
  '  node install.mjs --uninstall [--profile <name>] [--dsh-home <path>]',
  '',
  '  (default)     link this checkout into the profile with a directory junction',
  '  --copy        copy the package files into the profile instead of linking',
  '  --uninstall   remove the managed patch block and the installed directory',
  '  --force       replace an installed directory that is not a link',
  '',
].join('\n')

/** 默认输出通道；测试可以换掉它。 */
function defaultWrite(text) {
  process.stdout.write(text)
}

/**
 * 解析本脚本需要的少量参数。
 * @param {string[]} argv - node 与脚本名之后的参数。
 * @returns {object} 选项。
 * @throws {Error} 出现未知参数时。
 */
export function parseArgs(argv) {
  const options = {
    profile: 'web',
    dshHome: process.env.DSH_HOME ?? join(homedir(), '.dsh'),
    copy: false,
    uninstall: false,
    force: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') options.profile = requireValue(argv, ++index, arg)
    else if (arg === '--dsh-home') options.dshHome = resolve(requireValue(argv, ++index, arg))
    else if (arg === '--copy') options.copy = true
    else if (arg === '--uninstall') options.uninstall = true
    else if (arg === '--force') options.force = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error('unknown argument: ' + arg)
  }
  return options
}

/**
 * 取一个 flag 的值，缺了就报错。
 * @param {string[]} argv - 完整参数表。
 * @param {number} index - 值所在的脚标。
 * @param {string} flag - 用于报错的 flag 名。
 * @returns {string} 该 flag 的值。
 * @throws {Error} 值为空或又是一个 flag 时。
 */
function requireValue(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) throw new Error(flag + ' requires a value')
  return value
}

/**
 * 写进 profile 自己 patch 层的受管块。
 *
 * 行内不带 config：节点半部的默认值（githubRepo / port / allowUpdate）就是想要的默认值，
 * 要改就在同一个文件里另写一条同 id 的条目覆盖（patch 会整体替换该行的 config）。
 * @returns {string} 完整的受管块文本。
 */
export function managedBlock() {
  return [
    BEGIN_MARKER,
    '# 一行常驻行：模块路径由安装器维护，插件自带默认配置。',
    '# 要改配置，请在本文件里另写一条 - id: ui-dsh-updater（patch 会整体替换它的 config），',
    '# 不要编辑这一段标记块：install.mjs 每次安装都会重写它。',
    '- insert:',
    '    - id: ' + ROW_ID,
    "      name: '" + ROW_ENTRY + "'",
    END_MARKER,
    '',
  ].join('\n')
}

/**
 * 从 patch 文档里删掉本脚本的受管块。
 * @param {string} text - patch 文件当前内容。
 * @returns {string} 去掉该块之后的文档。
 */
export function stripManagedBlock(text) {
  const pattern = new RegExp(
    escapeRegExp(BEGIN_MARKER) + '[\\s\\S]*?' + escapeRegExp(END_MARKER) + '\\r?\\n?',
    'g',
  )
  return text.replace(pattern, '')
}

/**
 * 转义正则里的字面量。
 * @param {string} value - 原始字面量。
 * @returns {string} 可安全放进 RegExp 的文本。
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把受管块合并进 patch 文档。
 *
 * 从未被编辑过的 profile patch 文件以字面量 []（空顶层数组）结尾；在它后面再追加一个
 * 文档会让 YAML 失效，所以先丢掉这一行空数组，同时保留它上面所有真实的行与注释。
 * @param {string} text - patch 文件当前内容。
 * @returns {string} 恰好带一个受管块的文档。
 */
export function withManagedBlock(text) {
  const kept = stripManagedBlock(text)
    .split(/\r?\n/)
    .filter(line => !/^\s*\[\s*\]\s*$/.test(line))
    .join('\n')
    .trimEnd()
  return kept + '\n\n' + managedBlock()
}

/**
 * 路径是不是目录联接或符号链接。
 * @param {string} path - 待判定路径。
 * @returns {boolean} 是链接时为 true。
 */
export function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 把包内文件复制进 profile 的安装目录。
 *
 * 清单来自 package.json 的 files 字段（见 scripts/package-files.mjs），而不是再手写
 * 一份数组：副本必须包含与发布物完全相同的文件。
 * @param {string} target - 安装目录。
 * @returns {number} 复制的文件数。
 */
export function copyRuntime(target) {
  const files = packageFiles(SOURCE_DIR)
  mkdirSync(target, { recursive: true })
  for (const relative of files) {
    const destination = join(target, relative)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, readFileSync(join(SOURCE_DIR, relative)))
  }
  return files.length
}

/**
 * 删掉安装目录：无论是联接还是真实目录。
 *
 * 联接下必须先删联接本身，绝不能递归跟进——那会删掉源码目录。
 * @param {string} target - 安装目录。
 * @returns {boolean} 真的删掉了东西时为 true。
 */
export function removeInstalled(target) {
  if (!existsSync(target) && !isLink(target)) return false
  if (isLink(target)) rmSync(target, { force: true })
  else rmSync(target, { recursive: true, force: true })
  return true
}

/**
 * 由选项推出 profile 的三条关键路径。
 * @param {object} options - 已解析的选项。
 * @returns {{profileDir: string, patchPath: string, installedDir: string}} 路径。
 */
export function profilePaths(options) {
  const profileDir = join(options.dshHome, 'profiles', options.profile)
  return {
    profileDir,
    patchPath: join(profileDir, 'cordis.patch.yml'),
    installedDir: join(profileDir, INSTALL_DIR_NAME),
  }
}

/**
 * 检查这个包是否已经以「组合包」方式登记过。
 *
 * 两种安装方式都往层栈里插一条同 id 的行，同时使用就会出现两条 insert。
 * @param {string} profileDir - profile 目录。
 * @param {string} profile - profile 名（只用于提示文案）。
 * @returns {string | undefined} 需要提醒时的文案。
 */
function bundleModeWarning(profileDir, profile) {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
    const bundles = manifest?.dsh?.profile?.bundles
    if (!Array.isArray(bundles) || !bundles.includes(PACKAGE_NAME)) return undefined
  } catch {
    return undefined
  }
  return 'note: ' + PACKAGE_NAME + ' is also listed in this profile\'s dsh.profile.bundles;\n'
    + '      the two install modes both insert the ui-dsh-updater row. Remove one of them:\n'
    + '      dsh plugin --profile ' + profile + ' remove ' + PACKAGE_NAME + '\n'
}

/**
 * 安装：建联接（或复制）+ 写受管 patch 块。
 * @param {object} options - 已解析的选项。
 * @param {(text: string) => void} [write] - 输出通道。
 * @returns {{installedDir: string, patchPath: string, linked: boolean, warning?: string}} 安装摘要。
 */
export function install(options, write = defaultWrite) {
  const { profileDir, patchPath, installedDir } = profilePaths(options)
  if (!existsSync(join(profileDir, 'package.json'))) {
    throw new Error('profile "' + options.profile + '" not found at ' + profileDir)
  }

  // 判定必须包含「是联接」这一支：源头被改名 / 移动 / 删除后，留下的悬空联接在
  // existsSync 眼里不存在，但 symlinkSync 会撞上它并报 EEXIST。
  if (existsSync(installedDir) || isLink(installedDir)) {
    const linked = isLink(installedDir)
    if (!linked && !options.force) {
      throw new Error(installedDir + ' already exists and is not a link; re-run with --force to replace it')
    }
    removeInstalled(installedDir)
  }

  if (options.copy) {
    const count = copyRuntime(installedDir)
    write('copied ' + count + ' runtime file(s) to ' + installedDir + '\n')
  } else {
    symlinkSync(SOURCE_DIR, installedDir, process.platform === 'win32' ? 'junction' : 'dir')
    write('linked ' + SOURCE_DIR + ' -> ' + installedDir + '\n')
  }

  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  writeFileSync(patchPath, withManagedBlock(text))
  write('wrote the ui-dsh-updater row to ' + patchPath + '\n')

  const warning = bundleModeWarning(profileDir, options.profile)
  if (warning) write(warning)

  write('\nInstalled into profile "' + options.profile + '".\n')
  if (options.copy) {
    write('This is a COPY: edits in ' + SOURCE_DIR + ' do not follow it. Run: node sync.mjs\n')
  } else {
    write('This is a junction to ' + SOURCE_DIR + ', so every edit here is already live.\n')
  }
  write('Hosts assemble the profile patch layer at startup, so restart the process that owns\n')
  write('this profile to mount the row: the dsh web service, or the DeepSeek Harness desktop app.\n')
  write('Verify:  dsh --profile ' + options.profile + ' --dump-config | findstr ui-dsh-updater\n')
  write('Plugin CODE changes also need a host restart (module reload is off in the release composition).\n')
  return { installedDir, patchPath, linked: !options.copy, ...(warning === undefined ? {} : { warning }) }
}

/**
 * 卸载：先摘掉 patch 块，再删安装目录。
 * @param {object} options - 已解析的选项。
 * @param {(text: string) => void} [write] - 输出通道。
 * @returns {{installedDir: string, patchPath: string, removedBlock: boolean, removedDir: boolean}} 卸载摘要。
 */
export function uninstall(options, write = defaultWrite) {
  const { patchPath, installedDir } = profilePaths(options)
  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const removedBlock = text.includes(BEGIN_MARKER)
  if (removedBlock) {
    writeFileSync(patchPath, stripManagedBlock(text))
    write('removed the ui-dsh-updater block from ' + patchPath + '\n')
  } else {
    write('no ui-dsh-updater block in ' + patchPath + '\n')
  }
  const removedDir = removeInstalled(installedDir)
  write(removedDir ? 'removed ' + installedDir + '\n' : 'nothing installed at ' + installedDir + '\n')
  write('Uninstalled. The row disappears the next time the host starts.\n')
  return { installedDir, patchPath, removedBlock, removedDir }
}

/**
 * CLI 入口。
 * @param {string[]} [argv] - 参数（默认取 process.argv）。
 * @param {(text: string) => void} [write] - 输出通道。
 * @returns {object} 本次动作的摘要。
 */
export function main(argv = process.argv.slice(2), write = defaultWrite) {
  const options = parseArgs(argv)
  if (options.help) {
    write(USAGE)
    return { help: true }
  }
  return options.uninstall ? uninstall(options, write) : install(options, write)
}

// 只有被直接执行时才跑 main；被测试 import 时保持安静。
const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  try {
    main()
  } catch (error) {
    process.stderr.write('install: ' + (error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
}
