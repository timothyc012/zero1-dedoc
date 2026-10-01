import { test } from "node:test"
import assert from "node:assert/strict"
import { createOcrSessions, ocrDevice, ocrGpuDeviceId } from "../src/ocr/execution.js"
import type { InferenceSession } from "onnxruntime-node"

const cpu = { executionProviders: ["cpu"], intraOpNumThreads: 2 } satisfies InferenceSession.SessionOptions
const paths = ["det.onnx", "rec.onnx"] as const

function runtime(backends = ["dml"], fail?: (path: string, provider: string, options: InferenceSession.SessionOptions) => boolean) {
  const calls: { path: string; options: InferenceSession.SessionOptions }[] = []
  const released: string[] = []
  let gpuRuns = 0, active = 0, peak = 0
  return {
    calls, released,
    get gpuRuns() { return gpuRuns },
    get peak() { return peak },
    listSupportedBackends: () => backends.map(name => ({ name, bundled: true })),
    InferenceSession: {
      async create(path: string, options: InferenceSession.SessionOptions) {
        calls.push({ path, options })
        const selected = options.executionProviders![0]
        const provider = typeof selected === "string" ? selected : selected.name
        if (fail?.(path, provider, options)) throw new Error("device unavailable")
        return {
          inputNames: ["input"], outputNames: ["output"],
          async run() {
            active++; peak = Math.max(peak, active)
            await new Promise(resolve => setImmediate(resolve))
            active--
            if (provider !== "cpu") gpuRuns++
            return { output: { data: new Float32Array([42]) } } as unknown as InferenceSession.OnnxValueMapType
          },
          async release() { released.push(`${provider}:${path}`) },
        }
      },
    },
  }
}

test("OCR device defaults to auto and rejects invalid configuration", () => {
  assert.equal(ocrDevice(), "auto")
  assert.equal(ocrDevice("cpu"), "cpu")
  assert.equal(ocrGpuDeviceId("1"), 1)
  for (const value of ["", "cuda", "AUTO"]) assert.throws(() => ocrDevice(value), /ZERO1_OCR_DEVICE/)
  for (const value of ["", "-1", "1.5", "foo", "2147483648", "9007199254740992"]) assert.throws(() => ocrGpuDeviceId(value), /ZERO1_OCR_GPU_DEVICE_ID/)
})

test("Windows auto selects DirectML with sequential execution and the specified adapter", async () => {
  const ort = runtime()
  const sessions = await createOcrSessions(ort, paths, cpu, "auto", 1, "win32")
  assert.deepEqual(sessions.map(s => s.provider), ["dml", "dml"])
  for (const { options } of ort.calls) {
    assert.deepEqual(options.executionProviders, [{ name: "dml", deviceId: 1 }, "cpu"])
    assert.equal(options.enableMemPattern, false)
    assert.equal(options.executionMode, "sequential")
  }
  await Promise.all(sessions.map(s => s.release()))
})

test("CPU override and a runtime without a GPU backend retain CPU options", async () => {
  for (const [backends, device] of [[["dml"], "cpu"], [[], "auto"]] as const) {
    const ort = runtime([...backends])
    const sessions = await createOcrSessions(ort, paths, cpu, device, 0, "win32")
    assert.deepEqual(sessions.map(s => s.provider), ["cpu", "cpu"])
    assert.ok(ort.calls.every(c => c.options === cpu))
  }
})

test("CUDA is attempted on Linux without DirectML-only options", async () => {
  const ort = runtime(["cuda"])
  const sessions = await createOcrSessions(ort, paths, cpu, "gpu", 0, "linux")
  assert.equal(sessions[0].provider, "cuda")
  assert.equal(ort.calls[0].options.enableMemPattern, undefined)
})

test("failed GPU pair initialization releases the partial session before retrying on CPU", async () => {
  const ort = runtime(["dml"], (path, provider) => path === paths[1] && provider === "dml")
  const messages: string[] = []
  const sessions = await createOcrSessions(ort, paths, cpu, "auto", 0, "win32", m => messages.push(m))
  assert.deepEqual(sessions.map(s => s.provider), ["cpu", "cpu"])
  assert.deepEqual(ort.released, ["dml:det.onnx"])
  assert.equal(messages.length, 1)
})

test("GPU-only mode fails visibly instead of silently retrying on CPU", async () => {
  await assert.rejects(createOcrSessions(runtime([]), paths, cpu, "gpu", 0, "win32"), /No supported OCR GPU/)
  const ort = runtime(["dml"], () => true)
  await assert.rejects(createOcrSessions(ort, paths, cpu, "gpu", 0, "win32"), /device unavailable/)
  assert.equal(ort.calls.length, 1)
})

test("GPU inference is serialized and auto retries once on CPU after a runtime failure", async () => {
  const ort = runtime()
  const messages: string[] = []
  const [det] = await createOcrSessions(ort, paths, cpu, "auto", 0, "win32", m => messages.push(m))
  await Promise.all([det.run({}), det.run({})])
  assert.equal(ort.peak, 1)
  const nativeCreate = ort.InferenceSession.create
  const failing = runtime()
  failing.InferenceSession.create = async (path, options) => {
    const session = await nativeCreate(path, options)
    if (options.executionProviders![0] !== "cpu") session.run = async () => { throw new Error("GPU out of memory") }
    return session
  }
  const [fallback] = await createOcrSessions(failing, paths, cpu, "auto", 0, "win32", m => messages.push(m))
  const result = await fallback.run({})
  assert.equal((result.output.data as Float32Array)[0], 42)
  assert.equal(fallback.provider, "cpu")
  await fallback.run({})
  assert.equal(messages.length, 1)
  await fallback.release()
})

test("GPU-only inference failure propagates without creating a CPU session", async () => {
  const ort = runtime()
  const create = ort.InferenceSession.create
  ort.InferenceSession.create = async (path, options) => {
    const session = await create(path, options)
    session.run = async () => { throw new Error("GPU run failed") }
    return session
  }
  const [det, rec] = await createOcrSessions(ort, paths, cpu, "gpu", 0, "win32")
  await assert.rejects(det.run({}), /GPU run failed/)
  assert.equal(ort.calls.length, 2)
  await Promise.all([det.release(), rec.release()])
})

test("CPU initialization failure preserves the original error and releases partial resources", async () => {
  const ort = runtime([], path => path === paths[1])
  await assert.rejects(createOcrSessions(ort, paths, cpu, "auto", 0, "win32"), /device unavailable/)
  assert.deepEqual(ort.released, ["cpu:det.onnx"])
})
