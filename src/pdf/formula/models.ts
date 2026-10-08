/**
 * 수식 OCR 모델 자동 다운로드 + SHA-256 검증
 *
 * 캐시 위치: `~/.cache/kordoc/models/pix2text/`
 * 총 ~155MB (MFD 44MB + MFR encoder 87MB + MFR decoder 30MB + tokenizer 40KB)
 *
 * HF URL + SHA 는 Docufinder archive/rust-formula-ocr-wip 에서 검증 완료됨.
 * 모델 버전 갱신 시 URL + SHA 를 함께 갱신해야 한다.
 */

import { createHash } from "crypto"
import { createReadStream } from "fs"
import { mkdir, mkdtemp, stat, rename, rm } from "fs/promises"
import { createWriteStream } from "fs"
import { homedir } from "os"
import { join, dirname, resolve } from "path"
import { pipeline } from "stream/promises"
import { Readable } from "stream"
import { assertNetworkAllowed } from "../../shared/offline.js"

export interface ModelSpec {
  name: string
  filename: string
  url: string
  sha256: string
  sizeMb: number
}

/** 모델 스펙 (SHA-256 은 실제 다운로드로 검증됨 — 변경 금지) */
export const MFD_MODEL: ModelSpec = {
  name: "Pix2Text MFD",
  filename: "mfd.onnx",
  url: "https://huggingface.co/breezedeus/pix2text-mfd/resolve/main/mfd-v20240618.onnx",
  sha256: "51a8854743b17ae654729af8db82a630c1ccfa06debf4856c8b28055f87d02c1",
  sizeMb: 42,
}

export const MFR_ENCODER_MODEL: ModelSpec = {
  name: "Pix2Text MFR encoder",
  filename: "encoder_model.onnx",
  url: "https://huggingface.co/breezedeus/pix2text-mfr/resolve/main/encoder_model.onnx",
  sha256: "bd8d5c322792e9ec45793af5569e9748f82a3d728a9e00213dbfc56c1486f37d",
  sizeMb: 87,
}

export const MFR_DECODER_MODEL: ModelSpec = {
  name: "Pix2Text MFR decoder",
  filename: "decoder_model.onnx",
  url: "https://huggingface.co/breezedeus/pix2text-mfr/resolve/main/decoder_model.onnx",
  sha256: "fd0f92d7a012f3dae41e1ac79421aea0ea888b5a66cb3f9a004e424f82f3daed",
  sizeMb: 30,
}

export const MFR_TOKENIZER: ModelSpec = {
  name: "Pix2Text MFR tokenizer",
  filename: "tokenizer.json",
  url: "https://huggingface.co/breezedeus/pix2text-mfr/resolve/main/tokenizer.json",
  sha256: "3e2ab757277d22639bec28c9d7972e352d3d1dba223051fa674002dc5ab64df3",
  sizeMb: 1,
}

export const ALL_FORMULA_MODELS: ReadonlyArray<ModelSpec> = [
  MFD_MODEL,
  MFR_ENCODER_MODEL,
  MFR_DECODER_MODEL,
  MFR_TOKENIZER,
]

/**
 * 모델 캐시 하위 디렉토리 경로. 환경 변수 `KORDOC_MODEL_CACHE` 가 설정되면
 * 해당 경로를 우선 사용, 없으면 `~/.cache/kordoc/models/<subdir>/`.
 * (수식 OCR 외 텍스트 OCR 등 다른 모델군도 공용 — subdir 로 격리)
 */
export function getModelsDir(subdir: string): string {
  const override = process.env.KORDOC_MODEL_CACHE
  if (override && override.trim()) {
    return join(override, subdir)
  }
  return join(homedir(), ".cache", "kordoc", "models", subdir)
}

export function getFormulaModelsDir(): string {
  return getModelsDir("pix2text")
}

export interface ModelStatus {
  spec: ModelSpec
  localPath: string
  exists: boolean
  /** SHA 검증까지 끝났는가 (exists && valid) */
  verified: boolean
  /** 검증 실패 시 이유 */
  invalidReason?: string
}

