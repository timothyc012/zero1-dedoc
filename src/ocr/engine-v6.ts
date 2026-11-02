/**
 * (Zero1 포크) 독일어 PP-OCRv6 엔진 — `ocrLanguage: "de"` 가 고른 모델 셋(OcrModelSelection.generation 6).
 *
 * upstream 의 엔진(engine.ts)과 따로 둔다 — upstream 을 다시 가져올 때 engine.ts 와 부딪히지 않게. 공개 면은 engine.ts 의
 * OcrEngine 과 같은 recognizePage·destroy 다(pdf-ocr·image-ocr 가 그대로 부른다).
 *
 *  - det: PP-OCRv6 medium(RapidOCR 변환본), mean/std 0.5, 긴 변 1760, 상자 문턱 0.5·unclip 1.4, 최소 면적 기울어진
 *         사각형(oriented-box.ts)
 *  - rec: 기울어진 사각형을 아핀으로 펴 crop(crop.ts quadCrop), 글자 사전은 rec ONNX 메타데이터(onnx-character-dict.ts),
 *         CTC prefix beam(prefix-beam.ts)
 *  - 한 번 읽는다. 여러 배율 줄 합치기는 송장의 이름·주소를 한 상자로 합쳤다. upstream 후처리(글머리·기호 복원·리더 점·
 *    행 괘선 가르기)는 한국어 공문서용이라 쓰지 않는다
 *  - 실행: GPU(DirectML·CUDA) 우선 + 실패 시 CPU(execution.ts), CPU 스레드 예산(cpu-threads.ts)
 *
 * 근거: docs/benchmarks 의 독일어 OCR 고정 코퍼스(포크 커밋 8e458815·0d8346e8·988fcb4e). 2026-11-02 upstream v4.24.38 위에서
 * 같은 v6 모델을 upstream 경로(ocrDet·ocrRec 로컬 파일)로 돌리면 감열지 영수증 품목 줄을 0/6 읽어 이 경로를 남겼다
 */

import { readFile } from "fs/promises"
import { availableParallelism } from "node:os"
import { OPTIONAL_DEP_INSTALL_HINT } from "../utils.js"
import { lineCrop, splitBoxAtCellRules, REC_HEIGHT, type Box } from "./crop.js"
import { ctcDecode, DEFAULT_OCR_TUNING, type OcrItem, type OcrPageStats, type OcrTuning } from "./engine.js"
import { createOcrSessions, ocrDevice, ocrGpuDeviceId, ocrSameWidthRecBatch, type OcrSession } from "./execution.js"
import { ocrCpuThreads } from "./cpu-threads.js"
import { ocrSourcePath, type OcrModelSelection } from "./models.js"
import { readOnnxCharacterDict } from "./onnx-character-dict.js"
import { orientedComponentBoxes } from "./oriented-box.js"
import { ctcPrefixBeamDecode } from "./prefix-beam.js"
import { disableOrtTelemetry } from "./runtime-env.js"

const DET_MIN_SIZE = 3
const DET_MAX_BOXES = 3000
const REC_MIN_WIDTH = 320
/** 배치 패딩 상한 — engine.ts 와 같은 값 */
const REC_BATCH_MAX_PIXELS = 48 * 16000
/** v6 검출 설정 — 독일어 코퍼스 실측 (포크 8e458815) */
const V6_DET = { detLongSide: 1760, detBoxThresh: 0.5, detUnclip: 1.4 } as const

type SharpFactory = (
  input: Uint8Array | Buffer,
  options?: { raw?: { width: number; height: number; channels: number } },
) => { resize(w: number, h: number, opts?: { fit?: string }): { removeAlpha(): { raw(): { toBuffer(): Promise<Buffer> } } } }

type CellRule = { x1: number; y1: number; y2: number; thicknessPx: number }

export class GermanOcrEngine {
  private constructor(
    private det: OcrSession,
    private rec: OcrSession,
    private dict: string[],
    private ort: typeof import("onnxruntime-node"),
    private sharp: SharpFactory,
    private sameWidthRecBatch: number,
  ) {}

