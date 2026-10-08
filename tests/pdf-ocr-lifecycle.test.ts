import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import type { IRBlock, OcrLine, OcrProvider, ParseWarning } from "../src/types.js"
import { OcrEngine, DEFAULT_OCR_TUNING, type OcrItem, type OcrPageStats } from "../src/ocr/engine.js"
import type { runPdfOcr } from "../src/ocr/pdf-ocr.js"

// Execute the real bridge with isolated dependency/timer fakes: no PDFium,
// native inference, model downloads or production-only dependency injection.
const bridgeSource = ts.transpileModule(readFileSync(new URL("../src/ocr/pdf-ocr.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const item: OcrItem = { text: "보존할 글", x: 1, y: 1, w: 10, h: 5, confidence: 0.9 }

function fixture(pageCount = 1) {
  const events: string[] = []
  const timers = new Map<number, () => void>()
  let timerId = 0
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    getOriginalSize: () => ({ originalWidth: 20, originalHeight: 20 }),
    render: async () => {
      events.push(`render:${i + 1}`)
      return { width: 60, height: 60, data: new Uint8Array(60 * 60 * 4).fill(255) }
    },
  }))
  const doc = {
    getPageCount: () => pageCount,
    getPage: (i: number) => { events.push(`page:${i + 1}`); return pages[i] },
    destroy: () => { events.push("destroy:document") },
  }
  const library = {
    loadDocument: async () => { events.push("load"); return doc },
    destroy: () => { events.push("destroy:library") },
  }
  const engine = {
    recognizePage: async (_rgba: Uint8Array, _w: number, _h: number, _stats?: OcrPageStats,
      _tuning?: unknown, _rules?: unknown, _signal?: AbortSignal): Promise<OcrItem[]> => [item],
  }
  const dependencies: Record<string, unknown> = {
    "../pdf/page-blocks.js": {
      extractPageBlocksWithLines: (items: Array<{ text: string }>, pageNumber: number): IRBlock[] =>
        items.map(it => ({ type: "paragraph", text: it.text, pageNumber })),
    },
    "./ruling-lines.js": {
      detectRulingLines: () => ({ cellDividers: [] }),
      rulingToPdfLines: () => ({ horizontals: [], verticals: [] }),
    },
    "./engine.js": { DEFAULT_OCR_TUNING: {}, getOcrEngine: async () => engine },
    "./models.js": { normalizeOcrLanguage: () => "korean", ensureOcrModels: async () => {} },
    "./deskew.js": { deskewPage: (rgba: Uint8Array) => ({ rgba, angle: 0 }) },
    "../utils.js": { OPTIONAL_DEP_INSTALL_HINT: "" },
    "./detection-tiles.js": { mergeOcrPasses: (a: OcrItem[], b: OcrItem[]) => [...a, ...b] },
    "@hyzyla/pdfium": { PDFiumLibrary: { init: async () => { events.push("init"); return library } } },
    sharp: () => ({ png: () => ({ toBuffer: async () => Buffer.from("fake-png") }) }),
  }
  const module = { exports: {} as { runPdfOcr: typeof runPdfOcr } }
  runInNewContext(bridgeSource, {
    module, exports: module.exports, Buffer, Uint8Array, AbortController, Error,
    require: (name: string) => {
      assert.ok(name in dependencies, `unexpected native dependency: ${name}`)
      return dependencies[name]
    },
    setTimeout: (callback: () => void, ms: number) => {
      assert.equal(ms, 120_000, "the production page budget is unchanged")
      const id = ++timerId
      timers.set(id, callback)
      return id
    },
    clearTimeout: (id: number) => { timers.delete(id) },
  }, { filename: "src/ocr/pdf-ocr.ts" })
  const warnings: ParseWarning[] = []
  const lines: OcrLine[] = []
  const run = (mode: "builtin" | OcrProvider = "builtin", targets = new Set(pages.map((_, i) => i + 1)),
    regions?: Map<number, Array<{ x1: number; y1: number; x2: number; y2: number }>>) =>
    module.exports.runPdfOcr(new ArrayBuffer(0), targets, mode, warnings, undefined, true, undefined, regions, undefined, lines)
  const expire = () => {
    assert.equal(timers.size, 1, "one active page deadline")
    const [id, callback] = [...timers][0]
    timers.delete(id)
    callback()
  }
  return { events, timers, pages, doc, library, engine, warnings, lines, run, expire }
}

