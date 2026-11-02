/** Protect every batch input, including symlink and hardlink aliases, before writing output. */
import { statSync } from "node:fs"
import { basename, resolve } from "node:path"

export function createOutputGuard(inputs: string[]): (outputs: string[]) => void {
  const paths = new Map(inputs.map(input => [resolve(input), basename(input)]))
  const identities = new Map<string, string>()
  for (const [input, name] of paths) {
    try {
      const stat = statSync(input, { bigint: true })
      identities.set(`${stat.dev}:${stat.ino}`, name)
    } catch { /* Missing or unreadable inputs are reported by the normal conversion path. */ }
  }
  return outputs => {
    for (const output of outputs) {
      let input = paths.get(resolve(output))
      if (!input) {
        try {
          const stat = statSync(output, { bigint: true })
          input = identities.get(`${stat.dev}:${stat.ino}`)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT" && (err as NodeJS.ErrnoException).code !== "ENOTDIR") throw err
        }
      }
      if (input) throw new Error(`출력 경로가 입력 파일과 같습니다: ${input}`)
    }
  }
}