  static async create(models: OcrModelSelection): Promise<GermanOcrEngine> {
    disableOrtTelemetry()
    const device = ocrDevice(process.env.ZERO1_OCR_DEVICE)
    const deviceId = ocrGpuDeviceId(process.env.ZERO1_OCR_GPU_DEVICE_ID)
    const [ortMod, sharpModRaw] = await Promise.all([
      tryImport<typeof import("onnxruntime-node")>("onnxruntime-node", () => import("onnxruntime-node")),
      tryImport<{ default?: SharpFactory } & SharpFactory>("sharp", () => import("sharp") as unknown as Promise<{ default?: SharpFactory } & SharpFactory>),
    ])
    const sharpAny = sharpModRaw as { default?: SharpFactory } | SharpFactory
    const sharpMod: SharpFactory = typeof sharpAny === "function" ? sharpAny : (sharpAny.default ?? (sharpAny as unknown as SharpFactory))

    const threads = ocrCpuThreads(6, availableParallelism(), process.env.ZERO1_OCR_THREADS)
    const sessionOpts: import("onnxruntime-node").InferenceSession.SessionOptions = {
      graphOptimizationLevel: "all",
      executionProviders: ["cpu"],
      logSeverityLevel: 3, // paddle2onnx 변환 잔여물 W 로그 폭주 억제
      ...(threads !== undefined ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : {}),
    }
    const recPath = ocrSourcePath(models.rec)
    const dict = "embedded" in models.dict
      ? readOnnxCharacterDict(await readFile(recPath))
      : (await import("./models.js")).parseCharacterDict(await readFile(ocrSourcePath(models.dict), "utf-8"))
    if (dict.length === 0) throw new Error("OCR 사전 파싱 실패 — 모델 캐시를 삭제 후 재다운로드하세요")
    const [det, rec] = await createOcrSessions(ortMod, [ocrSourcePath(models.det), recPath], sessionOpts, device, deviceId)
    return new GermanOcrEngine(det, rec, dict, ortMod, sharpMod, ocrSameWidthRecBatch(6, process.env.ZERO1_OCR_REC_BATCH))
  }

  /** 고른 실행 장치 (모델마다 CPU 대체 포함) */
  get executionProviders(): readonly string[] { return [this.det.provider, this.rec.provider] }

  async destroy(): Promise<void> {
    for (const s of [this.det, this.rec]) {
      const rel = (s as unknown as { release?: () => Promise<void> }).release
      if (typeof rel === "function") {
        try { await rel.call(s) } catch { /* ignore */ }
      }
    }
  }

  /**
   * 쪽 RGBA → 글줄 (입력 픽셀 좌표, 위→아래·왼→오른). engine.ts OcrEngine.recognizePage 와 같은 꼴 — 행 괘선(rowRules)은
   * 기울어진 상자를 가르지 못해 쓰지 않는다. signal 은 단계 사이 협력 취소(돌고 있는 sharp·ONNX 호출은 끝까지 기다린다)
   */
  async recognizePage(
    rgba: Uint8Array,
    width: number,
    height: number,
    stats?: OcrPageStats,
    tuning: Readonly<OcrTuning> = DEFAULT_OCR_TUNING,
    cellRules: CellRule[] = [],
    _rowRules: unknown[] = [],
    signal?: AbortSignal,
  ): Promise<OcrItem[]> {
    signal?.throwIfAborted()
    if (width < DET_MIN_SIZE || height < DET_MIN_SIZE) return []
    const t = { ...tuning, ...V6_DET }
    const detected = await this.detect(rgba, width, height, t, stats, signal)
    const boxes = cellRules.length ? detected.flatMap(b => splitBoxAtCellRules(b, cellRules)) : detected
    const reads = await this.recognizeBoxes(rgba, width, boxes, t.recBatch, signal)
    const items: OcrItem[] = []
    boxes.forEach((b, i) => {
      const r = reads[i]
      if (!r || !r.text.trim()) return
      if (r.confidence < t.textScore) { if (stats) stats.droppedLowConf++; return }
      items.push({ text: r.text, x: b.x, y: b.y, w: b.w, h: b.h, confidence: r.confidence })
    })
    items.sort((a, b) => (a.y - b.y) || (a.x - b.x))
    return items
  }

  private async detect(
    rgba: Uint8Array, width: number, height: number, tuning: Readonly<OcrTuning>, stats?: OcrPageStats, signal?: AbortSignal,
  ): Promise<Box[]> {
    const ratio = tuning.detLongSide / Math.max(width, height)
    const dw = Math.max(32, Math.round((width * ratio) / 32) * 32)
    const dh = Math.max(32, Math.round((height * ratio) / 32) * 32)
    const rgb = await this.sharp(rgba, { raw: { width, height, channels: 4 } }).resize(dw, dh, { fit: "fill" }).removeAlpha().raw().toBuffer()
    signal?.throwIfAborted()

    // HWC RGB → CHW BGR, (x/255 − 0.5)/0.5 (PP-OCRv6 det)
    const plane = dw * dh
    const input = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      input[i] = rgb[i * 3 + 2] / 127.5 - 1
      input[plane + i] = rgb[i * 3 + 1] / 127.5 - 1
      input[2 * plane + i] = rgb[i * 3] / 127.5 - 1
    }
    const out = await this.det.run({ [this.det.inputNames[0]]: new this.ort.Tensor("float32", input, [1, 3, dh, dw]) })
    signal?.throwIfAborted()
    const probMap = out[this.det.outputNames[0]].data as Float32Array