test("empty or whitespace provider output is a failed page, not a successful Map entry", async () => {
  for (const empty of ["", " \n\t "]) {
    const f = fixture(2)
    const result = await f.run(async (_png, page) => page === 1 ? empty : "  다음 쪽  ")
    assert.equal(result.has(1), false, "empty OCR must not replace the original page")
    assert.equal(result.get(2)?.[0].text, "다음 쪽")
    assert.deepEqual(f.warnings.map(w => [w.page, w.code]), [[1, "OCR_FAILED"]])
    assert.match(f.warnings[0].message, /OCR 결과 없음/)
    assert.deepEqual(f.events.slice(-2), ["destroy:document", "destroy:library"])
    assert.equal(f.timers.size, 0)
  }
})

test("PDFium library is destroyed when loading the document fails", async () => {
  const f = fixture()
  f.library.loadDocument = async () => { throw new Error("load failed") }
  await assert.rejects(f.run(), /load failed/)
  assert.deepEqual(f.events, ["init", "destroy:library"])
})

test("empty builtin recognition is a failed page, not a successful Map entry", async () => {
  const f = fixture(2)
  let calls = 0
  f.engine.recognizePage = async () => ++calls === 1 ? [] : [item]
  const result = await f.run()
  assert.equal(result.has(1), false, "unknown/empty OCR is not a verified blank page")
  assert.deepEqual([...result.keys()], [2])
  assert.deepEqual(f.lines.map(line => line.bbox.page), [2])
  assert.deepEqual(f.warnings.map(w => [w.page, w.code]), [[1, "OCR_FAILED"]])
  assert.match(f.warnings[0].message, /OCR 결과 없음/)
  assert.deepEqual(f.events.slice(-2), ["destroy:document", "destroy:library"])
})

test("PDFium library is destroyed even if document destruction throws", async () => {
  const f = fixture()
  f.doc.destroy = () => { f.events.push("destroy:document"); throw new Error("destroy failed") }
  await assert.rejects(f.run(), /destroy failed/)
  assert.deepEqual(f.events.slice(-2), ["destroy:document", "destroy:library"])
  assert.equal(f.timers.size, 0)
})

test("timed-out render is drained before PDFium teardown", async () => {
  const f = fixture()
  const rendering = deferred<Awaited<ReturnType<typeof f.pages[0]["render"]>>>()
  const providerCalls: number[] = []
  f.pages[0].render = () => rendering.promise
  let settled = false
  const pending = f.run(async (_png, page) => { providerCalls.push(page); return "late" })
    .finally(() => { settled = true })
  await tick()
  f.expire()
  await tick()
  const beforeDrain = { settled, events: [...f.events] }
  rendering.resolve({ width: 1, height: 1, data: new Uint8Array(4) })
  const result = await pending
  assert.equal(beforeDrain.settled, false, "deadline must not pretend to cancel native work")
  assert.ok(!beforeDrain.events.some(e => e.startsWith("destroy:")), "PDFium still owns the pending render")
  assert.deepEqual(providerCalls, [], "no provider call after an expired render")
  assert.equal(result.size, 0)
  assert.deepEqual(f.warnings.map(w => w.code), ["OCR_FAILED"])
  assert.match(f.warnings[0].message, /타임아웃/)
  assert.deepEqual(f.events.slice(-2), ["destroy:document", "destroy:library"])
})

