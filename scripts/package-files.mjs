/**
 * 本包「由哪些文件组成」的唯一清单。
 *
 * 两个消费者读同一份清单，这正是它存在的意义：package.json 的 files 字段是对
 * 「这个包是什么」唯一权威的回答，安装器 / 同步器就照它复制。过去在工具里再手写
 * 一份数组，结果是 copy 安装悄悄漏文件，而 sync.mjs --check 只报出最后一个。
 *
 * 目录条目会被展开成目录下的具体文件：copy 安装必须落地真实文件，不能只带规则。
 *
 * @module dsh-updater/package-files
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 包根目录（本模块位于 scripts/ 下）。 */
export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * npm 无论如何都会打进包的文件。只列磁盘上真正存在的：清单描述磁盘上的现实，
 * 不能凭空声明一个不存在的 LICENSE 让 packageFiles() 抛错（npm 自己也不会）。
 */
const ALWAYS_INCLUDED = ['package.json', 'README.md', 'LICENSE', 'LICENSE.md']

/**
 * 读取 package.json 的 files 字段。
 * @param {string} [root] - 包根目录。
 * @returns {string[]} 声明的条目（含目录条目）。
 * @throws {Error} 清单读不到、或没有声明 files 时。
 */
export function declaredEntries(root = PACKAGE_ROOT) {
  const manifestPath = join(root, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error('package-files: cannot read ' + manifestPath + ': ' + error.message)
  }
  const files = manifest.files
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('package-files: package.json declares no "files" list, so there is nothing to copy')
  }
  const always = ALWAYS_INCLUDED.filter(entry => existsSync(join(root, entry)))
  return [...new Set([...files, ...always])]
}

/**
 * 解析出本包包含的每一个文件，路径相对包根。
 * @param {string} [root] - 包根目录。
 * @returns {string[]} 排序后的相对路径，统一以 / 分隔。
 * @throws {Error} 声明的条目在磁盘上不存在时。
 */
export function packageFiles(root = PACKAGE_ROOT) {
  const out = new Set()
  for (const entry of declaredEntries(root)) {
    const absolute = join(root, entry)
    if (!existsSync(absolute)) {
      throw new Error('package-files: package.json declares "' + entry + '" but it does not exist in ' + root)
    }
    if (statSync(absolute).isDirectory()) {
      for (const file of walk(absolute, root)) out.add(file)
    } else {
      out.add(entry.split(sep).join('/'))
    }
  }
  return [...out].sort()
}

/**
 * 列出一个目录下的全部文件，路径相对包根。
 * @param {string} directory - 绝对目录。
 * @param {string} root - 返回值相对的包根。
 * @returns {string[]} 相对包根的文件路径。
 */
function walk(directory, root) {
  const out = []
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name)
    if (statSync(absolute).isDirectory()) out.push(...walk(absolute, root))
    else out.push(relative(root, absolute).split(sep).join('/'))
  }
  return out
}
