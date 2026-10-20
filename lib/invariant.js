//#region src/invariant.ts
const PACKAGE_NAME = "@deepseek-ai/dsh-client-ui-dsh-updater";
/** Cordis companion plugin name. */
const name = "client-ui-dsh-updater-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the package serves two HTTP routes and one slot
* occupant, all installed through the owner's own effect lifetimes.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
