window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-dsh-updater",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/icons.tsx
		/** 与 DSH Regular 图标一致的 1px 描边。 */
		const STROKE_WIDTH = 1;
		/** 下载字形（对应 DSH 的 IconDownloadOutline）。 */
		function DownloadGlyph({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				strokeWidth: STROKE_WIDTH,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 1.95317V10.0469",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4.25 6.29688L8 10.0469L11.75 6.29688",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469",
						stroke: "currentColor"
					})
				]
			});
		}
		/** 刷新字形（对应 DSH 的 IconRefreshOutline）。 */
		function RefreshGlyph({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				strokeWidth: STROKE_WIDTH,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1",
					stroke: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M14.4999 1.5V5.1H10.8999",
					stroke: "currentColor"
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** 本地化命名空间 id。 */
		const NS = "dshUpdater";
		/** 中文文案（唯一文案源；两个语言槽均指向它，保证始终显示中文）。 */
		const zh = {
			buttonLabel: "DSH 更新",
			buttonLabelShort: "更新",
			current: "当前版本",
			latest: "最新版本",
			commit: "提交",
			latestNotAvailable: "暂未获取到",
			noUpdate: "当前已是最新版本",
			hasUpdate: "检测到新版本",
			checking: "正在检测版本…",
			checkFailed: "无法连接版本检测服务",
			unknownBadge: "无法判断",
			currentUnknown: "无法判断当前版本：源码版需要 git 仓库或构建记录，桌面版需要应用清单。",
			feedUnreachable: "连不上版本源，暂不能判断是否有更新。",
			feedInvalid: "版本源返回了无法解析的清单，暂不能判断是否有更新。",
			desktopManaged: "当前是 DeepSeek Harness 桌面版：更新由桌面应用自己负责，请在应用内检查并安装。",
			desktopUpdateHint: "桌面版已有新版本：请在 DeepSeek Harness 应用内更新。",
			upgradeDesktop: "桌面版请在应用内更新",
			upgradeDesktopManaged: "桌面版不支持一键升级：请在应用内检查并安装。",
			upgradeUnavailable: "一键升级不可用",
			checkNow: "立即检查",
			upgrade: "一键升级 DSH",
			upgradeStarted: "升级已启动，正在后台拉取代码、构建并重启服务…",
			upgradeNotStarted: "未能启动升级，请确认升级脚本（dsh-updater-run.ps1）是否存在",
			upgradeDisabled: "当前部署已禁用一键升级",
			upgradeRunning: "正在升级…",
			close: "关闭",
			empty: "暂无版本信息",
			dialogTitle: "DSH 版本更新",
			dialogIntro: "自动检测最新版本，并在有更新时提示。升级会拉取主分支、同步依赖、完整构建并重启服务。",
			upgradeLatest: "确认升级到最新版本？",
			releaseNote: "发版说明",
			releaseNoteLink: "查看版本说明",
			oldVersionRunning: "（旧版本仍在本会话运行）"
		};
		//#endregion
		//#region \0dsh-updater-css:src/client/UpdaterPanel.module.css.mjs
		const css = ".dshUpdater_root{color:var(--theme-fg-1,#d8dee9);cursor:pointer;font:inherit;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:6px;padding:6px 10px;line-height:1;display:flex}.dshUpdater_root:hover{background:var(--theme-bg-hover,#ffffff0f)}.dshUpdater_rail{justify-content:center;width:40px;height:40px;padding:8px}.dshUpdater_label{align-items:center;gap:6px;font-size:13px;display:flex}.dshUpdater_dot{background:0 0;border-radius:50%;width:7px;height:7px}.dshUpdater_updateDot{background:#e5484d;box-shadow:0 0 0 3px #e5484d2e}.dshUpdater_overlay{z-index:100;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.dshUpdater_mask{background:#00000073;position:absolute;inset:0}.dshUpdater_panel{background:var(--theme-bg-1,#1d232e);width:420px;max-width:calc(100vw - 32px);color:var(--theme-fg-1,#d8dee9);border:1px solid var(--theme-border-1,#ffffff1a);border-radius:12px;padding:18px 20px;position:relative;box-shadow:0 24px 60px #0006}.dshUpdater_heading{margin:0 0 4px;font-size:16px;font-weight:600}.dshUpdater_intro{color:var(--theme-fg-2,#9aa4b2);margin:0 0 14px;font-size:13px;line-height:1.6}.dshUpdater_rows{flex-direction:column;gap:8px;margin-bottom:8px;display:flex}.dshUpdater_row{justify-content:space-between;align-items:baseline;gap:12px;font-size:13px;display:flex}.dshUpdater_rowKey{color:var(--theme-fg-2,#9aa4b2)}.dshUpdater_rowValue{font-variant-numeric:tabular-nums;font-weight:500}.dshUpdater_badge{border-radius:999px;align-items:center;gap:6px;padding:2px 8px;font-size:12px;font-weight:600;display:inline-flex}.dshUpdater_badgeUpdate{color:#ff7a7e;background:#e5484d29}.dshUpdater_badgeOk{color:#6fdc8c;background:#46bf6e29}.dshUpdater_badgeUnknown{color:var(--theme-fg-2,#9aa4b2);background:#9aa4b229}.dshUpdater_muted{color:var(--theme-fg-2,#9aa4b2)}.dshUpdater_error{color:#ff8a8a;margin:0 0 10px;font-size:13px}.dshUpdater_actions{align-items:center;gap:10px;margin-top:14px;display:flex}.dshUpdater_primary{color:#fff;cursor:pointer;background:#2f6fed;border:none;border-radius:8px;justify-content:center;align-items:center;gap:6px;padding:8px 14px;font-size:13px;font-weight:600;display:inline-flex}.dshUpdater_primary:hover{background:#3b78ff}.dshUpdater_primary:disabled{opacity:.5;cursor:default}.dshUpdater_secondary{border:1px solid var(--theme-border-1,#ffffff1a);color:var(--theme-fg-1,#d8dee9);cursor:pointer;background:0 0;border-radius:8px;align-items:center;gap:6px;padding:8px 14px;font-size:13px;display:inline-flex}.dshUpdater_secondary:hover{background:var(--theme-bg-hover,#ffffff0f)}.dshUpdater_statusLine{margin-top:12px;font-size:13px;line-height:1.6}.dshUpdater_detail{color:var(--theme-fg-2,#9aa4b2);white-space:pre-wrap;word-break:break-word;background:#ffffff0a;border-radius:8px;max-height:140px;margin:8px 0 0;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.5;overflow:auto}.dshUpdater_link{color:#6ea8ff;text-decoration:none}.dshUpdater_link:hover{text-decoration:underline}";
		const tagId = "@deepseek-ai/dsh-client-ui-dsh-updater/UpdaterPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-dsh-updater";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var UpdaterPanel_module_css_default = {
			"actions": "dshUpdater_actions",
			"badge": "dshUpdater_badge",
			"badgeOk": "dshUpdater_badgeOk",
			"badgeUnknown": "dshUpdater_badgeUnknown",
			"badgeUpdate": "dshUpdater_badgeUpdate",
			"detail": "dshUpdater_detail",
			"dot": "dshUpdater_dot",
			"error": "dshUpdater_error",
			"heading": "dshUpdater_heading",
			"intro": "dshUpdater_intro",
			"label": "dshUpdater_label",
			"link": "dshUpdater_link",
			"mask": "dshUpdater_mask",
			"muted": "dshUpdater_muted",
			"overlay": "dshUpdater_overlay",
			"panel": "dshUpdater_panel",
			"primary": "dshUpdater_primary",
			"rail": "dshUpdater_rail",
			"root": "dshUpdater_root",
			"row": "dshUpdater_row",
			"rowKey": "dshUpdater_rowKey",
			"rowValue": "dshUpdater_rowValue",
			"rows": "dshUpdater_rows",
			"secondary": "dshUpdater_secondary",
			"statusLine": "dshUpdater_statusLine",
			"updateDot": "dshUpdater_updateDot"
		};
		//#endregion
		//#region src/client/UpdaterPanel.tsx
		/** DSH 更新器面板：在设置上方的侧边栏入口 + 版本详情弹窗。 */
		/** 轮询间隔：30 分钟一次。 */
		const CHECK_INTERVAL_MS = 18e5;
		/** 编译期烙入的当前 commit，作为 /status 不可用时的回退展示。 */
		const BUILD_COMMIT = {}.DSH_CLIENT_COMMIT_HASH;
		/** 拉取一次版本状态。 */
		async function fetchStatus() {
			try {
				const response = await fetch("/api/dsh-updater/status", { cache: "no-store" });
				if (!response.ok) return null;
				return await response.json();
			} catch {
				return null;
			}
		}
		/** 触发升级。 */
		async function postUpdate() {
			try {
				return await (await fetch("/api/dsh-updater/update", { method: "POST" })).json();
			} catch {
				return null;
			}
		}
		/**
		* 把一次 /status 的结果翻译成一行状态文案。
		*
		* 关键点：`error` 非空时绝不渲染成「当前已是最新版本」——版本事实不全和「确实最新」
		* 是两件事，混在一起正是「明明最新却显示有新版本 / 反过来」的来源。
		* @param status - 版本状态。
		* @param t - 文案查询函数。
		* @returns 状态文案。
		*/
		function statusMessage(status, t) {
			if (status.error === "feed-unreachable") return t("feedUnreachable");
			if (status.error === "feed-invalid") return t("feedInvalid");
			if (status.error === "current-unknown") return t("currentUnknown");
			return status.hasUpdate ? t("hasUpdate") : t("noUpdate");
		}
		/**
		* 弹窗子树的最小错误边界。
		*
		* 为什么必须有它：`sidebar.footer.action` 是 list 席位，entry 在渲染中抛错会被 ui-renderer
		* 的 SlotErrorBoundary 接住，随后 `reportEntryError(..., { abdicate: true })` 让这条注册退位，
		* 席位只剩一个空的 `data-slot-error` 行——界面上就是「点一下『DSH 更新』，按钮消失、
		* 弹窗也不出来」，刷新页面前回不来。
		*
		* 为什么边界包的必须是**另一个组件**：updater 面板自己 render 时内联求值的 JSX 抛错，
		* 抛在边界元素「被返回之前」，任何放在它里面的边界都来不及接——错误会直接冲到席位边界。
		* 所以弹窗内容拆成独立的 {@link UpdaterDialog}，由这里渲染它、接它的错。
		* 边界自己渲染兜底 UI 时也不再查文案表（{@link DIALOG_FAILURE_TEXT} 是常量），
		* 免得降级路径二次抛错。
		*/
		var DialogBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error, info) {
				console.error("dsh-updater: 弹窗渲染失败，已就地降级", error, info.componentStack);
			}
			render() {
				if (this.state.error !== null) return this.props.renderFallback(this.state.error);
				return this.props.children;
			}
		};
		/** 版本详情弹窗的内容。 */
		function UpdaterDialog({ status, checking, message, busy, hasUpdate, currentLabel, latestLabel, t, onUpgrade, onCheck, onClose }) {
			const unknown = status !== null && status.error !== null && !hasUpdate;
			const badgeClass = hasUpdate ? UpdaterPanel_module_css_default.badge + " " + UpdaterPanel_module_css_default.badgeUpdate : unknown ? UpdaterPanel_module_css_default.badge + " " + UpdaterPanel_module_css_default.badgeUnknown : UpdaterPanel_module_css_default.badge + " " + UpdaterPanel_module_css_default.badgeOk;
			const badgeText = hasUpdate ? t("hasUpdate") : unknown ? t("unknownBadge") : t("noUpdate");
			const desktop = status?.mode === "desktop";
			const upgradeable = status === null ? true : status.upgradeable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: UpdaterPanel_module_css_default.overlay,
				role: "presentation",
				onClick: onClose,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: UpdaterPanel_module_css_default.mask,
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: UpdaterPanel_module_css_default.panel,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": t("dialogTitle"),
					onClick: (event) => {
						event.stopPropagation();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: UpdaterPanel_module_css_default.heading,
							children: t("dialogTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UpdaterPanel_module_css_default.intro,
							children: t("dialogIntro")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UpdaterPanel_module_css_default.rows,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UpdaterPanel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UpdaterPanel_module_css_default.rowKey,
									children: t("current")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UpdaterPanel_module_css_default.rowValue,
									children: currentLabel ?? t("latestNotAvailable")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UpdaterPanel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UpdaterPanel_module_css_default.rowKey,
									children: t("latest")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UpdaterPanel_module_css_default.rowValue,
									children: latestLabel ?? t("latestNotAvailable")
								})]
							})]
						}),
						status && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: badgeClass,
							children: badgeText
						}),
						desktop && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UpdaterPanel_module_css_default.statusLine,
							children: hasUpdate ? t("desktopUpdateHint") : t("desktopManaged")
						}),
						checking && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UpdaterPanel_module_css_default.statusLine,
							children: t("checking")
						}),
						message && !checking && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UpdaterPanel_module_css_default.statusLine,
							children: message
						}),
						status === null && !message && !checking && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UpdaterPanel_module_css_default.statusLine,
							children: t("checking")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UpdaterPanel_module_css_default.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: UpdaterPanel_module_css_default.primary,
								disabled: busy || !hasUpdate || !upgradeable,
								onClick: onUpgrade,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadGlyph, { size: 14 }), desktop ? t("upgradeDesktop") : upgradeable ? t("upgrade") : t("upgradeUnavailable")]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: UpdaterPanel_module_css_default.secondary,
								onClick: onCheck,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshGlyph, { size: 14 }), t("checkNow")]
							})]
						})
					]
				})]
			});
		}
		/**
		* 渲染侧边栏底部入口（位于 Settings 上方）及其版本详情弹窗。
		*/
		function UpdaterPanel({ wide, t }) {
			const [status, setStatus] = (0, react.useState)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [checking, setChecking] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)(null);
			const alive = (0, react.useRef)(true);
			const check = (0, react.useCallback)(async () => {
				setChecking(true);
				setMessage(null);
				const result = await fetchStatus();
				if (!alive.current) return;
				setStatus(result);
				setChecking(false);
				setMessage(result ? statusMessage(result, t) : t("checkFailed"));
			}, [t]);
			(0, react.useEffect)(() => {
				alive.current = true;
				check();
				const timer = window.setInterval(check, CHECK_INTERVAL_MS);
				return () => {
					alive.current = false;
					window.clearInterval(timer);
				};
			}, [check]);
			const hasUpdate = status?.hasUpdate === true;
			const currentLabel = status?.current?.version ?? status?.current?.tag ?? status?.current?.commit ?? BUILD_COMMIT ?? null;
			const latestLabel = status?.latest?.version ?? status?.latest?.tag ?? null;
			const onUpgrade = (0, react.useCallback)(async () => {
				if (!status?.hasUpdate && !latestLabel) return;
				setBusy(true);
				setMessage(t("upgradeRunning"));
				const result = await postUpdate();
				if (!alive.current) return;
				setBusy(false);
				if (result?.started) setMessage(t("upgradeStarted"));
				else if (result?.reason === "desktop-managed") setMessage(t("upgradeDesktopManaged"));
				else if (result?.reason === "update-disabled") setMessage(t("upgradeDisabled"));
				else setMessage(t("upgradeNotStarted"));
			}, [
				status?.hasUpdate,
				latestLabel,
				t
			]);
			const close = (0, react.useCallback)(() => {
				setOpen(false);
			}, []);
			const cellClass = wide ? UpdaterPanel_module_css_default.root : UpdaterPanel_module_css_default.root + " " + UpdaterPanel_module_css_default.rail;
			const dotClass = hasUpdate ? UpdaterPanel_module_css_default.dot + " " + UpdaterPanel_module_css_default.updateDot : UpdaterPanel_module_css_default.dot;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: cellClass,
				"aria-label": t("buttonLabel"),
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen(true);
				},
				children: wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: UpdaterPanel_module_css_default.label,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dotClass,
						"aria-hidden": "true"
					}), t("buttonLabel")]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: dotClass,
					"aria-hidden": "true"
				})
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogBoundary, {
				renderFallback: (error) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: UpdaterPanel_module_css_default.overlay,
					role: "presentation",
					onClick: close,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: UpdaterPanel_module_css_default.mask,
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UpdaterPanel_module_css_default.panel,
						role: "dialog",
						"aria-modal": "true",
						onClick: (event) => {
							event.stopPropagation();
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: UpdaterPanel_module_css_default.heading,
								children: "弹窗渲染失败，已就地降级（入口按钮不受影响）。请把下面的信息反馈给插件作者。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								className: UpdaterPanel_module_css_default.detail,
								children: error instanceof Error ? error.message : String(error)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: UpdaterPanel_module_css_default.actions,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: UpdaterPanel_module_css_default.secondary,
									onClick: close,
									children: "关闭"
								})
							})
						]
					})]
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdaterDialog, {
					status,
					checking,
					message,
					busy,
					hasUpdate,
					currentLabel,
					latestLabel,
					t,
					onUpgrade: () => {
						onUpgrade();
					},
					onCheck: () => {
						check();
					},
					onClose: close
				})
			})] });
		}
		//#endregion
		//#region src/client/index.ts
		/** 所需服务：UI 槽位注册表与本地化。 */
		const inject = ["slots", "locale"];
		/**
		* 注册 DSH 更新器入口。
		* @param ctx - Client root context。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en: zh
			}), "dsh-updater: dictionaries");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-updater",
				locale: NS,
				inject: () => ({})
			}, UpdaterPanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map