/** 지정 모델군의 존재/유효성 상태 반환 (다운로드 없이 확인만) */
export async function getModelStatusIn(dir: string, specs: ReadonlyArray<ModelSpec>): Promise<ModelStatus[]> {
  const result: ModelStatus[] = []
  for (const spec of specs) {
    const localPath = join(dir, spec.filename)
    let exists = false
    try {
      const s = await stat(localPath)
      exists = s.isFile() && s.size > 0
    } catch {
      exists = false
    }
    if (!exists) {
      result.push({ spec, localPath, exists: false, verified: false })
      continue
    }
    try {
      const actual = await sha256OfFile(localPath)
      if (actual === spec.sha256) {
        result.push({ spec, localPath, exists: true, verified: true })
      } else {
        result.push({
          spec,
          localPath,
          exists: true,
          verified: false,
          invalidReason: `SHA256 mismatch: expected ${spec.sha256}, got ${actual}`,
        })
      }
    } catch (e) {
      result.push({
        spec,
        localPath,
        exists: true,
        verified: false,
        invalidReason: `SHA compute failed: ${(e as Error).message}`,
      })
    }
  }
  return result
}

/** 모든 수식 모델의 존재/유효성 상태 반환 (다운로드 없이 확인만) */
export async function getFormulaModelStatus(): Promise<ModelStatus[]> {
  return getModelStatusIn(getFormulaModelsDir(), ALL_FORMULA_MODELS)
}

export interface DownloadProgress {
  spec: ModelSpec
  /** 현재까지 다운로드한 바이트 */
  downloaded: number
  /** 전체 바이트 (알 수 있으면) */
  total: number | null
  /** "download" | "verify" | "done" | "skip" */
  phase: "download" | "verify" | "done" | "skip" | "error"
  message?: string
}

export type ProgressHandler = (p: DownloadProgress) => void

// Only active preparations are shared. Settled results must be revalidated:
// file timestamps alone are not proof that the model bytes are unchanged.
const preparations = new Map<string, {
  task: Promise<void>
  listeners: Set<ProgressHandler>
  progress: { latest?: DownloadProgress }
}>()
// Distinct expected hashes must not race to replace the same destination.
const pathPreparations = new Map<string, Promise<void>>()

async function ensureModel(localPath: string, spec: ModelSpec, onProgress?: ProgressHandler): Promise<void> {
  localPath = resolve(localPath)
  const key = JSON.stringify([localPath, spec.sha256])
  let preparation = preparations.get(key)
  if (!preparation) {
    const listeners = new Set<ProgressHandler>()
    const progress: { latest?: DownloadProgress } = {}
    const report: ProgressHandler = event => {
      progress.latest = event
      // Snapshot subscribers: a reentrant subscriber receives the replay below.
      for (const listener of [...listeners]) listener(event)
    }
    const previous = pathPreparations.get(localPath)
    const task = (async () => {
      // A failed preparation must not poison the queue for another hash.
      if (previous) await previous.catch(() => {})
      await mkdir(dirname(localPath), { recursive: true })
      if (await isExistingValid(localPath, spec.sha256)) {
        report({ spec, downloaded: 0, total: null, phase: "skip", message: "이미 존재 + SHA 일치" })
        return
      }
      // Never unlink after a stale validation: another process may already
      // have installed a valid file. Only replace with verified bytes.
      await downloadToFile(spec, localPath, report)
    })()
    preparation = { task, listeners, progress }
    preparations.set(key, preparation)
    pathPreparations.set(localPath, task)
    const clear = () => {
      preparations.delete(key)
      if (pathPreparations.get(localPath) === task) pathPreparations.delete(localPath)
    }
    void task.then(clear, clear)
  }
  // Keep each subscriber's spec and progress handler, not just the leader's.
  let progressFailed = false
  let progressError: unknown
  const listener: ProgressHandler = progress => {
    if (progressFailed) return
    try {
      onProgress?.({ ...progress, spec })
    } catch (error) {
      // Subscriber errors reject only that caller, never the shared download
      // (including callbacks invoked from a stream's data event).
      progressFailed = true
      progressError = error
    }
  }
  preparation.listeners.add(listener)
  if (preparation.progress.latest) listener(preparation.progress.latest)
  try {
    await preparation.task
    if (progressFailed) throw progressError
  } finally {
    preparation.listeners.delete(listener)
  }
}

/**
 * 지정 모델군을 다운로드/검증한다.
 * - 이미 있고 SHA 일치 → skip
 * - 없음/손상 → 별도 임시파일 다운로드 + SHA 검증 후 원자적 교체.
 */
