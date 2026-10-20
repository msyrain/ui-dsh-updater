#!/usr/bin/env node
/**
 * 把本仓库的运行文件推进「已经安装到 profile 里的那份副本」。
 *
 *   node sync.mjs                  # 报出漂移，然后重新复制运行文件
 *   node sync.mjs --check          # 只报漂移、不写入；有漂移时退出码为 1
 *   node sync.mjs --profile web --dsh-home D:\other-dsh
 *
 * 为什么需要它：install.mjs --copy 在 profile 里放的是一份真实副本，副本不会跟随本仓库
 * 的改动，而且这种失败是静默的——主机半部继续从旧副本工作、浏览器半部继续提供旧 bundle，
 * 表现就是「我明明改了却好像没生效」。本脚本把漂移显式化，并一步修好。
 *
 * install.mjs 默认的 junction 模式完全不需要它：profile 直接解析到本仓库，每次改动都是
 * 实时的，只剩刷新页面这一步。开发时优先用 junction。
 *
 * 同步之后要刷新页面：浏览器 bundle 按内容寻址，页面在加载时（或经客户端 HMR 通道）
 * 才会取到新版本。
 *
 * @module dsh-updater/sync
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { packageFiles } from './scripts/package-files.mjs'

/** 本仓库（包）根目录。 */
const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))

/** profile 下的安装目录名，与 install.mjs 保持一致。 */
const INSTALL_DIR_NAME = 'ui-dsh-updater'

/** 默认输出通道。 */
function defaultWrite(text) {
  process.stdout.write(text)
}

/**
 * 解析参数。
 * @param {string[]} argv - node 与脚本名之后的参数。
 * @returns {object} 选项。
 * @throws {Error} 未知参数或缺值时。
 */
export function parseArgs(argv) {
  const options = {
    profile: 'web',
    dshHome: process.env.DSH_HOME ?? join(homedir(), '.dsh'),
    check: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') options.profile = requireValue(argv, ++index, arg)
    else if (arg === '--dsh-home') options.dshHome = resolve(requireValue(argv, ++index, arg))
    else if (arg === '--check') options.check = true
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
 */
function requireValue(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) throw new Error(flag + ' requires a value')
  return value
}

/**
 * 取文件的哈希，文件不存在时返回 undefined。
 * @param {string} path - 文件路径。
 * @returns {string | undefined} 前 12 位 sha256，或 undefined。
 */
export function hashOf(path) {
  if (!existsSync(path)) return undefined
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12)
}

/**
 * 路径是不是联接或符号链接：是的话就不需要同步。
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
 * 安装目录的绝对路径。
 * @param {object} options - 已解析的选项。
 * @returns {string} 安装目录。
 */
export function installedDirOf(options) {
  return join(options.dshHome, 'profiles', options.profile, INSTALL_DIR_NAME)
}

/**
 * 比对清单并（除 --check 外）把漂移的文件复制过去。
 *
 * 比对集合就是包的发布文件清单，所以「已同步」意味着安装副本与一次全新安装完全一致。
 * @param {object} options - 已解析的选项。
 * @param {(text: string) => void} [write] - 输出通道。
 * @returns {'linked' | 'wrong-target' | 'clean' | 'drift' | 'synced'} 本次结果。
 */
export function runSync(options, write = defaultWrite) {
  const installed = installedDirOf(options)
  // 悬空联接（源头被改名 / 移动 / 删除）在 existsSync 眼里不存在，但它确实占着安装位。
  if (!existsSync(installed) && !isLink(installed)) {
    throw new Error('no installed plugin at ' + installed + ' (run: node install.mjs)')
  }

  if (isLink(installed)) {
    // 打印联接的 TARGET，而不是联接自己的路径：把联接路径当成目标来打印读起来像自指链接，
    // 恰好盖住操作者唯一想知道的事实——真正在供货的是哪个仓库。
    let target
    try {
      target = realpathSync(installed)
    } catch {
      // 联接还在、目标没了：realpathSync 会抛 ENOENT，这里必须降级成可执行的提示。
      write(installed + '\n  is a link, but its target no longer exists (the checkout was moved or deleted).\n')
      write('Reinstall with: node install.mjs --force\n')
      return 'wrong-target'
    }
    const sameCheckout = resolve(target).toLowerCase() === resolve(SOURCE_DIR).toLowerCase()
    write(installed + '\n  is a link to: ' + target + '\n')
    if (sameCheckout) {
      write('That is this checkout, so every edit here is already live. Nothing to sync.\n')
    } else {
      write('That is NOT this checkout (' + SOURCE_DIR + '), so this sync would write to the wrong\n')
      write('copy. Reinstall with: node install.mjs --force\n')
    }
    write('(A page reload is still needed for the browser half.)\n')
    return sameCheckout ? 'linked' : 'wrong-target'
  }

  const files = packageFiles(SOURCE_DIR)
  const drifted = []
  const missing = []
  for (const relative of files) {
    const a = hashOf(join(SOURCE_DIR, relative))
    const b = hashOf(join(installed, relative))
    if (b === undefined) missing.push(relative)
    else if (a !== b) drifted.push(relative)
  }

  write('checkout : ' + SOURCE_DIR + '\n')
  write('installed: ' + installed + ' (real copy, does not follow edits)\n\n')
  if (drifted.length === 0 && missing.length === 0) {
    write(files.length + ' runtime files, all identical - nothing to do.\n')
    return 'clean'
  }
  if (drifted.length > 0) write('differs (' + drifted.length + '):\n  ' + drifted.join('\n  ') + '\n')
  if (missing.length > 0) write('missing (' + missing.length + '):\n  ' + missing.join('\n  ') + '\n')

  if (options.check) {
    write('\n--check: drift detected; re-run without --check to sync.\n')
    return 'drift'
  }

  for (const relative of [...drifted, ...missing]) {
    const to = join(installed, relative)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(join(SOURCE_DIR, relative), to)
  }
  write('\nre-copied ' + (drifted.length + missing.length) + ' file(s) into the installed plugin.\n')
  write('Now reload the page to pick up the browser bundle.\n')
  return 'synced'
}

/**
 * CLI 入口。
 * @param {string[]} [argv] - 参数（默认取 process.argv）。
 * @param {(text: string) => void} [write] - 输出通道。
 * @returns {string} 本次结果。
 */
export function main(argv = process.argv.slice(2), write = defaultWrite) {
  const options = parseArgs(argv)
  if (options.help) {
    write('usage: node sync.mjs [--profile <name>] [--dsh-home <path>] [--check]\n')
    return 'help'
  }
  return runSync(options, write)
}

// 只有被直接执行时才跑 main；被测试 import 时保持安静。
const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  try {
    const status = main()
    if (status === 'drift' || status === 'wrong-target') process.exitCode = 1
  } catch (error) {
    process.stderr.write('sync: ' + (error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
}
