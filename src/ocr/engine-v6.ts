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
import { lineCrop, sliceBoxY, splitBoxAtCellRules, splitBoxAtRowRules, REC_HEIGHT, type Box } from "./crop.js"
import { ctcDecode, DEFAULT_OCR_TUNING, midBlankRow, valleyRow, type OcrItem, type OcrPageStats, type OcrTuning } from "./engine.js"
import { createOcrSessions, ocrDevice, ocrGpuDeviceId, ocrSameWidthRecBatch, type OcrSession } from "./execution.js"
import { ocrCpuThreads } from "./cpu-threads.js"
import { ocrSourcePath, type OcrModelSelection } from "./models.js"
import { readOnnxCharacterDict } from "./onnx-character-dict.js"
import { orientedComponentBoxes } from "./oriented-box.js"
import { ctcPrefixBeamDecode } from "./prefix-beam.js"
import { grayCrop, inkStats } from "./line-split.js"
import { disableOrtTelemetry } from "./runtime-env.js"

const DET_MIN_SIZE = 3
const DET_MAX_BOXES = 3000
const REC_MIN_WIDTH = 320
/** 배치 패딩 상한 — engine.ts 와 같은 값 */
const REC_BATCH_MAX_PIXELS = 48 * 16000
/** v6 검출 설정 — 독일어 코퍼스 실측 (포크 8e458815) */
const V6_DET = { detLongSide: 1760, detBoxThresh: 0.5, detUnclip: 1.4 } as const
/** 눕혀 찍은 쪽 판정 — engine.ts 와 같은 문턱. 검출 상자 대부분이 세로로 길면 몇 개를 돌려 읽어 본다 */
const TALL_RATIO = 1.5
const ORIENT_MIN_BOXES = 20
const ORIENT_TALL_SHARE = 0.6
const ORIENT_SAMPLE = 12
const ORIENT_MIN_CONF = 0.7
const ORIENT_GAIN = 0.1

