# @deepseek-ai/dsh-client-ui-dsh-updater

[![CI](https://github.com/msyrain/ui-dsh-updater/actions/workflows/ci.yml/badge.svg)](https://github.com/msyrain/ui-dsh-updater/actions/workflows/ci.yml)

DSH 版本检测与一键升级插件，打包成一个**可直接安装的 DSH bundle 包**。[更新日志](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md)

- 浏览器半部：在侧边栏底部注册 `sidebar.footer.action` 入口（渲染在设置之上），弹出面板显示「当前版本 / 最新版本 / 是否有更新」，并支持一键升级。
- 主机半部：注册 `GET /api/dsh-updater/status` 与 `POST /api/dsh-updater/update` 两个路由（挂在 connection 的传输中立鉴权 Fetch 通道上）。
- 自带注册层：`cordis.patch.yml` 声明 `dsh.bundle.patch`；另有 `install.mjs` 安装器，把同一行 patch 写进 profile 自己的 `cordis.patch.yml`。两种方式都**不需要修改 DSH 仓库任何文件**。

## 安装

本插件是标准的 **profile 插件**：安装器在目标 profile 里放一份能被 DSH 解析到的模块（默认是指向源码目录的 **junction**），并把一行 patch 写进该 profile 自己的 `cordis.patch.yml`——不碰 DSH 仓库，也不用改 profile 的 `package.json`。

`dsh web` 与 DeepSeek Harness 桌面版是**两个独立的 profile**，各装一次：

| | `dsh web`（源码版） | DeepSeek Harness 桌面版 |
| --- | --- | --- |
| 安装命令 | `node install.mjs` | `node install.mjs --profile desktop` |
| profile 目录 | `%USERPROFILE%\.dsh\profiles\web` | `%USERPROFILE%\.dsh\profiles\desktop` |
| 当前版本来源 | git tag / commit（或 `.dsh-build` 记录） | 桌面安装包清单（`app.asar/package.json` 等） |
| 最新版本来源 | GitHub 仓库 | 桌面应用自己的发布通道 |
| 一键升级 | 可用 | 不适用（走应用内更新） |
| 改动生效 | 重启 dsh 服务（之后只改浏览器半部时刷新页面即可） | 重启桌面应用 |

### 源码目录可以放在任意位置

安装器按**自身所在位置**推算包根（`install.mjs` 用 `import.meta.url`），profile 里只保存 junction 或副本，不记录任何源码绝对路径。因此：

- 源码可以放在任意盘符、任意层级、含空格或中文的目录；
- 把源码目录整体挪走之后，**重跑一次 `node install.mjs`** 即可重建联接（悬空联接会被自动识别并替换，不会报 EEXIST）；
- 下面的命令都在**插件目录**里执行，`cd` 到你自己放源码的地方即可。

### 装到 `dsh web`（源码版）

```powershell
cd <插件目录>
node install.mjs                      # 等价于 --profile web
```

- 前提：`dsh web` 已经跑过一次，`%USERPROFILE%\.dsh\profiles\web` 存在；用了自定义 `DSH_HOME` 时加 `--dsh-home <路径>`。
- 行为：**源码版**。`repoPath` 未配置时取 dsh 服务进程的工作目录（也就是你启动 `dsh web` 的 checkout 根），最新版本来自 GitHub 仓库；一键升级可用。
- 生效：宿主在启动时装配 profile 的 patch 层，所以装完**重启一次 dsh 服务**；之后只改浏览器半部时刷新页面（Ctrl+F5）即可，改插件代码仍然要重启宿主。

### 装到 DeepSeek Harness 桌面版

```powershell
cd <插件目录>
node install.mjs --profile desktop    # 写到 %USERPROFILE%\.dsh\profiles\desktop
```

- 前提：桌面版至少启动过一次（该 profile 目录由桌面版首次启动时创建）。安装器找不到 profile 时会直接报错，而不是到处乱写。
- 行为：**桌面版**。当前版本读桌面安装包（`DSH_CLIENT_VERSION` → `app.asar/package.json` → `desktop-runtime.json`），最新版本读桌面自己的发布通道（`app-update.yml` → `<channel>.yml`）；一键升级不适用，面板把用户指到应用内更新。
- 生效：桌面版不监视插件源码，**装完或改完都要重启一次 DeepSeek Harness**。
- 卸载：`node install.mjs --profile desktop --uninstall`。

### 安装器写进 profile 的内容

安装器只改 profile 自己的 `cordis.patch.yml`，而且只动它自己那段标记块，你已有的其他 patch 原样保留（首次安装时那行空顶层数组 `[]` 会被丢掉，否则文件不再是合法 YAML）：

```yaml
# >>> ui-dsh-updater (managed by install.mjs) >>>
# 一行常驻行：模块路径由安装器维护，插件自带默认配置。
- insert:
    - id: ui-dsh-updater
      name: './ui-dsh-updater/lib/index.js'
# <<< ui-dsh-updater <<<
```

### 联接还是副本

| 安装方式 | profile 里的安装目录 | 改动源码目录后 |
| --- | --- | --- |
| `node install.mjs`（默认） | 指向源码目录的 **junction** | **自动生效**，无需任何操作 |
| `node install.mjs --copy` | 一份**真实副本** | **不会自动过去**，必须 `node sync.mjs` |
| `dsh plugin add` | pnpm 安装的副本 | 不会自动过去 |

副本模式下这个失败是**静默的**：主机半部继续从旧副本工作、浏览器半部继续提供旧 bundle，表现就是「我明明改了却好像没生效」。同步命令：

```powershell
node sync.mjs          # 报出漂移，然后重新复制运行文件
node sync.mjs --check  # 只报漂移、不写入；有漂移时退出码为 1
```

同步后仍需**刷新页面**：浏览器 bundle 是按内容寻址的，页面在加载时（或经客户端 HMR 通道）才取到新版本。

> 开发时建议用**联接模式**（默认），此时 `node sync.mjs` 会直接告诉你「已是联接，无需同步」，每次改动都是实时的。

> ⚠️ 安装器用 Node 的 `symlinkSync(..., 'junction')` 建联接，不做控制台代码页转换，所以路径含空格或中文都没问题。**不要**用 Windows PowerShell 5.1 手工 `New-Item -ItemType Junction`：那条路会把非 ASCII 路径按 ANSI 码页转写。

### 验证

```powershell
# web profile（需要能用 dsh 命令）
dsh --profile web --dump-config | Select-String ui-dsh-updater

# 通用：直接看 profile 里的受管块（web / desktop 换成对应 profile 名）
Select-String -Path "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml" -Pattern 'ui-dsh-updater'
```

应能看到 `- id: ui-dsh-updater` 与 `name: './ui-dsh-updater/lib/index.js'`。随后：

- `dsh web`：刷新页面，侧边栏底部（设置之上）出现更新入口；
- 桌面版：重启 DeepSeek Harness，入口同样出现在设置上方。

### 卸载

- 联接 / 副本模式：`node install.mjs --uninstall`（web）或 `node install.mjs --profile desktop --uninstall`（桌面版）。它会先删 patch 行再删安装目录。
- 联接下**不要**用资源管理器递归删除安装目录，那会跟进源码目录。
- 组合包模式：`dsh plugin --profile <web|desktop> remove @deepseek-ai/dsh-client-ui-dsh-updater`。

### 另一种安装方式：`dsh plugin add`

本包同时声明了 `dsh.bundle.patch`，所以 DSH 官方方式也适用（在能用 `dsh` 命令的环境里执行；桌面版把 `--profile web` 换成 `--profile desktop`）：

```powershell
dsh plugin --profile web add "<插件目录>"
```

它把本包写进 profile 的依赖并登记到 `dsh.profile.bundles`，由 pnpm 安装、**下次启动**才加入层栈，也没有 junction 的实时性。

**两种方式二选一**：它们都往层栈里插一条 id 为 `ui-dsh-updater` 的行，同时使用会出现两条 insert（安装器检测到 profile 已登记本包时会在输出里提醒）。

## 构建

`lib/` 是可安装产物，仓库里已附带一份预构建结果；改动 `src/` 后需要重新构建（在插件目录里执行）：

```powershell
pnpm install --ignore-scripts
pnpm run build      # node scripts/build.mjs → lib/index.js, lib/invariant.js, lib/client.js
pnpm run verify     # 校验产物契约（装载器包装、外部依赖、无残留全局、不读外壳的图标导出）
pnpm test           # node --test "tests/*.test.mjs"：安装器 + 版本判定 + 面板渲染
pnpm run typecheck  # 可选，需要 devDependencies
```

构建不依赖 DSH 单体仓库的构建系统，只用到 `rolldown` 与 `lightningcss`。

**构建是可复现的**：同一份源码在任何目录、任何机器构建出的 `lib/` 字节相同——产物里不写本机绝对路径、CSS 类名前缀固定为 `dshUpdater_`、类名映射按名字排序，且只有显式设置 `DSH_REPO` / `DSH_UPDATER_REPO` 时才会把 DSH checkout 的 commit 烙进浏览器半部。CI 的 `artifact` 作业因此能直接校验「已提交的 `lib/` 与源码一致」；`assertClientArtifact()` 还会在产物里发现绝对路径时让构建失败。

`tests/panel-render.test.mjs` 用 rolldown + jsdom + react-dom 真挂载面板、真点按钮，验证「点入口 → 弹窗出现、入口按钮不消失」，以及「桌面版已是最新时不显示检测到新版本」「版本不明时既不谎报更新也不谎报最新」。这三个依赖取自 DSH checkout（本包不为此新增依赖），按顺序尝试 `DSH_UPDATER_VERIFY_DEPS`、`DSH_REPO`、作者开发机上的 `<DSH checkout>`；取不到就整组 skip，不影响其他机器上的 `pnpm test`。

`tests/version.test.mjs` 不需要任何外部依赖：直接用 rolldown 打包 `src/version.ts` 来跑版本判定的纯逻辑（semver 预发布排序、app-update.yml/通道清单解析、`decideUpdate` 的各种「不能判断」分支）。

## 产物契约

| 文件 | 形态 | 说明 |
| --- | --- | --- |
| `lib/index.js` | ESM，`platform: node` | 主机半部，只引用 `node:` 内建模块 |
| `lib/invariant.js` | ESM | invariant 伴生件 |
| `lib/client.js` | CJS 闭包工厂 | `window.__ModuleLoader__.load({ id, factory: (require) => { ... } })` |

浏览器半部的规则（与仓库 `packages/client/tsdown.client.ts` 一致）：

- `id` 就是包名，`client-modules` 节点半部按包名登记该工厂；
- 平台模块（`react`、`react/jsx-runtime`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-*` 等）保持 external，由外壳 module table 的 `require` 提供真实实例——因此本包**没有运行时依赖**，也不会打包出第二份 react；
- **图标不取外壳的图标导出**：DSH 的图标名会随版本改名（0.1.6 是 `IconDownloadOutline16`，0.1.7 改成 `IconDownloadOutlineRegular`），而 external 的 primitives 由运行时那一个版本提供；名字对不上时具名导出是 `undefined`，渲染 undefined 组件会抛错，`sidebar.footer.action` 这个 list 席位随即 abdicate（注册退位、只剩一个空的 `data-slot-error` 行）——界面上就是「点一下『DSH 更新』，按钮消失、弹窗也不出来」。所以字形一律用本包自带的 `src/client/icons.tsx`，`pnpm run verify` 会在产物里拦下任何对外部模块的 `Icon*` 读取；
- 弹窗内容拆成独立的 `UpdaterDialog` 组件，入口那层用 `DialogBoundary` 包住它：渲染期的错误被就地接住、降级成一条带错误详情的弹窗，入口按钮不受影响（如果弹窗 JSX 内联在入口组件自己的 render 里，抛错发生在边界元素被返回之前，任何内层边界都接不住，错误会直接冲到席位边界）；
- CSS Modules 在包内编译成「注入 `<style>` + 导出类名映射」的模块；
- `process.env` / `import.meta.env` 由 `transform.define` 静态替换。注意 rolldown 1.2 起 `define` 位于 `transform.define`，放在顶层会被**静默忽略**——构建脚本末尾的自检就是为此把关。

## 目录

```
ui-dsh-updater/
├── package.json               dsh.bundle + dsh.client 声明、exports、files、npm 脚本
├── cordis.patch.yml           组合包（dsh plugin add）方式的注册层：插入 ui-dsh-updater 行
├── install.mjs                安装器：junction / --copy / --uninstall / --profile / --dsh-home
├── sync.mjs                   副本模式的漂移检查与同步（--check 只报不写）
├── dsh-updater-run.ps1        随包分发的安全升级脚本（纯 ASCII）
├── tsconfig.json              编辑器/类型检查用（noEmit）
├── .github/workflows/ci.yml   CI：离线测试矩阵 + 已提交产物一致性
├── scripts/build.mjs          独立打包（rolldown + lightningcss，可复现）
├── scripts/package-files.mjs  包文件清单的唯一来源（安装器、同步器与 npm 共用）
├── scripts/verify-bundle.mjs  产物契约校验（纯 Node，无依赖）
├── tests/install.test.mjs     安装模式行为测试（node --test，只用临时 DSH home）
├── tests/version.test.mjs     版本判定纯逻辑测试（semver / 更新源清单 / 不误报）
├── tests/panel-render.test.mjs 面板渲染冒烟测试（jsdom + react-dom，缺依赖则 skip）
├── src/                       主机半部（含 version.ts 版本判定）+ import 伴生件 + 浏览器半部
├── CHANGELOG.md               版本变更记录
├── CONTRIBUTING.md            五条硬约束与开发回路
├── LICENSE                    MIT
└── repo-legacy/               旧「拷进 DSH 仓库」方式专用的构建配置（已归档）
```

## 配置

`cordis.patch.yml` 里的默认值可在 **profile 自己的** `cordis.patch.yml` 中按同一行 id 覆盖（patch 会整体替换该行的 `config`）；`install.mjs` 写的那段标记块不要手改，它会整段重写：

```yaml
- id: ui-dsh-updater
  config:
    repoPath: 'C:\src\deepseek-harness'   # 可选，仅源码版读取；不填则用 dsh 服务进程的工作目录
    githubRepo: 'deepseek-ai/deepseek-harness'  # 仅源码版读取
    updateScript: 'dsh-updater-run.ps1'  # 绝对路径，或相对 repoPath
    port: 3080
    allowUpdate: true
```

`updateScript` 未配置时优先使用**随包分发**的脚本，该文件不存在时才回退到 `repoPath` 下的同名脚本（兼容旧的手工安装）。

## 版本从哪来（桌面版 / 源码版）

同一个面板在两种运行形态下读不同的版本源，**不混用**：

| | 桌面打包版 | 源码版（`pnpm dsh web` 从 checkout 启动） |
| --- | --- | --- |
| 判据 | 跑在 Electron 里且安装包带 `app-update.yml` | `repoPath` 是 git 仓库或有 `.dsh-build` 记录 |
| 当前版本 | 宿主注入的 `DSH_CLIENT_VERSION` → `app.asar/package.json` → `desktop-runtime.json` 的 `release.version` | git `describe --tags` / `rev-parse`，回退构建记录 |
| 最新版本 | `app-update.yml` 指向的发布通道：`<url>/<channel>.yml`（与桌面自身的更新检查同一个清单） | GitHub 仓库的 release/tag + `master` HEAD |
| 是否有更新 | 通道版本 **高于** 本机版本 | 版本更高；版本相同时看 commit 是否不同 |
| 一键升级 | 不适用（签名打包应用，没有仓库可拉）→ 按钮禁用并提示走应用内更新 | 脚本可用时开放 |

**版本事实不全时一律不提示更新**，面板显示「无法判断」并说明原因（`current-unknown` / `feed-unreachable` / `feed-invalid`）。这条是硬规则：旧实现里「本地没有 tag 就当远端有更新」在桌面版上恒定成立——桌面版既没有 git 仓库也没有构建记录，于是「已经是最新还一直提示有更新」。

## 为什么一个包能同时装进两种 profile

- **加载面完全同构**：host 半部只引用 `node:` 内建模块（`pnpm run verify` 据此把关），浏览器半部只 require 外壳 module table 的 platform 模块，因此不依赖 profile 的 `node_modules` 去解析 `@deepseek-ai/*`；`connection.fetch` 注册的路由在 Web 的 HTTP 服务器与桌面组合的传输里都能派发；`sidebar.footer.action` 槽位、文案、图标两边一致。
- **两个 profile 是两个独立的 host 进程**，各自加载、各自按自己的运行形态判定；同时跑也行，互不影响（插件的路由各自注册在自己的 host 上）。
- **差异只有能力，不是兼容性**：桌面版没有可拉取的仓库、产物目录签名只读，所以一键升级禁用；它报告的最新版本来自桌面发布通道，而不是 GitHub 的源码仓库。同一台机器上两条线版本号本来就不一样，别拿它们互相比较。

已知限制：桌面版的版本检查走 Node 的 `fetch`，不继承桌面壳的代理设置（桌面自己的更新器走 Electron `net`）。在必须走代理的网络里，面板可能显示「连不上版本源」而不是「有新版本」——这是有意的保守降级，不会谎报。

## 一键升级做什么

仅**源码版**开放：`POST /api/dsh-updater/update` 触发后，脚本在后台执行：

1. `git fetch`（origin 直连失败自动切 gh-proxy.com 镜像，均带低速超时）；
2. `git merge --ff-only`（失败即中止，不动服务）；
3. `pnpm install` → `pnpm run build`（失败即中止，不动服务）；
4. 只停掉占用端口的旧服务进程后重新启动。

桌面打包版没有仓库可拉、产物目录也是签名只读的，接口只回 `{ started: false, reason: 'desktop-managed' }`，面板把用户指到桌面应用自己的更新入口。

日志写在仓库根 `dsh-updater-last-run.log`。脚本必须保持**纯 ASCII**：插件用 Windows PowerShell 5.1 执行它，无 BOM 的 UTF-8 中文会被按 GBK 错解码，产生幻影引号导致语法错误。
