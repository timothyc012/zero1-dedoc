import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import { mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { Readable } from "node:stream"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import * as offline from "../src/shared/offline.js"
import {
  ensureModelsIn,
  ensureSingleModel,
  getModelStatusIn,
  type DownloadProgress,
  type ModelSpec,
} from "../src/pdf/formula/models.js"

// Synthetic bytes only: no real model downloads or inference runtimes.
const bytes = Buffer.from("synthetic model preparation fixture")
const corrupt = Buffer.alloc(bytes.length, 0x78)
function specFor(content = bytes, filename = "fixture.onnx"): ModelSpec {
  return {
    name: "synthetic fixture",
    filename,
    url: "https://model-preparation.invalid/fixture",
    sha256: createHash("sha256").update(content).digest("hex"),
    sizeMb: 0,
  }
}
function response(content = bytes): Response {
  return new Response(content, { headers: { "content-length": String(content.length) } })
}
function assertFulfilled(results: PromiseSettledResult<void>[]): void {
  for (const result of results) {
    assert.equal(result.status, "fulfilled", result.status === "rejected" ? String(result.reason) : "")
  }
}

function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

// Independent module registries reproduce other-process installation races.
// The production source, filesystem, streams and SHA implementation stay real;
// only fetch and explicitly gated filesystem operations are replaced.
const require = createRequire(import.meta.url)
const modelCode = ts.transpileModule(
  fs.readFileSync(new URL("../src/pdf/formula/models.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText
function isolatedModels(overrides: {
  fs?: Partial<typeof fs>
  promises?: Partial<typeof fsPromises>
  fetch?: typeof globalThis.fetch
} = {}): typeof import("../src/pdf/formula/models.js") {
  const module = { exports: {} }
  runInNewContext(modelCode, {
    module, exports: module.exports, process, Buffer,
    fetch: overrides.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)),
    require: (name: string) => {
      if (name === "fs" || name === "node:fs") return { ...fs, ...overrides.fs }
      if (name === "fs/promises" || name === "node:fs/promises") return { ...fsPromises, ...overrides.promises }
      if (name === "../../shared/offline.js") return offline
      return require(name)
    },
  }, { filename: "model-preparation-isolated.cjs" })
  return module.exports as typeof import("../src/pdf/formula/models.js")
}

let dir: string
let savedOffline: string | undefined
let savedCache: string | undefined
beforeEach(async () => {
  dir = await mkdtemp(join(process.env.TMPDIR || tmpdir(), "model-preparation-test-"))
  savedOffline = process.env.KORDOC_OFFLINE
  savedCache = process.env.KORDOC_MODEL_CACHE
  process.env.KORDOC_OFFLINE = "0"
  process.env.KORDOC_MODEL_CACHE = dir
})
afterEach(async () => {
  if (savedOffline === undefined) delete process.env.KORDOC_OFFLINE
  else process.env.KORDOC_OFFLINE = savedOffline
  if (savedCache === undefined) delete process.env.KORDOC_MODEL_CACHE
  else process.env.KORDOC_MODEL_CACHE = savedCache
  await rm(dir, { recursive: true, force: true })
})

describe("model preparation concurrency", { concurrency: false }, () => {
  it("coalesces concurrent cold calls across both public APIs and absolute/relative paths", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => response())
    const spec = specFor()
    const formulaDir = join(dir, "pix2text")
    const progress: DownloadProgress[][] = [[], [], []]
    const results = await Promise.allSettled([
      ensureModelsIn(formulaDir, [spec], p => progress[0].push(p)),
      ensureModelsIn(relative(process.cwd(), formulaDir), [spec], p => progress[1].push(p)),
      ensureSingleModel(spec, p => progress[2].push(p)),
    ])
    assert.equal(fetch.mock.callCount(), 1, "one fetch for one absolute path and expected SHA")
    assertFulfilled(results)
    assert.deepEqual(await readFile(join(formulaDir, spec.filename)), bytes)
    for (const events of progress) {
      assert.ok(events.some(p => p.phase === "done"), "each caller receives completion progress")
      assert.ok(events.every(p => p.spec === spec))
    }
    assert.deepEqual(await readdir(formulaDir), [spec.filename])
  })

  it("repairs one invalid cache once for concurrent callers without a delete-valid race", async (t) => {
    const spec = specFor()
    await writeFile(join(dir, spec.filename), corrupt)
    const fetch = t.mock.method(globalThis, "fetch", async () => response())
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => ensureModelsIn(dir, [spec])))
    assert.equal(fetch.mock.callCount(), 1, "one repair must own validation and installation")
    assertFulfilled(results)
    assert.deepEqual(await readFile(join(dir, spec.filename)), bytes)
    assert.deepEqual(await readdir(dir), [spec.filename])
  })

  it("evicts a failed flight so concurrent callers can retry", async (t) => {
    let fail = true
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      if (fail) throw new Error("synthetic network failure")
      return response()
    })
    const spec = specFor()
    const failed = await Promise.allSettled(Array.from({ length: 3 }, () => ensureModelsIn(dir, [spec])))
    assert.equal(fetch.mock.callCount(), 1)
    for (const result of failed) {
      assert.equal(result.status, "rejected")
      if (result.status === "rejected") assert.match(String(result.reason), /synthetic network failure/)
    }
    fail = false
    const retried = await Promise.allSettled(Array.from({ length: 3 }, () => ensureModelsIn(dir, [spec])))
    assertFulfilled(retried)
    assert.equal(fetch.mock.callCount(), 2)
    assert.deepEqual(await readFile(join(dir, spec.filename)), bytes)
  })

  it("does not reuse a successful flight for a different directory with the same hash", async (t) => {
    const bothFetching = gate()
    let started = 0
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      if (++started === 2) bothFetching.release()
      await bothFetching.promise
      return response()
    })
    const spec = specFor()
    const otherDir = join(dir, "other")
    await Promise.all([ensureModelsIn(dir, [spec]), ensureModelsIn(otherDir, [spec])])
    assert.equal(fetch.mock.callCount(), 2)
    assert.deepEqual(await readFile(join(otherDir, spec.filename)), bytes)
  })

  it("rehashes same-size corruption even when mtime is restored", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => response())
    const spec = specFor()
    const path = join(dir, spec.filename)
    await writeFile(path, bytes)
    await ensureModelsIn(dir, [spec])
    const previous = await stat(path)
    await writeFile(path, corrupt)
    await utimes(path, previous.atime, previous.mtime)
    await ensureModelsIn(dir, [spec])
    assert.equal(fetch.mock.callCount(), 1)
    assert.deepEqual(await readFile(path), bytes)
  })

  it("rehashes replacement files and a changed expected hash instead of retaining settled promises", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => response())
    const spec = specFor()
    const path = join(dir, spec.filename)
    await writeFile(path, bytes)
    await ensureModelsIn(dir, [spec])
    const previous = await stat(path)
    const replacement = join(dir, "replacement")
    await writeFile(replacement, corrupt)
    await utimes(replacement, previous.atime, previous.mtime)
    await rename(replacement, path)
    await ensureModelsIn(dir, [spec])
    assert.equal(fetch.mock.callCount(), 1)
    await assert.rejects(ensureModelsIn(dir, [specFor(corrupt)]), /SHA256 mismatch/)
    assert.equal(fetch.mock.callCount(), 2)
    assert.deepEqual(await readFile(path), bytes, "a failed replacement preserves the installed file")
  })

  it("keeps offline valid cache usable and blocks missing/invalid cache before fetch", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch") })
    const spec = specFor()
    const path = join(dir, spec.filename)
    process.env.KORDOC_OFFLINE = "1"
    await writeFile(path, bytes)
    const events: DownloadProgress[] = []
    await ensureModelsIn(dir, [spec], p => events.push(p))
    assert.equal(events.at(-1)?.phase, "skip")
    await rm(path)
    await assert.rejects(ensureModelsIn(dir, [spec]), /KORDOC_OFFLINE.*models --import/)
    await writeFile(path, corrupt)
    await assert.rejects(ensureModelsIn(dir, [spec]), /KORDOC_OFFLINE/)
    assert.equal(fetch.mock.callCount(), 0)
  })

  it("reports status using fresh validation without downloading", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch") })
    const spec = specFor()
    await writeFile(join(dir, spec.filename), bytes)
    assert.equal((await getModelStatusIn(dir, [spec]))[0].verified, true)
    await writeFile(join(dir, spec.filename), corrupt)
    assert.equal((await getModelStatusIn(dir, [spec]))[0].verified, false)
    assert.equal(fetch.mock.callCount(), 0)
  })

  it("uses private temporary files for independent module instances", async (t) => {
    const bothFetching = gate()
    let fetches = 0
    t.mock.method(globalThis, "fetch", async () => {
      if (++fetches === 2) bothFetching.release()
      await bothFetching.promise
      return response()
    })
    const spec = specFor()
    const legacyPart = join(dir, `${spec.filename}.part`)
    await writeFile(legacyPart, "owned by another writer")
    const writes: string[] = []
    const instrumentedFs: Partial<typeof fs> = {
      createWriteStream(path, options) {
        writes.push(String(path))
        return fs.createWriteStream(path, options)
      },
    }
    const first = isolatedModels({ fs: instrumentedFs })
    const second = isolatedModels({ fs: instrumentedFs })
    const results = await Promise.allSettled([
      first.ensureModelsIn(dir, [spec]), second.ensureModelsIn(dir, [spec]),
    ])
    assert.equal(new Set(writes).size, 2, "independent preparations must not share a .part file")
    assertFulfilled(results)
    assert.equal(await readFile(legacyPart, "utf8"), "owned by another writer")
    assert.deepEqual(await readFile(join(dir, spec.filename)), bytes)
    assert.deepEqual((await readdir(dir)).sort(), [spec.filename, `${spec.filename}.part`].sort())
  })

  it("does not delete a valid replacement after a delayed invalid-cache validation", async (t) => {
    const spec = specFor()
    const path = join(dir, spec.filename)
    await writeFile(path, corrupt)
    const observedOldFile = gate()
    const finishOldRead = gate()
    let delayed = false
    const stale = isolatedModels({
      fs: {
        createReadStream(p, options) {
          if (String(p) !== path || delayed) return fs.createReadStream(p, options)
          delayed = true
          const snapshot = fs.readFileSync(p)
          observedOldFile.release()
          return Readable.from((async function* () {
            await finishOldRead.promise
            yield snapshot
          })()) as fs.ReadStream
        },
      },
      fetch: async () => { throw new Error("stale repair failed") },
    })
    t.mock.method(globalThis, "fetch", async () => response())
    const staleResult = Promise.allSettled([stale.ensureModelsIn(dir, [spec])])
    await observedOldFile.promise
    try {
      await ensureModelsIn(dir, [spec])
    } finally {
      finishOldRead.release()
    }
    const [result] = await staleResult
    assert.equal(result.status, "rejected")
    assert.deepEqual(await readFile(path), bytes, "a stale validator must never unlink another installer’s valid file")
  })

  it("serializes conflicting hashes at one destination instead of sharing their results", async (t) => {
    const first = specFor()
    const second = { ...specFor(corrupt), url: `${first.url}/second` }
    let active = 0, peak = 0
    const fetch = t.mock.method(globalThis, "fetch", async (url: string) => {
      active++
      peak = Math.max(peak, active)
      return response(url === second.url ? corrupt : bytes)
    })
    const completed: string[] = []
    const onProgress = (p: DownloadProgress) => {
      if (p.phase !== "done") return
      completed.push(p.spec.sha256)
      assert.equal(createHash("sha256").update(fs.readFileSync(join(dir, p.spec.filename))).digest("hex"), p.spec.sha256)
      active--
    }
    const results = await Promise.allSettled([
      ensureModelsIn(dir, [first], onProgress), ensureModelsIn(dir, [second], onProgress),
    ])
    assert.equal(peak, 1, "conflicting hashes must not install into the same destination concurrently")
    assertFulfilled(results)
    assert.equal(fetch.mock.callCount(), 2)
    assert.deepEqual(completed, [first.sha256, second.sha256])
    assert.deepEqual(await readFile(join(dir, first.filename)), corrupt)
  })

  it("cleans its temporary file after an install failure and permits a retry", async (t) => {
    const spec = specFor()
    let fail = true
    const models = isolatedModels({
      promises: {
        async rename(from, to) {
          if (fail) throw Object.assign(new Error("synthetic install failure"), { code: "EACCES" })
          await rename(from, to)
        },
      },
    })
    const fetch = t.mock.method(globalThis, "fetch", async () => response())
    await assert.rejects(models.ensureModelsIn(dir, [spec]), /synthetic install failure/)
    assert.deepEqual(await readdir(dir), [], "failed installation must not leak a temporary model")
    fail = false
    await models.ensureModelsIn(dir, [spec])
    assert.equal(fetch.mock.callCount(), 2)
    assert.deepEqual(await readFile(join(dir, spec.filename)), bytes)
    assert.deepEqual(await readdir(dir), [spec.filename])
  })

  for (const installed of ["valid", "corrupt", "missing", "unreadable"] as const) {
    it(`rechecks a competing installation after rename EPERM: ${installed} destination`, async (t) => {
      const spec = specFor()
      const path = join(dir, spec.filename)
      const collision = Object.assign(new Error("synthetic competing rename"), { code: "EPERM" })
      const models = isolatedModels({
        promises: {
          async rename(_from, to) {
            if (installed !== "missing") await writeFile(to, installed === "corrupt" ? corrupt : bytes)
            throw collision
          },
        },
        fs: {
          createReadStream(p, options) {
            if (installed === "unreadable" && String(p) === path) throw new Error("synthetic read denial")
            return fs.createReadStream(p, options)
          },
        },
      })
      t.mock.method(globalThis, "fetch", async () => response())
      const events: DownloadProgress[] = []
      const pending = models.ensureModelsIn(dir, [spec], p => events.push(p))
      if (installed === "valid") {
        await pending
        assert.equal(events.at(-1)?.phase, "done")
        assert.deepEqual(await readFile(path), bytes)
      } else {
        await assert.rejects(pending, error => error === collision)
        assert.ok(!events.some(p => p.phase === "done"))
      }
      assert.deepEqual(await readdir(dir), installed === "missing" ? [] : [spec.filename])
    })
  }

  it("coalesces warm verification but hashes again after the flight settles", async (t) => {
    const spec = specFor()
    const path = join(dir, spec.filename)
    await writeFile(path, bytes)
    let reads = 0
    const models = isolatedModels({
      fs: {
        createReadStream(p, options) {
          if (String(p) === path) reads++
          return fs.createReadStream(p, options)
        },
      },
    })
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch") })
    await Promise.all(Array.from({ length: 5 }, () => models.ensureModelsIn(dir, [spec])))
    assert.equal(reads, 1)
    await models.ensureModelsIn(dir, [spec])
    assert.equal(reads, 2, "do not retain successful verification as a permanent cache entry")
    assert.equal(fetch.mock.callCount(), 0)
  })

  for (const phase of ["download", "verify"] as const) {
    it(`isolates a throwing ${phase} progress subscriber from the other callers`, async (t) => {
      const spec = specFor()
      const peerSpec = { ...spec, name: "another subscriber" }
      const expected = new Error("synthetic progress failure")
      const fetch = t.mock.method(globalThis, "fetch", async () => response())
      const events: DownloadProgress[] = []
      const results = await Promise.allSettled([
        ensureModelsIn(dir, [spec], p => { if (p.phase === phase) throw expected }),
        ensureModelsIn(dir, [peerSpec], p => events.push(p)),
      ])
      assert.equal(results[1].status, "fulfilled", "a subscriber must not poison the shared preparation")
      assert.equal(results[0].status, "rejected")
      if (results[0].status === "rejected") assert.equal(results[0].reason, expected)
      assert.equal(fetch.mock.callCount(), 1)
      assert.equal(events.at(-1)?.phase, "done")
      assert.ok(events.every(p => p.spec === peerSpec))
      assert.deepEqual(await readFile(join(dir, spec.filename)), bytes)
    })
  }

  it("replays completion to a caller joining while temporary-file cleanup is pending", async (t) => {
    const cleaning = gate()
    const finishCleanup = gate()
    const spec = specFor()
    const models = isolatedModels({
      promises: {
        async rm(path, options) {
          cleaning.release()
          await finishCleanup.promise
          await rm(path, options)
        },
      },
    })
    const fetch = t.mock.method(globalThis, "fetch", async () => response())
    const first = models.ensureModelsIn(dir, [spec])
    await cleaning.promise
    const events: DownloadProgress[] = []
    const second = models.ensureModelsIn(dir, [spec], p => events.push(p))
    finishCleanup.release()
    assertFulfilled(await Promise.allSettled([first, second]))
    assert.equal(fetch.mock.callCount(), 1)
    assert.equal(events.at(-1)?.phase, "done", "late subscribers still receive terminal progress")
    assert.equal(events.at(-1)?.downloaded, bytes.length)
  })

  it("runs the next hash's preparation after a queued predecessor fails", async (t) => {
    const first = specFor()
    const second = specFor(corrupt)
    const fetch = t.mock.method(globalThis, "fetch", async () => response(corrupt))
    const [failed, succeeded] = await Promise.allSettled([
      ensureModelsIn(dir, [first]), ensureModelsIn(dir, [second]),
    ])
    assert.equal(failed.status, "rejected")
    if (failed.status === "rejected") assert.match(String(failed.reason), /SHA256 mismatch/)
    assert.equal(succeeded.status, "fulfilled")
    assert.equal(fetch.mock.callCount(), 2)
    assert.deepEqual(await readFile(join(dir, first.filename)), corrupt)
    assert.deepEqual(await readdir(dir), [first.filename])
  })

  for (const failure of ["HTTP", "body", "SHA", "hash read"] as const) {
    it(`cleans temporary data and allows retry after ${failure} failure`, async (t) => {
      let fail = true
      const spec = specFor()
      const models = isolatedModels({
        fs: {
          createReadStream(path, options) {
            if (fail && failure === "hash read") throw new Error("synthetic hash read failure")
            return fs.createReadStream(path, options)
          },
        },
      })
      const fetch = t.mock.method(globalThis, "fetch", async () => {
        if (!fail) return response()
        if (failure === "HTTP") return new Response("unavailable", { status: 503 })
        if (failure === "SHA") return response(corrupt)
        if (failure === "body") {
          return new Response(new ReadableStream({
            start(controller) { controller.enqueue(bytes) },
            pull(controller) { controller.error(new Error("synthetic body failure")) },
          }))
        }
        return response()
      })
      const errors = { HTTP: /HTTP 503/, body: /synthetic body failure/, SHA: /SHA256 mismatch/, "hash read": /synthetic hash read failure/ }
      await assert.rejects(models.ensureModelsIn(dir, [spec]), errors[failure])
      assert.deepEqual(await readdir(dir), [])
      fail = false
      await models.ensureModelsIn(dir, [spec])
      assert.equal(fetch.mock.callCount(), 2)
      assert.deepEqual(await readFile(join(dir, spec.filename)), bytes)
      assert.deepEqual(await readdir(dir), [spec.filename])
    })
  }
})
