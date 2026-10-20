# repo-legacy —— 旧的「拷进 DSH 仓库」安装方式专用文件

这里的文件**不属于**当前的可安装包，只为保留旧流程而归档。

## 背景

0.1.x 版本的插件是 DSH 单体仓库里的一个工作区包，安装方式是：

1. 把 `ui-dsh-updater` 拷进 `D:\deepseek-harness\packages\client\`；
2. 手改仓库的 `packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/package.json`、`tsconfig.client.json`；
3. 在仓库里 `pnpm install && pnpm run build` 整体重建 DSH。

这条路线的问题是：每次升级 DSH 都要重新注册、并且要为一个插件重建整个 DSH。

## 现在的做法

插件已改为**独立可安装包**（0.2.0）：

- 自带 `dsh.bundle.patch`（`cordis.patch.yml`）注册层，不再改仓库任何文件；
- 自带预构建 `lib/index.js`、`lib/client.js`，由 `scripts/build.mjs` 独立产出，不依赖仓库构建系统；
- 安装走官方机制：`dsh plugin --profile web add <包目录>`。

因此这里的文件不再参与构建。仅当你确实想回到「仓库内工作区包」的集成方式时才会用到它们：

- `tsdown.config.ts` —— 复用仓库 `packages/client/tsdown.client.ts` 的 `clientBundle` 预设；
- `tsconfig.host.json` / `tsconfig.client.json` —— 通过 project references 指向 `vendor/cordis`、`packages/client/*`；
- `.verify/boot-desktop-check.ts` —— 针对桌面组合的启动校验脚本。

要使用它们，需要把本目录整体还原到包根（`repo-legacy/tsconfig.client.json` → `tsconfig.client.json` 等），并把包拷进仓库。