test("following pages wait for a timed-out inference to settle", async () => {
  const f = fixture(2)
  const inference = deferred<OcrItem[]>()
  let calls = 0
  let signal: AbortSignal | undefined
  f.engine.recognizePage = async (_rgba, _w, _h, _stats, _tuning, _rules, receivedSignal) => {
    calls++
    if (calls > 1) return [item]
    signal = receivedSignal
    return inference.promise
  }
  const pending = f.run()
  await tick()
  f.expire()
  await tick()
  const beforeDrain = { calls, events: [...f.events], aborted: signal?.aborted }
  inference.resolve([item])
  const result = await pending
  assert.equal(beforeDrain.calls, 1, "a later page must not overlap the pending inference")
  assert.ok(!beforeDrain.events.includes("page:2"))
  assert.ok(!beforeDrain.events.includes("destroy:document"))
  assert.equal(beforeDrain.aborted, true, "request cooperative engine cancellation")
  assert.deepEqual([...result.keys()], [2])
  assert.deepEqual(f.lines.map(l => l.bbox.page), [2])
  assert.deepEqual(f.warnings.map(w => [w.page, w.code]), [[1, "OCR_FAILED"]])
  assert.equal(f.timers.size, 0)
})

test("timed-out inference cannot commit late warnings, blocks or lines", async () => {
  const f = fixture()
  const inference = deferred<OcrItem[]>()
  f.pages[0].getOriginalSize = () => ({ originalWidth: 4000, originalHeight: 4000 })
  f.engine.recognizePage = async (_rgba, _w, _h, stats) => {
    const items = await inference.promise
    stats!.droppedLowConf = 3
    stats!.truncatedBoxes = 2
    return items
  }
  const pending = f.run()
  await tick()
  f.expire()
  await tick()
  inference.resolve([item])
  const result = await pending
  await tick()
  assert.equal(result.size, 0)
  assert.deepEqual(f.lines, [])
  assert.deepEqual(f.warnings.map(w => w.code), ["OCR_FAILED"], "discard page-local warnings from the failed attempt")
  const snapshot = JSON.stringify(f.warnings)
  await tick()
  assert.equal(JSON.stringify(f.warnings), snapshot, "warnings remain stable after returning")
})

test("a late provider rejection is drained and reported as the timeout", async () => {
  const f = fixture()
  const provider = deferred<string>()
  const pending = f.run(() => provider.promise)
  await tick()
  f.expire()
  await tick()
  const beforeDrain = [...f.events]
  provider.reject(new Error("late provider failure"))
  const result = await pending
  assert.ok(!beforeDrain.includes("destroy:document"))
  assert.equal(result.size, 0)
  assert.equal(f.warnings.length, 1)
  assert.match(f.warnings[0].message, /타임아웃/)
  assert.equal(f.timers.size, 0)
})

test("all selected pages finish before one ordered cleanup, including page failures", async () => {
  const f = fixture(3)
  f.pages[1].render = async () => { throw new Error("render failed") }
  const result = await f.run(async (_png, page) => `page ${page}`, new Set([3, 2, 1, 99, 0]))
  assert.deepEqual([...result.keys()], [1, 3])
  assert.deepEqual(f.warnings.map(w => [w.page, w.code]), [[2, "OCR_FAILED"]])
  assert.deepEqual(f.events, ["init", "load", "page:1", "render:1", "page:2", "page:3", "render:3", "destroy:document", "destroy:library"])
  assert.equal(f.timers.size, 0)
})