/** 두 줄을 덮은 상자 갈라 다시 읽기 — engine.ts TALL_LINE_RATIO·TALL_LINE_SCORE 와 같은 값 */
const SPLIT_LINE_RATIO = 1.1
const SPLIT_LINE_SCORE = 0.9

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
   * 기울어진 상자도 그 변을 따라 가른다(sliceBoxY). signal 은 단계 사이 협력 취소(돌고 있는 sharp·ONNX 호출은 끝까지 기다린다)
   */
  async recognizePage(
    rgba: Uint8Array,
    width: number,
    height: number,
    stats?: OcrPageStats,
    tuning: Readonly<OcrTuning> = DEFAULT_OCR_TUNING,
    cellRules: CellRule[] = [],
    rowRules: Array<{ x1: number; x2: number; y1: number; thicknessPx: number }> = [],
    signal?: AbortSignal,
  ): Promise<OcrItem[]> {
    signal?.throwIfAborted()
    if (width < DET_MIN_SIZE || height < DET_MIN_SIZE) return []
    const t = { ...tuning, ...V6_DET }
    const detected = await this.detect(rgba, width, height, t, stats, signal)
    // 가로 표를 90° 눕혀 찍은 쪽 — 독일어 통계·양식 문서도 눕힐 수 있다. upstream 엔진(engine.ts)과 같은 판정:
    // 키 큰 상자 몇 개를 그대로·90°·270° 로 읽어 보고, 돌린 쪽이 확실히 잘 읽히면 그 각만 적고 돌아간다.
    // 호출측(pdf-ocr·image-ocr)이 래스터를 돌려(rotateQuarter) 다시 부르고 블록 좌표는 원본으로 되돌린다.
    if (tuning.orientPage && stats && detected.length >= ORIENT_MIN_BOXES) {
      const tall = detected.filter(b => b.h >= b.w * TALL_RATIO)
      if (tall.length >= detected.length * ORIENT_TALL_SHARE) {
        const sample = [...tall].sort((a, b) => b.h - a.h).slice(0, ORIENT_SAMPLE)
        const rots = [0, 90, 270] as const
        const probe = await this.recognizeBoxes(rgba, width, sample.flatMap(box => rots.map(rot => ({ box, rot }))), t.recBatch, signal)
        const mean = (k: number) => sample.reduce((sum, _, i) => sum + (probe[i * rots.length + k]?.confidence ?? 0), 0) / sample.length
        const [m0, m90, m270] = rots.map((_, k) => mean(k))
        const best = Math.max(m90, m270)
        if (best >= ORIENT_MIN_CONF && best >= m0 + ORIENT_GAIN) {
          stats.pageRotation = m90 >= m270 ? 90 : 270
          return []
        }
      }
    }
    const rows = rowRules.length ? detected.flatMap(b => splitBoxAtRowRules(b, rowRules)) : detected
    const boxes = cellRules.length ? rows.flatMap(b => splitBoxAtCellRules(b, cellRules)) : rows
    const reads = await this.recognizeBoxes(rgba, width, boxes, t.recBatch, signal)
    const items: OcrItem[] = []
    const boxOf = new Map<OcrItem, Box>()
    boxes.forEach((b, i) => {
      const r = reads[i]
      if (!r || !r.text.trim()) return
      if (r.confidence < t.textScore) { if (stats) stats.droppedLowConf++; return }
      const it = { text: r.text, x: b.x, y: b.y, w: b.w, h: b.h, confidence: r.confidence }
      items.push(it); boxOf.set(it, b)
    })
    // 두 줄을 한 상자로 잡았지만 문턱은 넘긴 줄 — engine.ts 와 같은 판정: 쪽 상자 높이 중앙값의 1.1배 넘고
    // 확신 0.9 안 되는 가로 상자만, 가운데 빈 행(골짜기)에서 갈라 다시 읽어 두 조각 모두 확실할 때만 바꾼다.
    // 한글 2자 요구는 라틴 후보로 넓혔다 — 독일어 두 줄 셀(관할청·지역인재 표)도 같은 식으로 합쳐 읽힌다.
    if (tuning.postprocess) {
      const hs = [...boxOf.values()].map(b => b.h).sort((x, y) => x - y)
      const medH = hs.length ? hs[hs.length >> 1] : 0
      const tall = items.filter(it => {
        const b = boxOf.get(it)
        return b && medH && b.h >= medH * SPLIT_LINE_RATIO && it.confidence < SPLIT_LINE_SCORE
          && b.w >= b.h * 3 && (it.text.match(/[\p{L}]/gu) ?? []).length >= 2
      })
      const halves: Array<{ it: OcrItem; top: Box; bottom: Box }> = []
      for (const it of tall) {
        const b = boxOf.get(it)!
        const gray = grayCrop(rgba, width, b)
        const cut = midBlankRow(gray, b.w, b.h, inkStats(gray)) ?? valleyRow(gray, b.w, b.h, inkStats(gray))
        if (cut) halves.push({ it, top: sliceBoxY(b, b.y, b.y + cut[0]), bottom: sliceBoxY(b, b.y + cut[1], b.y + b.h) })
      }
      const res = halves.length ? await this.recognizeBoxes(rgba, width, halves.flatMap(hv => [hv.top, hv.bottom]), t.recBatch, signal) : []
      halves.forEach((hv, k) => {
        const a = res[2 * k], c = res[2 * k + 1]
        const need = Math.max(hv.it.confidence + 0.1, 0.85)
        // 확신 못 한 조각은 그 자리를 다른 아이템이 반 넘게 덮을 때만 버린다 — 앞뒤 줄 글자 끝자락을 또 읽은 조각이다
        const covered = (bx: Box) => items.some(o => o !== hv.it
          && Math.max(0, Math.min(bx.x + bx.w, o.x + o.w) - Math.max(bx.x, o.x))
            * Math.max(0, Math.min(bx.y + bx.h, o.y + o.h) - Math.max(bx.y, o.y)) * 2 > bx.w * bx.h)
        const parts: OcrItem[] = []
        for (const [r, box] of [[a, hv.top], [c, hv.bottom]] as const) {
          if (r && r.confidence >= need && r.text.trim()) {
            const part = { text: r.text.trim(), x: box.x, y: box.y, w: box.w, h: box.h, confidence: r.confidence }
            parts.push(part); boxOf.set(part, box)
          } else if (!covered(box)) return
        }
        if (parts.length) items.splice(items.indexOf(hv.it), 1, ...parts)
      })
    }
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

  /** 상자마다 펴서 읽는다 — 폭 오름차순으로 묶어 배치(기본 1). DirectML 은 같은 폭끼리만 묶는다(ZERO1_OCR_REC_BATCH).
   *  작업은 {box, rot} — orientPage 판정은 같은 상자를 0·90·270 으로 넘긴다 */
  private async recognizeBoxes(
    rgba: Uint8Array, pageW: number, jobs: Array<Box | { box: Box; rot: 0 | 90 | 270 }>, batchSize: number, signal?: AbortSignal,
  ): Promise<Array<{ text: string; confidence: number } | null>> {
    const crops = jobs.map(j => "rot" in j ? lineCrop(rgba, pageW, j.box, j.rot) : lineCrop(rgba, pageW, j, 0))
    const order = crops.map((_, i) => i).sort((a, b) => crops[a].w - crops[b].w)
    const results: Array<{ text: string; confidence: number } | null> = new Array(jobs.length).fill(null)
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
