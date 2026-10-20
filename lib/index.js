import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/version.ts
/** semver 文本形态；允许省略次/补丁位，允许 rc 这类预发布标识。 */
const SEMVER_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;
/** 去掉 git tag 常见的 `dsh-` / `v` 前缀。 */
function stripVersionPrefix(value) {
	return value.trim().replace(/^dsh-/iu, "").replace(/^v/iu, "");
}
/**
* 解析 semver。
* @param value - 版本或 tag 文本；null/undefined/不可解析返回 null。
* @returns 解析结果或 null。
*/
function parseSemVer(value) {
	if (typeof value !== "string") return null;
	const matched = SEMVER_PATTERN.exec(stripVersionPrefix(value));
	if (matched === null) return null;
	const prerelease = matched[4] === void 0 ? [] : matched[4].split(".").map((part) => /^\d+$/u.test(part) ? Number(part) : part);
	return {
		major: Number(matched[1]),
		minor: Number(matched[2] ?? "0"),
		patch: Number(matched[3] ?? "0"),
		prerelease
	};
}
/**
* 比较两个版本（semver 规则：0.2.1-rc.2 < 0.2.1-rc.10 < 0.2.1）。
* @param left - 左侧版本。
* @param right - 右侧版本。
* @returns -1/0/1；任一不可解析返回 null。
*/
function compareSemVer(left, right) {
	const a = parseSemVer(left);
	const b = parseSemVer(right);
	if (a === null || b === null) return null;
	if (a.major !== b.major) return a.major < b.major ? -1 : 1;
	if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
	if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
	if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
	if (a.prerelease.length === 0) return 1;
	if (b.prerelease.length === 0) return -1;
	for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
		const partA = a.prerelease[index];
		const partB = b.prerelease[index];
		if (partA === void 0) return -1;
		if (partB === void 0) return 1;
		if (partA === partB) continue;
		if (typeof partA === "number" && typeof partB === "number") return partA < partB ? -1 : 1;
		if (typeof partA === "number") return -1;
		if (typeof partB === "number") return 1;
		return partA < partB ? -1 : 1;
	}
	return 0;
}
/**
* 判断远端是否真的领先。
*
* 桌面版只比版本号：更新源是桌面应用自己的发布通道，宁可说「无法判断」也不猜。
* 源码版先比版本号（tag/构建记录），版本相同再比 commit，语义是「上游有新提交」。
* @param mode - 运行形态。
* @param current - 当前版本事实。
* @param latest - 远端版本事实；取不到为 null。
* @returns 判定结果。
*/
function decideUpdate(mode, current, latest) {
	if (latest === null) return {
		hasUpdate: false,
		error: "feed-unreachable"
	};
	if (mode === "desktop") {
		const currentVersion = current.version ?? current.tag;
		if (currentVersion === null) return {
			hasUpdate: false,
			error: "current-unknown"
		};
		const latestVersion = latest.version ?? latest.tag;
		if (latestVersion === null) return {
			hasUpdate: false,
			error: "feed-invalid"
		};
		const order = compareSemVer(latestVersion, currentVersion);
		if (order === null) return {
			hasUpdate: false,
			error: "feed-invalid"
		};
		return {
			hasUpdate: order > 0,
			error: null
		};
	}
	if (mode === "source") {
		const order = compareSemVer(latest.version ?? latest.tag, current.version ?? current.tag);
		if (order !== null) {
			if (order !== 0) return {
				hasUpdate: order > 0,
				error: null
			};
			if (latest.commit !== null && current.commit !== null && latest.commit.toLowerCase() !== current.commit.toLowerCase()) return {
				hasUpdate: true,
				error: null
			};
			return {
				hasUpdate: false,
				error: null
			};
		}
		if (latest.commit !== null && current.commit !== null) return {
			hasUpdate: latest.commit.toLowerCase() !== current.commit.toLowerCase(),
			error: null
		};
		return {
			hasUpdate: false,
			error: "current-unknown"
		};
	}
	return {
		hasUpdate: false,
		error: "current-unknown"
	};
}
/** 顶层标量行：`key: value`，不匹配缩进行与块标量。 */
const TOP_LEVEL_SCALAR = /^([A-Za-z][\w-]*):[ \t]+(.*)$/u;
/**
* 取 YAML 顶层的标量键值（够用即止：本插件只读 provider/url/channel/version 这类一行值）。
* @param text - YAML 文本。
* @returns 顶层标量映射。
*/
function topLevelScalars(text) {
	const values = {};
	for (const line of text.split(/\r?\n/u)) {
		if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
		if (/^[ \t]/u.test(line)) continue;
		const matched = TOP_LEVEL_SCALAR.exec(line);
		if (matched === null) continue;
		const value = matched[2].trim();
		if (value === ">" || value === ">-" || value === "|" || value === "|-") continue;
		values[matched[1]] = value.replace(/^(['"])(.*)\1$/u, "$2");
	}
	return values;
}
/**
* 解析 app-update.yml。
* @param text - 文件内容。
* @returns 更新源；没有 url 时返回 null（此时无法检查更新）。
*/
function parseUpdateFeed(text) {
	const values = topLevelScalars(text);
	const url = values.url;
	if (url === void 0 || url === "") return null;
	return {
		provider: values.provider ?? "generic",
		url,
		channel: values.channel ?? null
	};
}
/**
* 拼出通道清单地址（electron-updater 约定：Windows `<channel>.yml`，macOS `<channel>-mac.yml`）。
* @param feedUrl - 更新源目录（可以没有结尾斜杠）。
* @param channel - 通道名。
* @param platform - 目标平台，默认当前进程。
* @returns 清单绝对地址；拼不出来返回 null。
*/
function channelManifestUrl(feedUrl, channel, platform = process.platform) {
	const suffix = platform === "darwin" ? "-mac" : platform === "linux" ? "-linux" : "";
	const base = feedUrl.endsWith("/") ? feedUrl : `${feedUrl}/`;
	try {
		return new URL(`${channel}${suffix}.yml`, base).href;
	} catch {
		return null;
	}
}
/**
* 从 electron-updater 的通道清单里取顶层 version。
* @param text - `<channel>.yml` 内容。
* @returns 版本号或 null。
*/
function versionFromChannelManifest(text) {
	const version = topLevelScalars(text).version;
	if (version === void 0 || parseSemVer(version) === null) return null;
	return version;
}
/**
* 从桌面应用清单里取更新通道（缺省 nightly，与桌面壳的 update-channel.ts 一致）。
* @param value - app.asar/package.json 的 dshDesktopUpdateChannel 字段。
* @returns 通道名。
*/
function desktopChannelFromManifest(value) {
	return value === "latest" ? "latest" : "nightly";
}
//#endregion
//#region src/index.ts
/**
* DSH 更新器插件，node half。在 connection 的鉴权通道上注册两个精确路由供浏览器半部调用：
*  - GET  /api/dsh-updater/status  当前版本 + 最新版本 + 是否有新版本
*  - POST /api/dsh-updater/update  触发一次安全的 DSH 升级流程
* 走 connection.fetch 而不是 ctx.webServer：该注册表是传输中立的，Web 的
* HTTP 服务器与 Electron 桌面版的 IPC 传输都从同一个 shared fetch handler 派发，
* 因此本插件不会因为桌面组合按设计禁用 webserver 行而永远 pending。
* 该包同时是 dsh.client 包，浏览器半部通过 exports["./client"] 提供。
*
* 两种运行形态各有各的版本来源，绝不混用：
*  - 桌面打包版（Electron Node 模式）：当前版本取应用清单 / 宿主注入的 DSH_CLIENT_VERSION，
*    最新版本取安装包 app-update.yml 指向的发布通道（和桌面自身的更新检查同一个源）。
*    这条通道下没有 git 仓库，所以「一键升级」不适用，面板只负责如实报告。
*  - 源码仓库（pnpm dsh web 从 checkout 启动）：当前版本取 git tag/commit（回退构建记录），
*    最新版本取 GitHub 仓库。
* 版本事实都拿不到时（mode=unknown）**不提示更新**，只报告「无法判断」。
*/
/** 本包根目录（lib/index.js 的上一级），用于定位随包分发的升级脚本。 */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 随包分发的安全升级脚本文件名。 */
const BUNDLED_UPDATE_SCRIPT = "dsh-updater-run.ps1";
/** 桌面安装包里的更新源清单（electron-builder 生成）。 */
const APP_UPDATE_MANIFEST = "app-update.yml";
/** 桌面应用清单（Electron 打包后位于 app.asar 根）。 */
const APP_ASAR_MANIFEST = "app.asar/package.json";
/** 桌面运行时描述（记录内置 dsh 的发布版本）。 */
const DESKTOP_RUNTIME_DESCRIPTOR = "app.asar/dsh/desktop-runtime.json";
/** 注册路由所需服务：connection 提供传输中立的鉴权 Fetch 通道。 */
const inject = ["connection"];
/**
* 读一个 JSON 文件；任何失败都当作「没有」。
* @param path - 绝对路径。
* @returns 解析结果或 undefined。
*/
function readJsonFile(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return;
	}
}
/**
* Electron 打包版的 resources 目录；非桌面版返回 null。
*
* 判据是「跑在 Electron 里 + 安装包带 app-update.yml 更新源」：源码 checkout 用
* `pnpm dsh web` 启动时 process.versions.electron 不存在，普通 Node 进程也拿不到 resourcesPath。
* @returns resources 绝对路径或 null。
*/
function desktopResourcesDir() {
	if (process.versions.electron === void 0) return null;
	const resources = process.resourcesPath ?? resolve(dirname(process.execPath), "resources");
	return existsSync(resolve(resources, APP_UPDATE_MANIFEST)) ? resources : null;
}
/**
* 桌面版当前版本与更新通道。
*
* 版本来源按可信度排序：宿主注入的 DSH_CLIENT_VERSION（桌面壳把构建版本传给 Host）→
* app.asar 的应用清单 → 桌面运行时描述里的 release.version。
* @param resourcesDir - 桌面 resources 目录。
* @returns 版本（可能为 null）与通道。
*/
function desktopVersionFacts(resourcesDir) {
	const manifest = readJsonFile(resolve(resourcesDir, APP_ASAR_MANIFEST));
	const runtime = readJsonFile(resolve(resourcesDir, DESKTOP_RUNTIME_DESCRIPTOR));
	return {
		version: [
			typeof process.env.DSH_CLIENT_VERSION === "string" ? process.env.DSH_CLIENT_VERSION : null,
			typeof manifest?.version === "string" ? manifest.version : null,
			typeof runtime?.release?.version === "string" ? runtime.release.version : null
		].find((value) => value !== null && parseSemVer(value) !== null) ?? null,
		channel: desktopChannelFromManifest(manifest?.dshDesktopUpdateChannel)
	};
}
/**
* 读桌面安装包的更新源。
* @param resourcesDir - 桌面 resources 目录。
* @returns 更新源或 null。
*/
function desktopUpdateFeed(resourcesDir) {
	try {
		return parseUpdateFeed(readFileSync(resolve(resourcesDir, APP_UPDATE_MANIFEST), "utf8"));
	} catch {
		return null;
	}
}
/** 从 .dsh-build 记录读取 commit 作为 git 失败时的回退。 */
function commitFromBuildRecord(repoPath) {
	try {
		const raw = readFileSync(resolve(repoPath, ".dsh-build", "client-build-environment.json"), "utf8");
		return JSON.parse(raw).environment?.DSH_CLIENT_COMMIT_HASH ?? null;
	} catch {
		return null;
	}
}
/**
* 源码仓库模式的当前版本：优先 git tag/commit，其次构建记录。
* @param repoPath - DSH 仓库根。
* @returns 版本事实。
*/
function sourceVersionFacts(repoPath) {
	let commit = null;
	let tag = null;
	try {
		commit = execFileSync("git", [
			"rev-parse",
			"--short=7",
			"HEAD"
		], {
			cwd: repoPath,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
	} catch {
		commit = commitFromBuildRecord(repoPath);
	}
	try {
		const described = execFileSync("git", [
			"describe",
			"--tags",
			"--abbrev=0"
		], {
			cwd: repoPath,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
		tag = described === "" ? null : described;
	} catch {
		tag = null;
	}
	let version = null;
	if (tag !== null && parseSemVer(tag) !== null) version = tag.replace(/^dsh-/iu, "").replace(/^v/iu, "");
	return {
		version,
		tag,
		commit
	};
}
/**
* 探测运行形态与当前版本。
* @param config - 插件配置。
* @returns 探测结果。
*/
function detectRuntime(config) {
	const repoPath = config.repoPath ?? process.cwd();
	const resources = desktopResourcesDir();
	if (resources !== null) {
		const { version, channel } = desktopVersionFacts(resources);
		return {
			mode: "desktop",
			current: {
				version,
				tag: null,
				commit: null
			},
			feed: desktopUpdateFeed(resources),
			channel,
			repoPath
		};
	}
	const current = sourceVersionFacts(repoPath);
	return {
		mode: current.version !== null || current.tag !== null || current.commit !== null ? "source" : "unknown",
		current,
		feed: null,
		channel: null,
		repoPath
	};
}
/**
* 查询桌面发布通道的最新版本（与桌面应用自己的更新检查同一个清单）。
* @param feed - 更新源。
* @param channel - 通道名。
* @returns 远端版本事实；取不到返回 null。
*/
async function desktopLatest(feed, channel) {
	const url = channelManifestUrl(feed.url, channel);
	if (url === null) return null;
	try {
		const response = await fetch(url, { headers: { "user-agent": "dsh-updater" } });
		if (!response.ok) return null;
		const version = versionFromChannelManifest(await response.text());
		if (version === null) return null;
		return {
			version,
			tag: version,
			commit: null,
			publishedAt: null
		};
	} catch {
		return null;
	}
}
/** 查询 GitHub 远端状态：默认分支 HEAD commit + 最新 release/tag（源码模式）。 */
async function githubLatest(githubRepo) {
	const headers = { "User-Agent": "deepseek-harness" };
	let commit = null;
	let tag = null;
	let publishedAt = null;
	try {
		const response = await fetch(`https://api.github.com/repos/${githubRepo}/commits/master`, { headers });
		if (response.ok) commit = ((await response.json()).sha ?? "").slice(0, 7) || null;
	} catch {}
	try {
		const response = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, { headers });
		if (response.ok) {
			const data = await response.json();
			tag = data.tag_name ?? null;
			publishedAt = data.published_at ?? null;
		}
	} catch {}
	if (!tag) try {
		const response = await fetch(`https://api.github.com/repos/${githubRepo}/tags`, { headers });
		if (response.ok) tag = (await response.json())?.[0]?.name ?? null;
	} catch {}
	if (!commit && !tag) return null;
	return {
		version: tag !== null && parseSemVer(tag) !== null ? tag.replace(/^dsh-/iu, "").replace(/^v/iu, "") : null,
		tag,
		publishedAt,
		commit
	};
}
/**
* 组装 /status 响应。
* @param config - 插件配置。
* @param allowUpdate - 是否允许一键升级。
* @returns 版本状态。
*/
async function buildStatus(config, allowUpdate) {
	const shape = detectRuntime(config);
	if (shape.mode === "desktop") {
		const latest = shape.feed === null ? null : await desktopLatest(shape.feed, shape.channel ?? "nightly");
		const decision = decideUpdate("desktop", shape.current, latest);
		return {
			ok: true,
			mode: "desktop",
			current: shape.current,
			latest,
			hasUpdate: decision.hasUpdate,
			upgradeable: false,
			error: decision.error
		};
	}
	if (shape.mode === "source") {
		const latest = await githubLatest(config.githubRepo ?? "deepseek-ai/deepseek-harness");
		const decision = decideUpdate("source", shape.current, latest);
		return {
			ok: true,
			mode: "source",
			current: shape.current,
			latest,
			hasUpdate: decision.hasUpdate,
			upgradeable: allowUpdate && existsSync(resolveUpdateScript(shape.repoPath, config.updateScript)),
			error: decision.error
		};
	}
	return {
		ok: true,
		mode: "unknown",
		current: shape.current,
		latest: null,
		hasUpdate: false,
		upgradeable: false,
		error: "current-unknown"
	};
}
/** 写一个 JSON 响应。 */
function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store"
		}
	});
}
/**
* 定位升级脚本：配置优先，其次随包分发的脚本，最后回退到仓库根的同名脚本。
* @param repoPath - DSH 仓库根。
* @param configured - 配置里的 updateScript。
* @returns 升级脚本的绝对路径（脚本不存在时也返回，由调用方报告）。
*/
function resolveUpdateScript(repoPath, configured) {
	if (configured !== void 0 && configured !== "") return isAbsolute(configured) ? configured : resolve(repoPath, configured);
	const bundled = resolve(PACKAGE_ROOT, BUNDLED_UPDATE_SCRIPT);
	if (existsSync(bundled)) return bundled;
	return resolve(repoPath, BUNDLED_UPDATE_SCRIPT);
}
/** 触发升级：以分离进程启动安全升级脚本。 */
function triggerUpdate(repoPath, script, port) {
	if (!existsSync(script)) return {
		started: false,
		script
	};
	try {
		spawn("powershell.exe", [
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			script,
			"-Repo",
			repoPath,
			"-Port",
			String(port)
		], {
			cwd: repoPath,
			detached: true,
			stdio: "ignore"
		}).unref();
		return {
			started: true,
			script
		};
	} catch {
		return {
			started: false,
			script
		};
	}
}
/**
* 注册更新器路由。
* @param ctx - host context，提供 connection 的鉴权 Fetch 通道。
* @param config - 插件配置。
*/
function apply(ctx, config = {}) {
	const port = config.port ?? 3080;
	const allowUpdate = config.allowUpdate ?? true;
	ctx.connection.fetch.register({
		path: "/api/dsh-updater/status",
		methods: ["GET"],
		requestBody: "buffered",
		fetch: async () => json(await buildStatus(config, allowUpdate))
	});
	ctx.connection.fetch.register({
		path: "/api/dsh-updater/update",
		methods: ["POST"],
		requestBody: "buffered",
		fetch: () => {
			if (!allowUpdate) return Promise.resolve(json({
				started: false,
				reason: "update-disabled"
			}, 403));
			const shape = detectRuntime(config);
			if (shape.mode !== "source") return Promise.resolve(json({
				started: false,
				reason: shape.mode === "desktop" ? "desktop-managed" : "current-unknown"
			}));
			const script = resolveUpdateScript(shape.repoPath, config.updateScript);
			return Promise.resolve(json(triggerUpdate(shape.repoPath, script, port)));
		}
	});
}
//#endregion
export { apply, inject };