test("successful builtin output commits its warnings and lines only after completion", async () => {
  const f = fixture()
  const inference = deferred<OcrItem[]>()
  f.pages[0].getOriginalSize = () => ({ originalWidth: 4000, originalHeight: 4000 })
  f.engine.recognizePage = async (_rgba, _w, _h, stats) => {
    const items = await inference.promise
    stats!.droppedLowConf = 1
    return items
  }
  const pending = f.run()
  await tick()
  const beforeCommit = { warnings: [...f.warnings], lines: [...f.lines] }
  inference.resolve([item])
  const result = await pending
  assert.deepEqual(beforeCommit, { warnings: [], lines: [] })
  assert.deepEqual([...result.keys()], [1])
  assert.equal(f.lines.length, 1)
  assert.deepEqual(f.warnings.map(w => w.code), ["PARTIAL_PARSE", "OCR_LOW_CONF"])
  assert.equal(f.timers.size, 0)
})

test("all-page failures still close the document and library once", async () => {
  const f = fixture(2)
  const result = await f.run(async () => { throw new Error("provider unavailable") })
  assert.equal(result.size, 0)
  assert.deepEqual(f.warnings.map(w => [w.page, w.code]), [[1, "OCR_FAILED"], [2, "OCR_FAILED"]])
  assert.deepEqual(f.events.filter(e => e.startsWith("destroy:")), ["destroy:document", "destroy:library"])
  assert.equal(f.timers.size, 0)
})

test("empty target sets allocate no PDFium resources", async () => {
  const f = fixture()
  assert.equal((await f.run("builtin", new Set())).size, 0)
  assert.deepEqual(f.events, [])
})

test("a page-open failure does not skip the remaining selected pages", async () => {
  const f = fixture(2)
  const getPage = f.doc.getPage
  f.doc.getPage = i => { if (i === 0) throw new Error("page open failed"); return getPage(i) }
  const result = await f.run()
  assert.deepEqual([...result.keys()], [2])
  assert.deepEqual(f.warnings.map(w => [w.page, w.code]), [[1, "OCR_FAILED"]])
  assert.deepEqual(f.events.slice(-2), ["destroy:document", "destroy:library"])
})

test("timed-out closer reads cannot start the next image-region inference", async () => {
  const f = fixture()
  const inference = deferred<OcrItem[]>()
  let calls = 0
  let signal: AbortSignal | undefined
  f.engine.recognizePage = async (_rgba, _w, _h, _stats, _tuning, _rules, receivedSignal) => {
    calls++
    if (calls === 1) return [item]
    signal = receivedSignal
    return inference.promise
  }
  const regions = new Map([[1, [{ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 10, y1: 10, x2: 20, y2: 20 }]]])
  const pending = f.run("builtin", new Set([1]), regions)
  await tick()
  assert.equal(calls, 2, "full page followed by the first closer read")
  f.expire()
  inference.resolve([item])
  const result = await pending
  assert.equal(signal?.aborted, true)
  assert.equal(calls, 2, "the second closer read is cancelled")
  assert.equal(result.size, 0)
  assert.deepEqual(f.lines, [])
})

// Construct the real engine without loading native sessions, as in the
// neighboring batching tests. Only the sharp/native session boundaries are faked.
function engineFixture(generation?: 6) {
  const controller = new AbortController()
  const reason = new Error("test OCR deadline")
  const events: string[] = []
  class Tensor {
    constructor(public type: string, public data: Float32Array, public dims: number[]) {}
  }
  const engine = Object.assign(Object.create(OcrEngine.prototype), {
    generation, sameWidthRecBatch: 1, dict: ["A"], ort: { Tensor },
    sharp: () => {
      let width = 0, height = 0
      const chain = {
        resize: (w: number, h: number) => { width = w; height = h; return chain },
        removeAlpha: () => chain,
        raw: () => ({ toBuffer: async () => { events.push("sharp"); return Buffer.alloc(width * height * 3) } }),
      }
      return chain
    },
    det: {
      inputNames: ["input"], outputNames: ["output"],
      run: async (feeds: { input: Tensor }) => {
        events.push("det")
        const [, , h, w] = feeds.input.dims
        return { output: { data: new Float32Array(w * h) } }
      },
    },
    rec: {
      provider: "cpu", inputNames: ["input"], outputNames: ["output"],
      run: async () => {
        events.push("rec")
        return { output: { data: new Float32Array([0, 1, 0]), dims: [1, 1, 3] } }
      },
    },
  })
  const tuning = { ...DEFAULT_OCR_TUNING, detLongSide: 32 }
  return { engine, controller, reason, events, tuning }
}

