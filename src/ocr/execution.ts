import type { InferenceSession } from "onnxruntime-node"

export type OcrDevice = "auto" | "cpu" | "gpu"
type Provider = "cpu" | "dml" | "cuda"
type Session = Pick<InferenceSession, "run" | "release" | "inputNames" | "outputNames">
type Runtime = {
  listSupportedBackends(): readonly { name: string; bundled: boolean }[]
  InferenceSession: { create(path: string, options: InferenceSession.SessionOptions): Promise<Session> }
}

export function ocrDevice(value = "auto"): OcrDevice {
  if (value === "auto" || value === "cpu" || value === "gpu") return value
  throw new Error("ZERO1_OCR_DEVICE must be auto, cpu, or gpu")
}

export function ocrGpuDeviceId(value = "0"): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new Error("ZERO1_OCR_GPU_DEVICE_ID must be a non-negative integer")
  }
  return Number(value)
}

/** Serialize native GPU calls; DirectML sessions cannot run concurrently. In
 * auto mode, retry a failed GPU inference once on CPU and keep using CPU.
 */
export class OcrSession {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private session: Session,
    public provider: Provider,
    private readonly cpu: () => Promise<Session>,
    private readonly fallback: boolean,
    private readonly warn: (message: string) => void,
  ) {}

  get inputNames() { return this.session.inputNames }
  get outputNames() { return this.session.outputNames }

  run(feeds: InferenceSession.OnnxValueMapType, options?: InferenceSession.RunOptions): ReturnType<InferenceSession["run"]> {
    const result = this.queue.then(async () => {
      try {
        return await this.session.run(feeds, options)
      } catch (error) {
        if (this.provider === "cpu" || !this.fallback) throw error
        const failed = this.provider
        await this.session.release().catch(() => {})
        this.session = await this.cpu()
        this.provider = "cpu"
        this.warn(`[zero1-dedoc OCR] ${failed} inference failed; continuing on CPU`)
        return this.session.run(feeds, options)
      }
    })
    this.queue = result.catch(() => {})
    return result
  }

  async release(): Promise<void> {
    await this.queue
    await this.session.release()
  }
}

export async function createOcrSessions(
  ort: Runtime,
  paths: readonly [string, string],
  cpuOptions: InferenceSession.SessionOptions,
  device: OcrDevice,
  deviceId: number,
  platform: NodeJS.Platform = process.platform,
  warn: (message: string) => void = console.error,
): Promise<readonly [OcrSession, OcrSession]> {
  const preferred = platform === "win32" ? "dml" : platform === "linux" ? "cuda" : undefined
  const supported = device !== "cpu" && preferred && ort.listSupportedBackends().some(b => b.name === preferred)
  if (device === "gpu" && !supported) throw new Error("No supported OCR GPU backend; use ZERO1_OCR_DEVICE=cpu or auto")
  const providers: Provider[] = supported ? device === "gpu" ? [preferred] : [preferred, "cpu"] : ["cpu"]
  for (const provider of providers) {
    const options: InferenceSession.SessionOptions = provider === "cpu" ? cpuOptions : {
      ...cpuOptions,
      executionProviders: [{ name: provider, deviceId }, "cpu"],
      ...(provider === "dml" ? { enableMemPattern: false, executionMode: "sequential" } : {}),
    }
    const sessions: Session[] = []
    try {
      // Sequential creation allows releasing a partial pair before CPU retry.
      for (const path of paths) sessions.push(await ort.InferenceSession.create(path, options))
      return paths.map((path, i) => new OcrSession(sessions[i], provider,
        () => ort.InferenceSession.create(path, cpuOptions), device === "auto", warn)) as [OcrSession, OcrSession]
    } catch (error) {
      await Promise.all(sessions.map(s => s.release().catch(() => {})))
      if (provider === "cpu" || device === "gpu") throw error
      warn(`[zero1-dedoc OCR] ${provider} initialization failed; continuing on CPU`)
    }
  }
  throw new Error("Unable to initialize OCR sessions")
}
