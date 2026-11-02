/**
 * HWPX·HWP5 목차 항목 — 줄마다 "글 + 채움 탭 + 쪽 번호"뿐인 문단. 채움 탭 뒤 글을 남기면서(4.17.0) 쪽 번호가 제목 글에 붙어
 * 본문 제목과 다른 제목으로 outline·breadcrumb 에 들어갔다(#121). 글은 그대로 두고 제목으로 올리지 않는다
 * (PDF table-roles TOC_BLOCKS 와 같은 규칙). 일정 줄 "의견 조사 ····· 10~11월" 은 쪽 번호가 아니라 목차가 아니다.
 */

import type { IRBlock } from "./types.js"

/** 채움 탭 표지 — 문단 글을 다 모은 뒤 목차 판정을 하고 보통 탭으로 바꾼다 */
export const TOC_LEADER = "\x1F"
const LEADERS = /\x1F/g
/** 목차 쪽 번호 — 아라비아·로마 숫자, 장-쪽("3-12"), 가운데 쪽("- 5 -") */
const PAGE_LABEL = /^(?:\d{1,4}|[ivxlc]{1,7}|\d{1,3}\s*[-–]\s*\d{1,4}|[-–]\s*\d{1,4}\s*[-–])$/i

/** 제목 추정(개요 번호·글꼴 크기·"제N장")에서 뺄 목차 항목 블록 */
export const TOC_ENTRY_BLOCKS = new WeakSet<IRBlock>()

/** 채움 탭 표지를 보통 탭으로 바꾸고, 문단이 목차 항목인지 돌려준다 (\x1E 는 글자취급 표 경계) */
export function takeTocLeaders(text: string): { text: string; tocEntry: boolean } {
  if (!text.includes(TOC_LEADER)) return { text, tocEntry: false }
  const lines = text.replace(/\x1E/g, "").split("\n").filter(l => l.trim())
  const tocEntry = lines.length > 0 && lines.every(l => {
    const at = l.lastIndexOf(TOC_LEADER)
    return at > 0 && /\S/.test(l.slice(0, at).replace(LEADERS, "")) && PAGE_LABEL.test(l.slice(at + 1).trim())
  })
  return { text: text.replace(LEADERS, "\t"), tocEntry }
}
