/** Bounded, persistent process pool: CPU-heavy parsers get separate JS runtimes. */
import { fork, type ChildProcess } from "node:child_process"
import { basename } from "node:path"
import type { Command, OptionValues } from "commander"
import { KordocError } from "../utils.js"
import { convertFiles } from "./convert.js"
import { createOutputGuard } from "./output-path.js"

interface Job { file: string; opts: OptionValues; inputs?: string[] }
interface Done { ok: boolean; output: string[] }

export function registerBatchWorker(program: Command): void {
  program.command("__convert-worker", { hidden: true }).action(() => {
    if (!process.send) program.error("Internal command requires an IPC channel")
    // Do not leave native parser handles alive if the parent disappears.
    process.on("disconnect", () => process.exit(0))
    let assertSafeOutputs: ReturnType<typeof createOutputGuard> | undefined
    process.on("message", async ({ file, opts, inputs }: Job) => {
      const output: string[] = []
      assertSafeOutputs ??= createOutputGuard(inputs ?? [file])
      const ok = await convertFiles([file], opts, text => { output.push(text) }, assertSafeOutputs)
      process.send!({ ok, output } satisfies Done)
    })
  })
}

/**
 * Both converted documents and image directories are named after the input stem. Reject ambiguous
 * destinations before anything is written, including case variants — sequential `-d` runs used to
 * overwrite `a.md` and mix `images/a/` silently when two inputs shared a stem.
 */
export function assertDistinctStems(files: string[]): void {
  const stems = new Set<string>()
  for (const file of files) {
    const stem = basename(file).replace(/\.[^.]+$/, "").normalize("NFC").toLowerCase()
    if (stems.has(stem)) throw new KordocError(`Output name collision: ${basename(file)}; use distinct file stems`)
    stems.add(stem)
  }
}

export async function convertParallel(files: string[], opts: OptionValues, jobs: number): Promise<boolean> {
  assertDistinctStems(files)

  const workers: ChildProcess[] = []
  let next = 0
  let failed = false
  const stop = () => { for (const worker of workers) worker.kill() }
  const onSigint = () => { stop(); process.exit(130) }
  const onSigterm = () => { stop(); process.exit(143) }
  process.once("SIGINT", onSigint)
  process.once("SIGTERM", onSigterm)
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, () => new Promise<void>((resolve, reject) => {
      // Fork the same entry point: works in the bundled CLI and under tsx in tests.
      // Options travel over IPC so passwords never appear in child command lines.
      const worker = fork(process.argv[1], ["__convert-worker"], { stdio: ["ignore", "ignore", "inherit", "ipc"] })
      workers.push(worker)
      let current: string | undefined
      let finished = false
      let firstJob = true
      worker.on("error", reject)
      worker.on("exit", (code, signal) => {
        if (!finished) reject(new KordocError(`Conversion worker exited (${signal ?? code}) while processing ${basename(current ?? "unknown")}`))
      })
      const dispatch = () => {
        if (next === files.length) {
          finished = true
          worker.disconnect()
          resolve()
          return
        }
        current = files[next++]
        if (!opts.silent) process.stderr.write(`[kordoc] [${next}/${files.length}] ${basename(current)} ...\n`)
        // Each worker writes a separate output tree; successful document data stays
        // in the worker, avoiding large IPC copies and buffering the entire batch.
        worker.send({ file: current, opts: { ...opts, output: undefined, silent: true }, ...(firstJob ? { inputs: files } : {}) } satisfies Job, err => {
          if (err) reject(err)
        })
        firstJob = false
      }
      worker.on("message", ({ ok, output }: Done) => {
        if (!ok) failed = true
        // Only the parent writes stdout, preserving each failure JSON as one unit.
        for (const text of output) process.stdout.write(text)
        if (!opts.silent) process.stderr.write(`[kordoc] ${basename(current!)} ${ok ? "OK" : "FAIL"}\n`)
        dispatch()
      })
      dispatch()
    })))
    return !failed
  } finally {
    stop()
    process.removeListener("SIGINT", onSigint)
    process.removeListener("SIGTERM", onSigterm)
  }
}
