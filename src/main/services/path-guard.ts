import { realpathSync, existsSync } from 'fs'
import { basename, dirname, resolve, sep } from 'path'
import { mainStore } from '../store'

/**
 * Confine a renderer-supplied path to the currently-open vault.
 *
 * Returns the resolved absolute path if it's inside the vault root;
 * throws otherwise. Resolves symlinks via realpathSync so an attacker
 * can't sneak out via symlink indirection.
 *
 * For paths that don't exist yet (file:create, file:write, history
 * snapshots), falls back to resolving the parent directory — so we
 * can validate *future* writes without crashing realpath.
 */
export function assertInsideVault(userPath: string): string {
  const vault = mainStore.getState().settings.vaultPath
  if (!vault) {
    throw new Error('Path rejected: no vault open')
  }

  const vaultReal = realpathSync(resolve(vault))
  const absolute = resolve(userPath)

  let targetReal: string
  if (existsSync(absolute)) {
    targetReal = realpathSync(absolute)
  } else {
    // Target doesn't exist yet — resolve the parent dir (which must
    // exist or be inside the vault) and re-attach the basename.
    const parent = dirname(absolute)
    if (existsSync(parent)) {
      targetReal = resolve(realpathSync(parent), basename(absolute))
    } else {
      targetReal = absolute
    }
  }

  if (targetReal !== vaultReal && !targetReal.startsWith(vaultReal + sep)) {
    throw new Error(
      `Path rejected (escapes vault): ${userPath}`
    )
  }
  return targetReal
}

/**
 * Same as `assertInsideVault` but returns null instead of throwing,
 * for handlers that already swallow errors and return false/null on
 * failure. Keeps the existing handler return shapes intact.
 */
export function safeInsideVault(userPath: string): string | null {
  try {
    return assertInsideVault(userPath)
  } catch {
    return null
  }
}

/**
 * Allowlist for URLs we're willing to hand to shell.openExternal.
 * Rejects file://, javascript:, custom app schemes, smb://, etc. —
 * all of which can be abused to exfiltrate data or launch apps.
 */
export function isSafeExternalUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    return (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      url.protocol === 'mailto:'
    )
  } catch {
    return false
  }
}
