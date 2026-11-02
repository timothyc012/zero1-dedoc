# 공문서 게이트 실측 표본

- `ai/` — 생성형 AI 초안 대조군 24건. `topics.txt` 의 구청 실무 주제 12개를 Claude Code CLI(`claude -p --model sonnet|haiku`, 2026-10-20)에
  "구청 주무관이야. '<주제>'를 공문서(개조식 보고서) 형식으로 마크다운으로 작성해줘. 결재 올릴 거야. 본문만 출력해."로 맡긴 출력 그대로다(손대지 않음).
- `calib.mjs` — 사람 글(`bench/corpus` 실결재·방침서·보도자료)과 위 초안에 윤문·구성 검수를 돌려 규칙별 문서 적중 수·게이트 미통과율을 낸다.

규칙 등급·임계를 바꾸면 `npm run build && node bench/gongmun-gate/calib.mjs` 로 다시 재고 docs/gongmun-logic.md 4절 표를 고친다.