test("pre-aborted engine recognition starts no detection for either model generation", async () => {
  for (const generation of [undefined, 6] as const) {
    const f = engineFixture(generation)
    f.controller.abort(f.reason)
    await assert.rejects(f.engine.recognizePage(new Uint8Array(64), 4, 4, undefined, f.tuning, [], f.controller.signal),
      error => error === f.reason)
    assert.deepEqual(f.events, [])
  }
})

test("engine cancellation after sharp prevents native detection", async () => {
  const f = engineFixture()
  const sharp = f.engine.sharp
  f.engine.sharp = () => {
    const chain = sharp()
    const raw = chain.raw
    chain.raw = () => ({ toBuffer: async () => {
      const rgb = await raw().toBuffer()
      f.controller.abort(f.reason)
      return rgb
    } })
    return chain
  }
  await assert.rejects(f.engine.detectRegion(new Uint8Array(64), 4, 4, f.tuning, f.controller.signal),
    error => error === f.reason)
  assert.deepEqual(f.events, ["sharp"])
})

test("engine drains native detection before rejecting cooperative cancellation", async () => {
  const f = engineFixture()
  const native = deferred<{ output: { data: Float32Array } }>()
  f.engine.det.run = () => { f.events.push("det"); return native.promise }
  let settled = false
  const pending = f.engine.detectRegion(new Uint8Array(64), 4, 4, f.tuning, f.controller.signal)
    .finally(() => { settled = true })
  const rejected = assert.rejects(pending, error => error === f.reason)
  await tick()
  f.controller.abort(f.reason)
  await tick()
  const beforeDrain = settled
  native.resolve({ output: { data: new Float32Array(32 * 32) } })
  await rejected
  assert.equal(beforeDrain, false, "AbortSignal is not a native hard cancellation")
})

test("aborted coarse detection cannot start detail passes or detection tiles", async () => {
  const f = engineFixture()
  const nativeRun = f.engine.det.run
  f.engine.det.run = async (feeds: unknown) => {
    const result = await nativeRun(feeds)
    f.controller.abort(f.reason)
    return result
  }
  await assert.rejects(f.engine.recognizePage(new Uint8Array(96 * 96 * 4), 96, 96, undefined, f.tuning, [], f.controller.signal),
    error => error === f.reason)
  assert.deepEqual(f.events, ["sharp", "det"])
})

test("engine cancellation between detection tiles stops the next native call", async () => {
  const f = engineFixture()
  const nativeRun = f.engine.det.run
  let calls = 0
  f.engine.det.run = async (feeds: unknown) => {
    const result = await nativeRun(feeds)
    if (++calls === 2) f.controller.abort(f.reason)
    return result
  }
  await assert.rejects(f.engine.detect(new Uint8Array(96 * 96 * 4), 96, 96, f.tuning, undefined, true, f.controller.signal),
    error => error === f.reason)
  assert.equal(calls, 2, "full page and first tile only")
})

test("engine cancellation after native recognition prevents subsequent batches", async () => {
  for (const generation of [undefined, 6] as const) {
    const f = engineFixture(generation)
    const nativeRun = f.engine.rec.run
    f.engine.rec.run = async () => {
      const result = await nativeRun()
      f.controller.abort(f.reason)
      return result
    }
    const jobs = [0, 1].map(group => ({ box: { x: 0, y: group * 48, w: 48, h: 48 }, rot: 0, group }))
    await assert.rejects(f.engine.recognizeJobs(new Uint8Array(48 * 96 * 4), 48, jobs, 1, f.controller.signal),
      error => error === f.reason)
    assert.deepEqual(f.events, ["rec"])
  }
})