export async function ensureModelsIn(dir: string, specs: ReadonlyArray<ModelSpec>, onProgress?: ProgressHandler): Promise<void> {
  dir = resolve(dir)
  if (specs.length === 0) await mkdir(dir, { recursive: true })
  for (const spec of specs) {
    await ensureModel(join(dir, spec.filename), spec, onProgress)
  }
}

/** 필요한 모든 수식 모델을 다운로드/검증한다. */
export async function ensureFormulaModels(onProgress?: ProgressHandler): Promise<void> {
  return ensureModelsIn(getFormulaModelsDir(), ALL_FORMULA_MODELS, onProgress)
}

/** 단일 모델만 확인/다운로드 (진단 UI 에서 개별 상태 새로고침용) */
export async function ensureSingleModel(spec: ModelSpec, onProgress?: ProgressHandler): Promise<void> {
  return ensureModelsIn(getFormulaModelsDir(), [spec], onProgress)
}

async function isExistingValid(localPath: string, sha256Expected: string): Promise<boolean> {
  try {
    const s = await stat(localPath)
    if (!s.isFile() || s.size === 0) return false
  } catch {
    return false
  }
  try {
    const actual = await sha256OfFile(localPath)
    return actual === sha256Expected
  } catch {
    return false
  }
}

async function downloadToFile(
  spec: ModelSpec,
  localPath: string,
  onProgress?: ProgressHandler,
): Promise<void> {
  // 폐쇄망 모드에서는 요청 자체를 보내지 않는다 (사이드로드 안내로 대체)
  assertNetworkAllowed(
    `${spec.name} 모델 다운로드`,
    "온라인 PC에서 `kordoc models --export <디렉토리>` 로 내보낸 뒤 이 PC에서 `kordoc models --import <디렉토리>` 하거나, KORDOC_MODEL_CACHE 로 모델 캐시 경로를 지정하세요",
  )

  // A private sibling directory isolates temporary files across processes,
  // while keeping the final rename on the same filesystem.
  await mkdir(dirname(localPath), { recursive: true })
  const partDir = await mkdtemp(`${localPath}.part-`)
  const partPath = join(partDir, "download")
  try {
    const resp = await fetch(spec.url, {
      headers: {
        // HF CDN 은 UA 없으면 가끔 403 을 뱉는다
        "User-Agent": "kordoc-formula-ocr/1.0 (+https://github.com/chrisryugj/kordoc)",
      },
    })
    if (!resp.ok || !resp.body) {
      throw new Error(
        `${spec.name} 다운로드 실패: HTTP ${resp.status} ${resp.statusText} (${spec.url})`,
      )
    }

    const lenHeader = resp.headers.get("content-length")
    const total = lenHeader ? Number.parseInt(lenHeader, 10) : null
    let downloaded = 0

    const ws = createWriteStream(partPath, { flags: "wx" })
    try {
      const reader = Readable.fromWeb(resp.body as unknown as import("stream/web").ReadableStream)
      reader.on("data", (chunk: Buffer | Uint8Array) => {
        downloaded += chunk.length
        onProgress?.({ spec, downloaded, total, phase: "download" })
      })
      await pipeline(reader, ws)
    } catch (e) {
      throw new Error(`${spec.name} 스트리밍 실패: ${(e as Error).message}`)
    }

    onProgress?.({ spec, downloaded, total, phase: "verify" })

    let actual: string
    try {
      actual = await sha256OfFile(partPath)
    } catch (e) {
      throw new Error(`${spec.name} SHA 계산 실패: ${(e as Error).message}`)
    }

    if (actual !== spec.sha256) {
      throw new Error(
        `${spec.name} SHA256 mismatch: expected ${spec.sha256}, got ${actual} — 모델 URL 이 오염되었거나 전송 중 손상되었습니다.`,
      )
    }

    try {
      await rename(partPath, localPath)
    } catch (error) {
      // Another process may have won installation (Windows can return EPERM).
      // Accept only freshly verified bytes, never merely the file's presence.
      if (!await isExistingValid(localPath, spec.sha256)) throw error
    }
    onProgress?.({ spec, downloaded, total, phase: "done" })
  } finally {
    try {
      await rm(partDir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup of our own temporary files; retain the real error.
    }
  }
}

async function sha256OfFile(p: string): Promise<string> {
  const h = createHash("sha256")
  const stream = createReadStream(p)
  await pipeline(stream, async function* (src) {
    for await (const chunk of src) {
      h.update(chunk)
      // yield 안 함 (소비만)
    }
  })
  return h.digest("hex")
}
