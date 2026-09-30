/**
 * 내장 텍스트 OCR 모델 (PP-OCRv5 korean) 스펙 + 다운로드/검증.
 *
 * 캐시 위치: `~/.cache/kordoc/models/ppocr/` — 총 ~18MB (det 4.6 + rec 12.8 + dict 0.1)
 * 다운로드 인프라는 수식 OCR 과 공용 (formula/models.ts ensureModelsIn).
 *
 * 모델 출처: PaddlePaddle 공식 HuggingFace org 의 ONNX 변환본 (Apache-2.0).
 * SHA-256 은 실제 다운로드 + HF API lfs.oid 대조로 검증됨 — 변경 금지.
 * 한국어 사전은 rec 리포의 inference.yml `PostProcess.character_dict` 에
 * 내장 (11,945자 — 완성형 한글 11,172 음절 전량 + 자모/라틴/기호).
 */

import { join } from "path"
import { stat } from "fs/promises"
import {
  type ModelSpec,
  type ModelStatus,
  type ProgressHandler,
  ensureModelsIn,
  getModelStatusIn,
  getModelsDir,
} from "../pdf/formula/models.js"

export type OcrLanguage = "korean" | "en" | "de"

export const OCR_DET_MODEL: ModelSpec = {
  name: "PP-OCRv5 mobile det",
  filename: "det.onnx",
  url: "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx/resolve/main/inference.onnx",
  sha256: "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
  sizeMb: 5,
}

export const OCR_REC_MODEL: ModelSpec = {
  name: "PP-OCRv5 korean rec",
  filename: "rec_korean.onnx",
  url: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/main/inference.onnx",
  sha256: "92f0b7785e64fc9090106a241cf4c1eb97472824558272751b88a2a4476d3a08",
  sizeMb: 13,
}

export const OCR_REC_DICT: ModelSpec = {
  name: "PP-OCRv5 korean dict",
  filename: "rec_korean.yml",
  url: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/main/inference.yml",
  sha256: "f757fa1c40e99edcf27e9cce879b93eb2a51fa46f5ef39095689b8c37dd75998",
  sizeMb: 1,
}

const OCR_EN_REC_MODEL: ModelSpec = {
  name: "PP-OCRv5 English rec",
  filename: "rec_en.onnx",
  url: "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/rec/en_PP-OCRv5_rec_mobile.onnx",
  sha256: "c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8",
  sizeMb: 13,
}

const OCR_EN_DICT: ModelSpec = {
  name: "PP-OCRv5 English dict",
  filename: "rec_en.txt",
  url: "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/paddle/PP-OCRv5/rec/en_PP-OCRv5_rec_mobile/ppocrv5_en_dict.txt",
  sha256: "e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6",
  sizeMb: 1,
}

export const ALL_OCR_MODELS: ReadonlyArray<ModelSpec> = [OCR_DET_MODEL, OCR_REC_MODEL, OCR_REC_DICT]

const OCR_V6_DET: ModelSpec = {
  name: "PP-OCRv6 medium det", filename: "det_v6.onnx",
  url: "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv6/det/PP-OCRv6_det_medium.onnx",
  sha256: "92078b7355007ccfffcd4c8cd441a3afd4538904d06881b29a155e1e679907c2", sizeMb: 60,
}
const OCR_V6_REC: ModelSpec = {
  name: "PP-OCRv6 medium rec", filename: "rec_v6.onnx",
  url: "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv6/rec/PP-OCRv6_rec_medium.onnx",
  sha256: "eef444829dbbe18d7fea59a3f6eb75647518d2b3a9568d27c92e42940204894b", sizeMb: 74,
}

export interface OcrModelProfile {
  language: OcrLanguage
  directory: string
  det: ModelSpec
  rec: ModelSpec
  dict?: ModelSpec
  generation?: 6
}

export function normalizeOcrLanguage(language?: string): OcrLanguage {
  const value = (language ?? "korean").trim().toLowerCase()
  if (value === "ko" || value === "kor" || value === "korean") return "korean"
  if (value === "en" || value === "eng" || value === "english") return "en"
  if (value === "de" || value === "deu" || value === "german" || value === "deutsch") return "de"
  throw new Error(`지원하지 않는 OCR 언어: ${language}`)
}

