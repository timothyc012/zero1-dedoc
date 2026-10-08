import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"

export interface ProcessResult {
  args: string[]
  stdout: string
  stderr: string
  status: number | null
  signal: NodeJS.Signals | null
  error?: Error
  stdinError?: Error
  elapsedMs: number
  timedOut: boolean
  phase?: "startup" | "protocol"
  closed: boolean
  pid?: number
}

export function processDiagnostic(r: ProcessResult): string {
  const error = (e?: Error) => e && ({ name: e.name, message: e.message, code: (e as NodeJS.ErrnoException).code })
  return JSON.stringify({ ...r, error: error(r.error), stdinError: error(r.stdinError) }, null, 2)
}

/** A killed/timed-out child (status:null) is never a validation failure. */
export function assertProcessExit(r: ProcessResult, expected: number): void {
  const diagnostic = processDiagnostic(r)
  assert.equal(r.timedOut, false, `subprocess timeout\n${diagnostic}`)
  assert.equal(r.error, undefined, diagnostic)
  assert.equal(r.stdinError, undefined, diagnostic)
  assert.equal(r.signal, null, diagnostic)
  assert.equal(r.closed, true, diagnostic)
  assert.equal(r.status, expected, diagnostic)
}

export function runNodeSync(args: string[], timeout: number, env?: NodeJS.ProcessEnv): ProcessResult {
  const start = performance.now()
  const r = spawnSync(process.execPath, args, { encoding: "utf-8", timeout, env })
  return {
    args, stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status,
    signal: r.signal, error: r.error, elapsedMs: performance.now() - start,
    timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
    closed: true, pid: r.pid,
  }
}

/** One absolute deadline, stdin left open, and settlement only after close/reap. */
export function runNodeWorker(args: string[], options: {
  input: string
  timeout: number
  env?: NodeJS.ProcessEnv
  waitForReady?: boolean
}): Promise<ProcessResult> {
  const start = performance.now()
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"], env: options.env })
    const r: ProcessResult = {
      args, stdout: "", stderr: "", status: null, signal: null,
      elapsedMs: 0, timedOut: false, phase: "startup", closed: false, pid: child.pid,
    }
    let sent = false
    const send = () => {
      if (sent || r.timedOut) return
      sent = true
      child.stdin.write(options.input)
    }
    child.stdout.setEncoding("utf-8")
    child.stderr.setEncoding("utf-8")
    child.stdout.on("data", (data: string) => {
      r.stdout += data
      if (r.phase === "startup" && r.stdout.split("\n").some(line => {
        try { return JSON.parse(line)?.ready === true } catch { return false }
      })) {
        r.phase = "protocol"
        if (options.waitForReady) send()
      }
    })
    child.stderr.on("data", (data: string) => { r.stderr += data })
    child.on("error", (error) => { r.error = error })
    child.stdin.on("error", (error) => { r.stdinError = error })
    const timer = setTimeout(() => {
      r.timedOut = true
      child.kill("SIGKILL")
      // Do not resolve here: close drains stdout/stderr and confirms reaping.
    }, options.timeout)
    child.on("close", (status, signal) => {
      clearTimeout(timer)
      r.status = status
      r.signal = signal
      r.elapsedMs = performance.now() - start
      r.closed = true
      child.stdin.destroy()
      resolve(r)
    })
    if (!options.waitForReady) send()
  })
}
