# 更新日志

## 0.2.2 — 2026-10-20

### 文档

- README 把 `dsh web` 与 DeepSeek Harness 桌面版的**安装模式分开写**：每个模式一条命令、一个 profile 目录、一套版本来源，并说明一键升级是否适用、改动怎样生效（重启宿主 / 刷新页面）。
- 新增「源码目录可以放在任意位置」：安装器按自身位置推算包根，profile 里只放 junction/副本；文档里的命令统一改成 `cd <插件目录>`，并写清「源码整体挪走后重跑安装即可重建联接」。
- 删除 README 与示例配置里机器特定的绝对路径；配置示例换成中性占位。
- 安装器提示改为「重启拥有该 profile 的宿主（dsh web 服务或桌面应用）」，不再声称 patch 行免重启挂载——当前 DSH 在启动时装配 profile 的 patch 层。

## 0.2.1 — 2026-10-20

### 修复

- **桌面打包版不再恒报「有更新」**：桌面版既没有 git 仓库也没有构建记录，旧逻辑把「本地没有 tag」
  当成「远端有更新」，于是即使已经最新也一直提示。现在按运行形态选版本源：桌面版读应用清单
  （`DSH_CLIENT_VERSION` → `app.asar/package.json` → `desktop-runtime.json`）并和桌面应用自己的
  发布通道（`app-update.yml` → `<channel>.yml`）比较；源码版仍走 git tag/commit + GitHub。
- **版本事实不全时只报「无法判断」**：`current-unknown` / `feed-unreachable` / `feed-invalid`
  三种原因分别有文案，绝不谎报有更新，也不再冒充「当前已是最新版本」。

### 变更

- 浏览器半部产物**可复现**：不再把本机绝对路径写进 CSS 虚拟模块 id 与 region 注释，类名前缀改为固定的
  `dshUpdater_`，CSS Modules 类名映射按类名排序；未显式设置 `DSH_REPO` 时不再把本机 DSH checkout 的
  commit 烙进产物。同一份源码在任何目录/机器构建出的字节相同。

### 新增

- CI：离线测试矩阵（Node 22 / 24）+ 「已提交的浏览器产物与源码一致」校验。
- `CONTRIBUTING.md`、`CHANGELOG.md`，以及构建时的绝对路径泄漏自检。

## 0.2.0 — 2026-10-20

首个公开版本。

- 侧边栏「设置」上方的入口，弹窗展示当前版本 / 最新版本 / 更新状态，支持「立即检查」。
- 源码版（`dsh web` 从 checkout 启动）支持一键升级：`git fetch` → `--ff-only` merge → `pnpm install` →
  `pnpm run build` → 只重启占用端口的旧进程。
- 桌面打包版检测：一键升级不适用（签名只读产物），按钮禁用并指到应用内更新。
- 图标改为随包自带字形：DSH 0.1.6 的 `IconDownloadOutline16` 在 0.1.7 改名为
  `IconDownloadOutlineRegular`，取不到时渲染 `undefined` 会让整个侧边栏席位退位（表现为「点一下按钮，
  按钮消失、弹窗也不出来」）。
- 弹窗内容拆成独立组件并由错误边界包住：弹窗内部渲染失败就地降级，入口按钮始终存活。
