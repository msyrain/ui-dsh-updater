/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-dsh-updater`.
 * @module @deepseek-ai/dsh-client-ui-dsh-updater/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-dsh-updater'

/** Cordis companion plugin name. */
export const name = 'client-ui-dsh-updater-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package serves two HTTP routes and one slot
 * occupant, all installed through the owner's own effect lifetimes.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
