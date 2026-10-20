# 贡献指南

这个仓库不大，但有几条约束**不直观**，而且踩了会以很怪的方式失败。先读完这一页能省不少时间。

## 快速开始

```powershell
git clone https://github.com/msyrain/ui-dsh-updater.git
cd ui-dsh-updater
pnpm install --ignore-scripts     # 本包没有运行时依赖，这步只装构建工具链

pnpm test                         # 离线测试：不需要网络、DSH、凭据
pnpm run build                    # 从 src/ 重新生成 lib/
pnpm run verify                   # 校验产物契约
```

想装进正在运行的 DSH 里看效果：

```powershell
node install.mjs                     # web profile（源码版行为）
node install.mjs --profile desktop   # 桌面版 profile（桌面版行为）
```

## 两个半部与产物

| 文件 | 跑在哪 | 说明 |
| --- | --- | --- |
| `src/index.ts` | **宿主**（DSH 进程内） | 注册 `/api/dsh-updater/status`、`/api/dsh-updater/update` |
| `src/version.ts` | **宿主** | 版本判定的纯逻辑（semver、通道清单、`decideUpdate`） |
| `src/client/*` | **浏览器** | 侧边栏入口 + 版本弹窗 |
| `lib/index.js`、`lib/client.js` | 构建产物，**随仓库提交** | 由 `pnpm run build` 从 `src/` 生成 |

浏览器半部是一个 CJS 闭包工厂，`id` 就是包名，`require` 只应答外壳 module table 里的 platform 模块；
宿主半部只引用 `node:` 内建模块——这两条是「同一份包能同时装进 web 与桌面 profile」的基础，
`pnpm run verify` 会检查它们。

## 五条硬约束

### 1. 改了 `src/` 就必须重建并提交 `lib/`

`lib/` 是随仓库发布的产物。忘了重建时**测试不会告诉你**——测试读的是 `src/`，而过期的产物会被当成
当前发布物。CI 的 `artifact` 作业就是拦这个的：

```powershell
pnpm run build
git add lib
```

### 2. 构建必须保持可复现

同一份源码在任何目录、任何机器都要构建出相同字节，否则上面的产物校验永远失败。因此：

- 产物里**不能出现本机绝对路径**：CSS 虚拟模块 id 用包内相对路径，`assertClientArtifact()` 会检查；
- CSS Modules 类名前缀是固定的 `dshUpdater_`，**不要改回** lightningcss 的 `[hash]`（那个 hash 取自文件路径）；
- CSS Modules 的类名映射按类名排序后再写入（lightningcss 的 exports 遍历顺序在进程间不稳定）；
- 不要在构建里默认读取某个固定目录（比如某台开发机上的 DSH checkout）：只有显式设置 `DSH_REPO` /
  `DSH_UPDATER_REPO` 时才把 commit 烙进产物。

### 3. 浏览器半部不要读外壳的图标导出

DSH 的图标名会随版本改名（0.1.6 `IconDownloadOutline16` → 0.1.7 `IconDownloadOutlineRegular`）。
取不到的具名导出是 `undefined`，渲染它会让 `sidebar.footer.action` 这个 list 席位**退位**
（注册消失，只剩一个空的 `data-slot-error` 行），用户看到的是「点一下按钮，按钮消失、弹窗也不出来」。
图标请用 `src/client/icons.tsx` 里自带字形；`pnpm run verify` 会拦下产物里对外部模块的 `Icon*` 读取。

### 4. 版本判定宁可「无法判断」，也不谎报

`decideUpdate()` 的契约是：版本事实不全时只回 `current-unknown` / `feed-unreachable` / `feed-invalid`，
绝不返回 `hasUpdate: true`。新增版本源时请一并补 `tests/version.test.mjs` 的用例——尤其是「装的就是最新
却提示有更新」这个回归点。

### 5. 文案走 `src/client/locales.ts`

固定中文，两个语言槽都指向同一份。唯一的例外是弹窗的降级路径（`DIALOG_FAILURE_TEXT`）：它不查文案表，
因为查表本身可能就是抛错的原因。

## 测试

| 文件 | 内容 | 依赖 |
| --- | --- | --- |
| `tests/install.test.mjs` | 安装器 junction/copy/uninstall、受管 patch 块、发布文件清单 | 无 |
| `tests/version.test.mjs` | semver 排序、`app-update.yml`/通道清单解析、`decideUpdate` 各分支 | 无（自己用 rolldown 打包 `src/version.ts`） |
| `tests/panel-render.test.mjs` | 真挂载面板、真点按钮：弹窗出现、按钮存活、桌面版已是最新、版本不明 | 从 DSH 仓库取 react/react-dom/jsdom，取不到整组 skip |

`DSH_UPDATER_VERIFY_DEPS=<仓库根>` 可以指定面板测试的依赖来源；未设置时依次尝试 `DSH_REPO` 和作者开发机上的 `<DSH checkout>`，都找不到就整组 skip（插件源码本身放在哪个目录都不影响它）。

## 提交信息

用 Conventional Commits，英文，例如 `fix(panel): ...`、`docs: ...`、`chore(release): v0.2.1`。
发版时同步更新 `CHANGELOG.md` 与 `package.json` 的 `version`，然后打 `v*` tag。