    const raw = orientedComponentBoxes(probMap, dw, dh, tuning.detThresh, tuning.detBoxThresh, tuning.detUnclip)
    if (stats) stats.truncatedBoxes = (stats.truncatedBoxes ?? 0) + Math.max(0, raw.length - DET_MAX_BOXES)
    const sx = width / dw, sy = height / dh
    return raw.slice(0, DET_MAX_BOXES).map(box => ({
      ...box, x: Math.floor(box.x * sx), y: Math.floor(box.y * sy), w: Math.ceil(box.w * sx), h: Math.ceil(box.h * sy),
      quad: box.quad!.map(p => ({ x: p.x * sx, y: p.y * sy })) as Box["quad"],
    }))
  }

  /** 상자마다 펴서 읽는다 — 폭 오름차순으로 묶어 배치(기본 1). DirectML 은 같은 폭끼리만 묶는다(ZERO1_OCR_REC_BATCH) */
  private async recognizeBoxes(
    rgba: Uint8Array, pageW: number, boxes: Box[], batchSize: number, signal?: AbortSignal,
  ): Promise<Array<{ text: string; confidence: number } | null>> {
    const crops = boxes.map(b => lineCrop(rgba, pageW, b, 0))
    const order = crops.map((_, i) => i).sort((a, b) => crops[a].w - crops[b].w)
    const results: Array<{ text: string; confidence: number } | null> = new Array(boxes.length).fill(null)
    for (let s = 0; s < order.length;) {
      signal?.throwIfAborted()
      // 앞 실행에서 CPU 로 바뀌었을 수 있다 — GPU 는 한 줄씩 채운 폭을 지키고, CPU 에선 묶지 않는다
      const sameWidthBatch = this.rec.provider === "dml" && batchSize === 1 && this.sameWidthRecBatch > 1
      const maxBatch = sameWidthBatch ? this.sameWidthRecBatch : Math.max(1, batchSize)
      let e = s + 1
      while (e < order.length && e - s < maxBatch
        && (!sameWidthBatch || Math.max(REC_MIN_WIDTH, crops[order[e]].w) === Math.max(REC_MIN_WIDTH, crops[order[s]].w))
        && (e - s + 1) * Math.max(REC_MIN_WIDTH, crops[order[e]].w) * REC_HEIGHT <= REC_BATCH_MAX_PIXELS) e++
      const idx = order.slice(s, e)
      const bw = Math.max(REC_MIN_WIDTH, crops[idx[idx.length - 1]].w)
      const chw = 3 * REC_HEIGHT * bw, p = REC_HEIGHT * bw
      const input = new Float32Array(idx.length * chw) // 채운 자리는 0 (공식 zero-pad)
      idx.forEach((ci, k) => {
        const c = crops[ci], base = k * chw
        for (let y = 0; y < REC_HEIGHT; y++) for (let x = 0; x < c.w; x++) {
          const src = (y * c.w + x) * 3, dst = base + y * bw + x
          input[dst] = c.rgb[src + 2] / 127.5 - 1
          input[dst + p] = c.rgb[src + 1] / 127.5 - 1
          input[dst + 2 * p] = c.rgb[src] / 127.5 - 1
        }
      })
      const out = await this.rec.run({ [this.rec.inputNames[0]]: new this.ort.Tensor("float32", input, [idx.length, 3, REC_HEIGHT, bw]) })
      signal?.throwIfAborted()
      const logits = out[this.rec.outputNames[0]]
      const [, T, C] = logits.dims as number[]
      if (C !== this.dict.length + 2) throw new Error("OCR recognizer/alphabet class mismatch")
      const data = logits.data as Float32Array
      idx.forEach((ci, k) => {
        const values = data.subarray(k * T * C, (k + 1) * T * C)
        const r = ctcPrefixBeamDecode(values, T, C, this.dict, ctcDecode(values, T, C, this.dict))
        results[ci] = r && { text: r.text, confidence: r.confidence }
      })
      s = e
    }
    return results
  }
}

async function tryImport<T>(name: string, loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (e) {
    throw new Error(
      `내장 OCR 을 사용하려면 optional dependency '${name}' 이 필요합니다. ` +
        `\`npm install ${name}\` 후 다시 실행하세요.${OPTIONAL_DEP_INSTALL_HINT} 원인: ${(e as Error).message}`,
    )
  }
}