export function getOcrModelProfile(language?: string): OcrModelProfile {
  const normalized = normalizeOcrLanguage(language)
  if (normalized === "korean") return { language: normalized, directory: getModelsDir("ppocr"), det: OCR_DET_MODEL, rec: OCR_REC_MODEL, dict: OCR_REC_DICT }
  if (normalized === "en") return { language: normalized, directory: getModelsDir("ppocr/en"), det: OCR_DET_MODEL, rec: OCR_EN_REC_MODEL, dict: OCR_EN_DICT }
  return { language: normalized, directory: getModelsDir("ppocr/de-v6"), det: OCR_V6_DET, rec: OCR_V6_REC, generation: 6 }
}

export function profileSpecs(profile: OcrModelProfile): ModelSpec[] {
  return [profile.det, profile.rec, ...(profile.dict ? [profile.dict] : [])]
}

export function getOcrModelsDir(language?: string): string {
  return getOcrModelProfile(language).directory
}

/** 모든 텍스트 OCR 모델 다운로드/검증 (있으면 skip) */
export async function ensureOcrModels(onProgress?: ProgressHandler, language?: string): Promise<void> {
  const profile = getOcrModelProfile(language)
  return ensureModelsIn(profile.directory, profileSpecs(profile), onProgress)
}

/** 텍스트 OCR 모델 상태 (다운로드 없이 확인만) */
export async function getOcrModelStatus(language?: string): Promise<ModelStatus[]> {
  const profile = getOcrModelProfile(language)
  return getModelStatusIn(profile.directory, profileSpecs(profile))
}

/** 텍스트 OCR 모델 세 파일이 캐시에 있나 — 해시 검증 없이 존재만(파싱마다 부르는 자동 OCR 판정용, 검증은 엔진 로드가 한다) */
export async function ocrModelsCached(language?: string): Promise<boolean> {
  const profile = getOcrModelProfile(language)
  for (const spec of profileSpecs(profile)) {
    const dir = profile.directory
    try { if (!(await stat(join(dir, spec.filename))).size) return false } catch { return false }
  }
  return true
}

/**
 * inference.yml 에서 `PostProcess.character_dict` 리스트를 추출.
 * 전체 YAML 파서 없이 해당 블록의 `- <char>` 라인만 순서대로 읽는다
 * (공식 yml 구조 고정 — 들여쓰기 2칸, 한 줄 한 글자).
 *
 * CTC 클래스 배열: index 0 = blank, 1..N = 사전 순서, N+1(마지막) = space.
 */
export function parseCharacterDict(yml: string): string[] {
  const lines = yml.split("\n")
  const chars: string[] = []
  let inDict = false
  let dictIndent = -1
  for (const line of lines) {
    if (!inDict) {
      const m = /^(\s*)character_dict:\s*$/.exec(line)
      if (m) {
        inDict = true
        dictIndent = m[1].length
      }
      continue
    }
    // 리스트 항목 — YAML 은 키와 같은 들여쓰기의 "- x" 도 허용 (공식 yml 실측: 둘 다 2칸)
    const m = /^(\s*)- (.*)$/.exec(line)
    if (m && m[1].length >= dictIndent) {
      let v = m[2]
      // YAML 인용 문자 처리 ('#' 같은 예약 문자는 인용됨)
      if (v.length >= 2 && ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"')))) {
        v = v.slice(1, -1).replace(/''/g, "'")
      }
      chars.push(v)
      continue
    }
    // 들여쓰기가 얕아지면 블록 종료 (빈 줄은 통과)
    if (line.trim() !== "") break
  }
  if (chars.length > 0) return chars
  // RapidOCR's PP-OCRv5 English/Latin bundles ship the same CTC alphabet as
  // a plain one-character-per-line dictionary rather than inference.yml.
  const plain = lines.map(line => line.replace(/^\uFEFF/, "").trimEnd()).filter(line => line.length > 0)
  if (plain.length >= 32 && plain.every(line => [...line].length <= 2)) return plain
  return []
}

export function ocrModelPath(spec: ModelSpec): string {
  return join(getOcrModelsDir(), spec.filename)
}
