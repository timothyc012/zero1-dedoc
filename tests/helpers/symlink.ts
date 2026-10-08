import { symlinkSync } from "node:fs"
import type { TestContext } from "node:test"

/** Use only in symlink-only cases so an unavailable fixture is an explicit skip. */
export function symlinkOrSkip(
  t: Pick<TestContext, "skip">,
  target: string,
  path: string,
  type: "file" | "dir" = "file",
): boolean {
  try {
    symlinkSync(target, path, type)
    return true
  } catch (error) {
    if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error
    t.skip("Windows symlink creation requires Developer Mode or elevated privileges (EPERM)")
    return false
  }
}
