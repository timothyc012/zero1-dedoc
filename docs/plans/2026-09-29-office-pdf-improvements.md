# Zero1 Dedoc: Office·PDF·스캔 품질 개선 계획

작성일: 2026-09-29. 상태: **구현 전 검토용 계획**. 범위는 MS Office, PDF, 독일어·영어 스캔이다. HWP 전용 코퍼스 수집·평가는 사용자 요청에 따라 범위에서 제외한다.

## 1. 현재 확보한 상태

| 항목 | 고정 기준 |
| --- | --- |
| Zero1 평가 버전 | `8d815693d2c7c2ec9c2a6309fd8528160abe132a`, `4.16.1-zero1.1` |
| 포크 분기점 | Kordoc `878b7009a97a1e7d0f37e304ad2046b6d7916818`, v4.16.1 |
| 새 upstream | Kordoc **v4.16.3**, `bb71f7fb0bf51dd456d27505a8c04772df182144` |
| 이번 동기화 | Zero1의 `upstream/main`·태그 fetch 완료. 원본 최신 main을 `/Users/01/Desktop/DEVProject/kordoc-upstream`에 별도 클론 완료. |
| Zero1에 새 upstream 반영 | 아래 U1/U2에서 별도 PR로 수행. 이번 작업의 산출물은 계획 문서와 최신 원본 클론이다. |
| 평가 근거 | Office 12개(DOCX 5, XLSX 5, XLS 1, PPTX 1), 동일 입력 PDF 8개. 파일별 SHA-256과 원본 XML·셀 값 대조. |

이번 평가 자료는 로컬 `zero1-multiformat-eval/report-office-pdf.md`와 `office-pdf-input-manifest.json`에 있다. 현재 호스트의 전체 경로는 `/Users/01/.codex/visualizations/2026/09/29/01a0ec44-7734-7252-a795-cf9a47ef597f/zero1-multiformat-eval/`다. 구현 시작 시 G0에서 이를 재현 가능한 저장소 내 manifest로 옮긴다. 기존 [독일어·ODL200 근거](../benchmarks/zero1-multilingual-foundation.md)도 유지한다.

## 2. 개선할 문제와 채택할 방식

| 우선순위 | 관측한 문제/강점 | 참고 구현 | Zero1에 적용할 방식 |
| --- | --- | --- | --- |
| P0 | 새 upstream에 MCP 생성 이미지 접근 수정이 있음 | Kordoc `1a70bc1` | 원본 커밋을 출처 표시와 함께 cherry-pick |
| P0 | 새 upstream의 위·아래첨자 보존 | Kordoc `cc1fca2` | 기능 커밋을 통째로 반영하고 포크 메타데이터 충돌 해결 |
| P0 | 평가가 글자 존재를 확인해도 수식 순서·계정코드 손상을 놓칠 수 있음 | Office 원본 XML/셀, PDF 수동 정답 | 내용·순서·셀 소속·지원 여부를 각각 검사하는 고정 평가 |
| P1 | DOCX `For m=1,` → `For , m=1` | MarkItDown의 OMML 원위치 치환 | 기존 TS XML 순회 중 수식을 그 자리에서 방출 |
| P1 | PDF 보도자료 제목 H3, 부제 H1로 역전 | OpenDataLoader의 제목 후보·통계·역할 분리 | 문서 전체의 본문 스타일과 제목 역할을 반영해 레벨 재계산 |
| P1 | BMF 세수표 뒤쪽 PDF 페이지가 여러 조각으로 분절 | OpenDataLoader의 표 경계·내용 소속·구조 정규화 | 격자 선택과 텍스트 소속을 추적한 뒤 기하 근거로 재구성 |
| P1 | Zero1은 `0420`·`0970`과 XLSX 원본 숫자를 잘 보존 | Zero1 자체 구현 | 장점을 회귀 게이트로 고정. pandas형 타입 추론·출력 반올림은 도입하지 않음 |
| P2 | PPTX 미지원 | MarkItDown의 슬라이드·도형·노트 처리 | ZIP/XML을 읽는 네이티브 TS 파서로 단계적 구현 |
| P2 | 현재 OCR 모델 선택이 한국어 모델에 고정됨 | Docling 언어→모델 해석, RapidOCR 모델·전처리 설정 | 기존 Node ONNX 엔진에 검증된 de/en 모델 프로필과 사전 캐시 추가 |
| P2 | 이미지 표지만 있어도 파싱 API는 성공일 수 있음 | 기존 Zero1 `pageQuality`·`qualitySummary`·`NEEDS_OCR` | 기존 신호를 활용해 내용 추출 상태를 명시하고 02ontology까지 전달 |

### 코드 반영 원칙

- 같은 Git 역사를 공유하는 **Kordoc 커밋만 실제 `git cherry-pick -x`** 대상으로 삼는다.
- MarkItDown(Python), OpenDataLoader(Java), Docling/RapidOCR(Python)의 동작은 Zero1의 `Buffer → IRBlock[] → Markdown` 구조에 맞게 구현한다. Python/Java 전체 런타임을 기본 npm 패키지에 넣는 설계는 채택하지 않는다.
- 실제 코드를 번역·복사하면 원본 파일과 커밋, 수정 여부, 저작권·라이선스를 `NOTICE`/`THIRD_PARTY`에 기록한다. ODL 자체 Apache-2.0 파일과 veraPDF 유래 MPL-2.0 구성요소를 구별한다. 표 경계의 핵심 클래스가 외부 의존성에 있으면 해당 파일까지 확인한 뒤 채택한다.
- 기존 `parse()`, IR, CLI/MCP 호환성을 유지한다. `success`의 의미를 조용히 변경하지 않고 내용 품질 신호를 추가·전달한다. 파서별 `raw` 출력과 실제 backend 식별자를 보존한다.

## 3. upstream 업데이트 분석

분기점 이후 upstream main에는 6개 커밋이 추가됐고 42개 파일이 달라졌다. 작업 트리 비교에서 양쪽이 수정한 경로는 `AGENTS.md`, `CHANGELOG.md`, `README.md`, `package.json`, `package-lock.json`, `src/cli.ts`다. 이는 **중복 수정 경로 목록**이며 실제 merge 충돌을 실행해 본 결과는 아니다.

| 커밋 | 내용 | 반영 정책 |
| --- | --- | --- |
| [`1a70bc1`](https://github.com/chrisryugj/kordoc/commit/1a70bc16b00e96646c8c1f12e335f5f8ba3c0abd) | CLI/MCP 이미지 로더의 실경로 확인·일반 파일 검사·Unicode 파일명 | U1에서 원본 기능 커밋 반영 |
| [`cc1fca2`](https://github.com/chrisryugj/kordoc/commit/cc1fca205f08f1ac2ec1fd0541c6f891c0722327) | `scriptTags`, DOCX `vertAlign`, PDF 첨자·2단 저자 줄 배치 | U2에서 원본 기능 커밋 반영; 여러 모듈에 걸친 원자적 변경을 임의로 분할하지 않음 |
| `7f180fb`, `bb71f7f` | v4.16.2/v4.16.3 릴리스 메타데이터 | 그대로 cherry-pick하지 않음. Zero1 이름·버전·bin·저장소 주소 유지 |
| `d74e9ee` | PR #101 merge commit | 기능 커밋을 이미 가져오므로 중복 반영하지 않음 |
| `8509020` | upstream 공통 지침과 architecture/corpus 문서 | 참고 문서는 필요한 부분을 출처와 함께 반영. Zero1 `AGENTS.md`의 PR·배포 정책 유지 |

소스 차이상 v4.16.3은 DOCX `collectInline()`의 “일반 run 처리 후 수식 덧붙이기”를 여전히 사용한다. 신규 PDF 변경도 첨자와 줄 배치 중심이며 표 격자 선택·문서 제목 레벨 문제의 해결을 입증하지 않는다. **새 버전의 실문서 재평가는 U2에서 수행**한다.

upstream changelog의 ODL 수치 약 0.960과 우리 고정 실행의 0.937을 직접 비교하지 않는다. 옵션·정규화·평가기 일치가 먼저다. `scriptTags` 관련 upstream 내부 정규화 변경도 외부 ODL200 정답·평가기 변경의 근거가 되지 않는다.

## 4. 고정 검증 기준

### 기존 사례: 개발용 회귀 집합

- PDF: BMF 11쪽 전체, 보험 양식 29쪽의 식별자 5개, 보도자료 2쪽 제목 위계, 영어 Clean Hydrogen 230쪽, 소형 fixture 3개, 이미지 전용 fixture 1개.
- Office: 원본 DOCX 본문 5개, Excel 원본 문자열/숫자 6개, PPTX 1개. 기존 파일 hash를 바꾸지 않는다.
- DOCX는 문단의 **텍스트·수식·구두점 순서**를 검사한다. 글자 다중집합만으로 통과시키지 않는다.
- Excel은 셀 주소와 원본 타입을 기준으로 비교한다. 짧은 코드가 다른 숫자의 부분 문자열에 있으면 통과하는 평가를 사용하지 않는다. `0420` 3회와 `0970` 1회가 각각 원래 셀에 남아야 한다.
- PDF 표는 표 수 감소를 목표 점수로 삼지 않는다. `81 → 12` 같은 출력 개수 맞추기 대신 원본의 표 영역·행·열·병합·숫자의 셀 소속으로 판정한다.
- 새 OCR 모델은 인식 문자/단어 오류율과 식별자·금액 정확도를 언어별로 측정한다. 인식기 confidence는 보조 신호이며 정답의 대체물이 아니다.

### 구현 전 별도 확보할 holdout

현재 20개는 이미 개선 방향에 사용했으므로 holdout으로 주장하지 않는다. 새 표본과 정답은 파서 출력 확인 전에 고정한다.

| 트랙 | 최소 추가 범위 | 판정 |
| --- | --- | --- |
| DOCX | 수식·링크·표 셀·각주를 섞은 사례 6개 이상 | inline 순서와 중복/누락 0, source-backed key assertions 100% |
| PDF 표/제목 | BMF 외 독립 발행자 3곳 이상의 표·제목 문서 6개 이상 | 수동 검증한 핵심 셀·식별자·제목 관계 100%, 기존 고정 지표의 문서별 후퇴 없음 |
| PPTX | 다단·그룹 도형·병합표·노트·이미지 포함 4개 이상 | 지원 영역의 텍스트·순서·표·slide locator 단언 통과, 미지원 개체는 경고 |
| 스캔 | 독일어/영어 각각 독립 문서 10개 이상, 각 언어 20쪽 이상 | 언어별 CER/WER 공개, 중요 식별자·금액 오류 0; 비교 OCR보다 문서별 악화가 있으면 기본 승격 보류 |

깨끗한 원본과 흐림·회전·저해상도 파생본은 같은 원본 그룹으로 묶어 개발/holdout에 나누지 않는다. OCR의 일반적 CER 허용치는 개발 집합에서 정해 holdout 실행 전에 고정한다. 이 숫자는 결과가 아니라 앞으로 확보할 최소 평가 범위다.

## 5. 작업 순서와 PR 단위

### G0. 평가 자료를 재현 가능한 게이트로 고정

**범위 M:** `bench/office-pdf-manifest.json`(신규), `bench/office-pdf-eval.mjs`(신규), `docs/benchmarks/office-pdf-evaluation.md`(신규). 원본은 검토한 공개 URL/고정 커밋에서 받고 SHA로 확인한다. 비공개 자료와 머신 절대경로를 저장소에 넣지 않는다.

- [ ] 20개 입력과 평가 버전의 해시·옵션·기준 결과를 manifest에 기록하고 재실행 명령 하나로 결과 JSON을 만든다.
- [ ] 문자 보존, inline 순서, 셀 값/타입, table geometry, format support, OCR 수행/미수행을 독립 지표로 낸다. 지원 여부와 품질 합격을 분리한다.
- [ ] 검사기를 건드리면 변경 이유·기존/새 점수를 함께 남긴다. ODL200 외부 평가기는 고정한다.

**검증:** 저장된 20개 평가를 재현하고 알려진 수식 순서·계정코드·PPTX·스캔 사례를 평가기가 구별하는지 확인. **의존성:** 없음.

### U1. upstream 이미지 접근 수정 반영

**상태:** 구현 완료 in `694c1d2`.

**범위:** 원본 보안 패치 6개 파일을 하나의 PR로 유지한다.

- [ ] `git cherry-pick -x 1a70bc16b00e96646c8c1f12e335f5f8ba3c0abd`를 별도 `codex/*` 브랜치에서 수행하고 출처를 유지한다.
- [ ] 루트 밖 심링크·특수 파일 접근을 거부하고, 허용된 디렉터리의 Unicode 그림 이름을 읽는 기존 기능을 보존한다.
- [ ] Zero1 package/bin/MCP 이름과 기존 fork 지침이 유지된다.

**검증:** `node --import tsx --test tests/generate-image-dir.test.ts tests/mcp-generate-images.test.ts`, typecheck/build. **의존성:** 없음. 계획 승인 후 첫 반영 PR.

### U2. upstream 첨자/저자 줄 기능 반영

**상태:** 구현 완료 in `b9562b6`.

**범위:** `cc1fca2`는 다수 파서·공통 렌더러를 함께 바꾸므로 원자적 upstream PR로 취급한다.

- [ ] `git cherry-pick -x cc1fca205f08f1ac2ec1fd0541c6f891c0722327` 후 README/CLI 충돌을 Zero1 정체성과 upstream 옵션 모두 유지하도록 해결한다.
- [ ] PDF `scriptTags` 기본 off, DOCX 기본 on을 검증하고 숫자 첨자·구두점·HTML 표 렌더링을 확인한다. 새 기능의 정규화 정책을 기록한다.
- [ ] `docs/UPSTREAM.md`에 가져온 기능 커밋을 남긴다. upstream 전체 main을 병합했다고 표현하지 않는다. 릴리스 커밋의 `name: kordoc` 등은 가져오지 않는다.

**검증:** upstream `tests/sup-sub.test.ts`, 전체 `npm test`, build/typecheck, 고정 ODL200과 G0 Office/PDF 및 German smoke. 원본 v4.16.3 클론도 동일 옵션으로 측정해 변경 원인을 구별한다. **의존성:** G0, U1.

### P1. PDF 분절 원인과 페이지별 정답 확정

**범위 M:** `bench/pdf-grid-trace.mjs`(신규), `src/pdf/page-blocks.ts`의 opt-in 진단 지점, `bench/office-pdf-gold.json`(신규).

- [ ] BMF 4–11쪽의 선·클립·최종 격자와 텍스트 소속을 파일로 시각화하여 어느 단계에서 10/11열이 조각나는지 확정한다. 좌표계·페이지 회전·클립 경계와 기존 필터의 영향을 구별한다.
- [ ] 공식 XLSX와 원본 PDF를 함께 확인해 각 PDF 페이지의 표시 열·병합 셀·반복 헤더·합계 행을 정답으로 고정한다. workbook 전체 열 수를 PDF 페이지 열 수로 가정하지 않는다.
- [ ] 같은 증거로 재현되는 최소 양성/음성 예제를 만든다. 별도 표·주석 박스·중첩 표를 하나로 합치는 오탐도 포함한다.

**검증:** 디버그 출력을 꺼도 기존 parser 결과가 같고, 정답은 ODL 출력만 복사해 만들지 않았음을 문서화한다. **의존성:** U2. 고위험 작업이므로 기능 확장 전에 진단한다.

### E1. Excel의 값 보존을 회귀 기준으로 고정

**상태:** 구현 완료 in current implementation branch. XLSX 합성 테스트가 문자열 계정 코드 `0420`·`0970`의 앞자리 0 보존을 직접 검사한다.

**범위 S:** `tests/xlsx.test.ts`, `tests/xls.test.ts`, G0 manifest/gold.

- [ ] `0420`, `0970`, 날짜처럼 보이는 문자열, 지수형 숫자, 소수, merged cells를 원본 타입과 위치로 검사한다.
- [ ] BMF 선택 행 6개 값에 대한 기존 정확도를 유지한다. 원본 저장값과 표시 서식을 구분하고 후자를 전자로 덮어쓰지 않는다.
- [ ] 공식 셀은 저장된 계산 결과만 사용하고 캐시 없는 공식을 임의 계산하거나 0으로 바꾸지 않으며, 누락/잘림은 기존 경고 경로로 알린다.

**검증:** XLS/XLSX 6개 전체의 source-cell 비교, 지정 코드 4회 정확 일치, 현재 raw-value probe 오차 0 유지. 구현 변경이 필요한 경우 `src/xlsx/parser.ts`/`sheet-blocks.ts`를 별도 작은 수정으로 한정한다. **의존성:** G0, U2.

### D1. DOCX inline 수식 순서 수정

**상태:** 구현 완료 in `78c7062`.

**범위 S:** `src/docx/parser.ts`, `tests/docx.test.ts`.

- [ ] `collectInline()`이 XML 자식 순서대로 일반 run·수식·하이퍼링크·필드를 처리하도록 한다. 마지막에 모든 OMML을 덧붙이는 처리를 제거하고 중첩 `oMathPara/oMath` 중복 방출을 막는다.
- [ ] `For $m=1$,`과 `The angle is $…$.`가 원본 순서를 유지한다. 한 문단의 여러 수식, 표 셀·링크 내부 수식, display math를 포함한다.
- [ ] U2의 sup/sub·스타일과 기존 링크·각주·필드 처리 결과가 유지된다.

**검증:** `node --import tsx --test tests/docx-equation.test.ts tests/docx.test.ts tests/docx-numbering.test.ts tests/sup-sub.test.ts`, DOCX 5개와 신규 holdout의 순서 gold. **의존성:** U2, G0.

### H1. PDF 제목 역할과 레벨 교정

**범위 M:** `src/pdf/block-detect.ts`, 필요하면 `src/pdf/heading-demote.ts`, `tests/pdf-typography-headings.test.ts`, G0 gold.

- [ ] font size 하나로 계층을 정하지 않고 본문 스타일의 빈도, font weight, 페이지 위치, 앞뒤 본문·제목 관계를 함께 사용한다. 문서 제목 후보 판정과 섹션 레벨 부여를 구분한다.
- [ ] 보도자료 제목이 부제보다 상위 레벨이 되고 전체 문서의 제목/본문 순서가 보존된다. 독일어 제목 문자열이나 특정 파일명을 조건으로 넣지 않는다.
- [ ] 큰 글씨 인용문·기관 로고·표 제목·머리말을 H1로 올리는 음성 사례와 U2의 논문 저자 첨자 사례를 통과한다.

**검증:** 해당 heading 테스트, 고정 ODL200의 문서별 MHS·NID 후퇴 없음, 독립 발행자 제목 holdout. **의존성:** U2, G0.

### T1. PDF 표 격자와 텍스트 소속 복원

**상태:** 첫 구현 slice 완료 in working branch. `dropCoarseClipGrids`가 10열 이상 보고서에서 지역 세로선이 끊긴 전폭 숫자행을 텍스트 분포로 판정하고 선 격자에 맡긴다. 31×11 BMF 본문 표가 페이지 5와 9에서 단일 표로 유지되는 것을 smoke에 추가했다. 전체 BMF 뒤쪽 표의 모든 의미 분절은 아직 남아 있어 후속 slice가 필요하다.

**범위 M:** P1에서 확정한 경로를 기준으로 `src/pdf/table-grid.ts`, `src/pdf/page-blocks.ts`, 필요 시 `src/pdf/cell-extract.ts`, `tests/pdf-nonhancom.test.ts`를 중심으로 수정한다. 원인이 다른 모듈에 있으면 진단 결과와 함께 별도 작업으로 나눈다.

- [ ] ODL의 완성된 표 경계와 내용 소속을 먼저 확인하는 방식을 참고해, 행·열 정렬 근거가 있는 영역만 재구성한다. 한 텍스트 토큰은 원본 위치에 맞는 한 셀에 소속돼야 한다.
- [ ] BMF 11쪽 전체의 gold 셀, 열 수, 병합, 합계와 기존 양식 ID를 통과한다. 분절 개수만 맞추는 후처리·문자열 분할은 사용하지 않는다.
- [ ] `table-parts.ts`의 서로 다른 표 병합 방지와 coarse clip의 주석 보존, 기존 1–3쪽 7열·마지막 합계행을 유지한다.

**검증:** 표 단위 테스트, German smoke 확장본, PDF holdout, 고정 ODL200 문서별 NID/TEDS/MHS. 벽시계·RSS와 토큰 유실도 기록. **의존성:** P1, E1. 제일 큰 구현 위험이며 실패하면 기본 PDF 승격을 보류한다.

### X1. PPTX 텍스트·슬라이드·노트 읽기

**상태:** 구현 완료 in current implementation branch. 실제 slide relationship 순서, 제목/부제, 텍스트 도형, 표, speaker notes를 IR로 내보낸다. malformed PPTX는 구조화된 `PARSE_ERROR`로 반환한다.

**범위 M:** `src/pptx/parser.ts`(신규), `src/index.ts`, `tests/pptx.test.ts`(신규), `tests/pptx-surfaces.test.ts`.

- [ ] `presentation.xml`과 관계 파일의 실제 슬라이드 순서를 따른다. 제목·본문·노트를 IR로 내고 slide 번호를 `pageNumber`에 남긴다.
- [ ] 기존 JSZip/XML 도구와 리소스 제한을 재사용한다. 외부 관계 URL을 자동으로 읽지 않는다. 제목/노트/빈 슬라이드의 중복 방출을 막는다.
- [ ] 기존 fixture 28개 텍스트 문단과 새 slide-order gold를 통과한다. 파싱 지원과 편집·양식 채우기·HWPX 생성 지원을 구분한다.

**검증:** `node --import tsx --test tests/pptx.test.ts tests/pptx-surfaces.test.ts`, DOCX/XLSX 라우팅 회귀, CLI/MCP parse 결과. **의존성:** G0, U2.

### X2. PPTX 표·그룹 도형과 공개 표면 연결

**범위 M:** `src/pptx/parser.ts`, `src/pptx/shapes.ts`(신규), `src/mcp/shared.ts`의 parse 전용 확장자 허용 목록, `tests/pptx.test.ts`, `tests/pptx-surfaces.test.ts`.

- [ ] 그룹 도형의 좌표 변환을 적용한 읽기 순서와 병합표 `rowSpan/colSpan`을 보존한다. XML 순서와 시각 순서가 다른 사례를 gold에 포함한다.
- [ ] 이미지 alt와 위치를 남기고, 구현하지 않은 SmartArt·차트·애니메이션의 데이터는 조용히 유실시키지 않고 지원 범위를 경고한다. 텍스트 없는 그림에서 OCR을 수행했다고 표시하지 않는다.
- [ ] parse/worker/CLI/MCP의 PPTX 허용 범위를 일치시킨다. 기존 편집·생성·채우기 도구의 PPTX 거부 테스트는 해당 기능을 구현하기 전까지 유지한다.

**검증:** 그룹·다단·표·노트·그림 holdout, protocol contract, output budget. **의존성:** X1.

### O1. de/en OCR 모델 프로필과 사전 준비

**상태:** 첫 구현 slice 완료 in current implementation branch. PP-OCRv5 English와 Latin/German recognizer·사전의 URL/SHA를 고정하고 `ocrLanguage=korean|en|de`, 언어별 캐시, 명시적인 미지원 언어 오류를 연결했다. 준비 명령은 `check-ocr-models --language <lang>`으로 선택한다. 실제 de/en 이미지 인식 정확도와 모델 다운로드는 O2 검증에서 완료한다.

**범위 M:** `src/ocr/models.ts`, `src/types.ts`, `src/ocr/engine.ts`, `src/ocr/pdf-ocr.ts`, `src/ocr/image-ocr.ts`, `src/cli.ts`, `src/cli/commands-system.ts`, `src/shared/model-bundle.ts`, `tests/ocr.test.ts`.

- [ ] `ocrLanguage` 또는 동등한 명시 옵션으로 언어→recognizer/dictionary/preprocessing 프로필을 선택한다. Docling/RapidOCR의 언어 해석을 참고하며 `de`를 이름만 바꾼 한국어 모델로 처리하지 않는다.
- [ ] 모델·사전 SHA, 라이선스, 입력 크기·채널 순서·정규화·출력 class 차원을 함께 고정한다. 독일어 ä/ö/ü/ß, 영어, 유럽식 소수·천 단위를 실제 모델에서 검증한다.
- [x] 모델 준비 명령과 parse 실행을 구분한다. offline+캐시 없음/해시 불일치에서 명확히 실패 또는 `NEEDS_OCR`를 반환하고 런타임이 몰래 다운로드하지 않는다.

**검증:** 언어 해석/캐시/해시 테스트, English와 Latin/German 모델을 실제로 SHA 검증해 준비하고 이미지 전용 PDF를 각각 인식했다. **의존성:** U2, G0. 선택한 모델의 native ONNX 출력 호환성을 실증했다.

### O2. 기존 ONNX 엔진에 프로필 적용·품질 신호 전달

**상태:** 기본 프로필 연결 구현 완료. 동일 이미지 전용 PDF에서 English와 Latin/German 프로필이 각각 `HORIZON CLEAN AVIATION 2026`과 `TOPIC CALL BUDGET`을 복원했다. 실제 독일어·영어 문서군 CER/WER holdout은 남아 있다.

**범위 M:** `src/ocr/engine.ts`, `src/ocr/models.ts`, `src/ocr/pdf-ocr.ts`, `src/ocr/image-ocr.ts`, `src/pdf/parser.ts`, `src/types.ts`, `tests/ocr.test.ts`.

- [ ] O1의 입력/출력 계약에 맞춰 인식을 수행하고 한국어 전용 후처리가 독일어·영어에 적용되지 않게 한다. 텍스트층/스캔 혼합 PDF에서 필요한 페이지만 OCR한다.
- [ ] 기존 `pageQuality`, `qualitySummary`, `NEEDS_OCR`, 내부 `ocrApplied` 신호를 일관되게 노출한다. `ocr:false`, 모델 없음, 인식 실패, 인식 후 충분한 본문을 구분한다. `success=true`의 파싱 계약은 유지한다.
- [ ] 영문 합성 1쪽과 de/en holdout에서 CER/WER·숫자·식별자·page locator를 함께 검증한다. RapidOCR/Docling을 동일 입력의 독립 비교 구현으로 사용한다.

**검증:** OCR unit tests, 해시 고정 de/en scan corpus, 이미지 전용/혼합 PDF의 offline Docker 실행. 누락 모델·낮은 신뢰도·빈 인식 음성 시나리오 포함. **의존성:** O1.

### O3. OCR 언어·품질 옵션을 CLI/MCP/worker에 연결

**범위 M:** `src/cli.ts`, `src/mcp/tools-parse.ts`, `src/cli/commands-worker.ts`, `tests/parse-worker.test.ts`, OCR surface 테스트(신규).

- [ ] 라이브러리의 모델 프로필 선택을 CLI `--ocr-language`, MCP `ocr_language`, 제한된 worker 옵션으로 전달한다. 알 수 없는 언어는 기본 모델로 숨겨 대체하지 않는다.
- [ ] worker의 결과 크기·protocol 호환성을 유지하면서 실제 모델 ID/해시, OCR 수행 페이지, 미해결 품질 경고를 노출한다.
- [ ] API/CLI/MCP/worker 모두 같은 입력과 프로필에서 같은 품질 상태를 반환한다.

**검증:** 오프라인 prepared/missing-model 시나리오와 de/en 결과 비교. **의존성:** O2.

### I1. 02ontology 명시 선택 어댑터

**별도 저장소 작업, 범위 M:** `src/onto_kernel/bridge/kordoc_adapter.py`, `parser_selection.py`, `tests/test_bridge_kordoc_adapter.py`, parser-selection 테스트. I2와 한 통합 PR에서 진행한다.

- [ ] `zero1_dedoc`을 정식 선택지로 추가하고 기존 bounded NDJSON worker 경계·경로 제한·timeout을 재사용한다. 공통 worker 코드를 복제하지 않는다.
- [ ] `kordoc` 이름은 호환 별칭으로 제공하되 결과 provenance에는 **실제 Zero1 버전과 SHA**를 기록한다. 옛 Kordoc 4.16.1 실행으로 오해시키지 않는다.
- [ ] PDF/Office `auto` 변경은 별도 승격 PR로 남긴다. 의미 있는 텍스트 없는 OCR 필요 출력, 잘림 경고, 미지원 형식이 downstream에서 정상 내용으로 승격되지 않도록 기존 review 경로에 전달한다.

**검증:** adapter/selection contract tests와 기존 이름 호환성. **의존성:** 도입할 각 트랙의 게이트 통과와 검증된 fork commit 확정.

### I2. 02ontology preview·stage·일반 추출 연결

**별도 저장소 작업, 범위 M:** `src/onto_kernel/bridge/document_stage.py`, `document_parse_preview.py`, `general_document_extractor.py`, `tests/test_document_stage.py`, `tests/test_general_document_extractor.py`.

- [ ] 세 진입점이 I1의 canonical parser 선택을 일관되게 사용한다. 일반 추출의 허용 집합에도 `zero1_dedoc`이 들어간다.
- [ ] CLI/preview/stage에서 동일 형식·옵션의 실제 parser provenance와 품질 경고가 유지된다. 기존 자동 라우팅 결과를 회귀 단언한다.
- [ ] PPTX 지원은 Zero1의 X1/X2를 포함한 고정 버전을 쓸 때만 활성화한다. 스캔은 O3의 모델 상태를 확인한다.

**검증:** 일반 추출·preview·stage의 지원/미지원/timeout/빈 내용 경고 전파. **의존성:** I1. I1/I2를 함께 통과시킨 뒤 통합 PR을 병합한다.

### I3. 02ontology 평가 이미지·버전 고정

**별도 저장소 작업, 범위 S/M:** `deploy/zero1-dedoc/Dockerfile`(신규), 운영 가이드, 이미지 smoke script.

- [ ] 검증된 commit에서 빌드한 tarball SHA/패키지 무결성과 Node 이미지 digest를 고정한다. runtime `npx`나 moving `main` 설치를 사용하지 않는다.
- [ ] 모델 캐시·언어·model hash를 패키지 버전과 함께 기록하고, secret 없는 격리 parser 실행 경계를 재사용한다.
- [ ] WSL Docker에서 CLI/worker smoke와 오프라인 OCR을 실행해 연결 가능한 이미지를 산출한다. 운영 서비스 교체는 해당 배포 범위에서 검토한다.

**검증:** Node 20 이미지의 parser identity, SHA, NDJSON ready/response, 제한 경로·누락 모델·timeout 시나리오. **의존성:** I2.

## 6. 체크포인트와 완료 조건

권장 순서: **G0 → U1/U2 → P1 → E1/D1/H1 → T1 → X1/X2 → O1/O2/O3 → I1/I2/I3**. P1 진단에서 발견된 근거가 T1 설계를 결정한다. Excel 보존 테스트는 후속 포맷 변경 전에 확정한다.

1. **upstream 채택:** fork 정체성/라이선스 유지, 신규 upstream 테스트 통과, 고정 Office/PDF·ODL200 후퇴 없음.
2. **현재 결함 해결:** DOCX 수식 위치, 보도자료 제목 위계, BMF 전체 11쪽 gold 셀 통과. 현재 Excel 코드·숫자 보존 유지.
3. **확장 포맷:** PPTX 지원 범위의 정답 통과와 미지원 경고, de/en OCR holdout 및 오프라인 캐시 게이트 통과.
4. **02ontology 연결:** 고정 버전의 `zero1_dedoc` 명시 경로와 `kordoc` 별칭·provenance 확인. 기본값 승격은 문서 유형별 결과를 검토하는 독립 결정.

각 구현 PR은 관련 테스트 → typecheck/build → 변경 영역의 고정 코퍼스 순서로 검증한다. PDF 동작 변경과 upstream 파서 반영에는 고정 ODL200 문서별 NID/TEDS/MHS를 추가한다. fixture를 파서 출력으로 재생성해 실패를 없애지 않는다. HWP 전용 코퍼스 게이트는 이번 범위에서 실행하지 않으며 그 상태를 결과에 명시한다. npm 게시·GitHub 릴리스는 별도 배포 요청 때 수행한다.

## 7. 읽어 확인한 외부 소스

| 소스 | 고정 코드 | 채택 근거 |
| --- | --- | --- |
| Kordoc | [v4.16.3 changelog](https://github.com/chrisryugj/kordoc/blob/bb71f7fb0bf51dd456d27505a8c04772df182144/CHANGELOG.md) | 이번에 fetch/clone한 실제 업데이트 범위 |
| MarkItDown 0.1.8 | [DOCX pre_process](https://github.com/microsoft/markitdown/blob/b8f79c57ebc0044be41323d89b2a45d3fda8460e/packages/markitdown/src/markitdown/converter_utils/docx/pre_process.py) | OMML 노드를 같은 XML 위치에서 치환 |
| MarkItDown 0.1.8 | [PPTX converter](https://github.com/microsoft/markitdown/blob/b8f79c57ebc0044be41323d89b2a45d3fda8460e/packages/markitdown/src/markitdown/converters/_pptx_converter.py) | slide별 제목·도형·표·notes; 그룹 좌표 순회 참고 |
| MarkItDown 0.1.8 | [XLSX converter](https://github.com/microsoft/markitdown/blob/b8f79c57ebc0044be41323d89b2a45d3fda8460e/packages/markitdown/src/markitdown/converters/_xlsx_converter.py) | pandas `read_excel`/`to_html` 경로 확인. Zero1의 값 보존을 대체하지 않음 |
| OpenDataLoader 2.5.11 | [TableBorderProcessor](https://github.com/opendataloader-project/opendataloader-pdf/blob/721d955c79b531ba2a3b6beb32f2bb7e7480f42c/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/processors/TableBorderProcessor.java) | 내용의 table/cell 소속과 `TableStructureNormalizer` 흐름 |
| OpenDataLoader 2.5.11 | [HeadingProcessor](https://github.com/opendataloader-project/opendataloader-pdf/blob/721d955c79b531ba2a3b6beb32f2bb7e7480f42c/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/processors/HeadingProcessor.java), [LevelProcessor](https://github.com/opendataloader-project/opendataloader-pdf/blob/721d955c79b531ba2a3b6beb32f2bb7e7480f42c/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/processors/LevelProcessor.java) | 후보 통계·문서 제목 역할과 구조 레벨의 분리 |
| Docling 2.119.0 | [RapidOCR stage](https://github.com/docling-project/docling/blob/632f00c1a81c8a32aa55e8519c60a685c99dba10/docling/models/stages/ocr/rapid_ocr_model.py) | 언어와 backend에 맞는 model spec·artifact 선택 |
| RapidOCR 3.9.2 | [config](https://github.com/RapidAI/RapidOCR/blob/095232a4c94f7f0e6600ba5bba1177010ad696d4/python/rapidocr/config.yaml), [artifact download](https://github.com/RapidAI/RapidOCR/blob/095232a4c94f7f0e6600ba5bba1177010ad696d4/python/rapidocr/utils/download_file.py) | 모델·전처리·캐시 계약의 독립 비교 |
| 라이선스 | [MarkItDown MIT](https://github.com/microsoft/markitdown/blob/b8f79c57ebc0044be41323d89b2a45d3fda8460e/LICENSE), [ODL Apache-2.0](https://github.com/opendataloader-project/opendataloader-pdf/blob/721d955c79b531ba2a3b6beb32f2bb7e7480f42c/LICENSE), [ODL dependencies](https://github.com/opendataloader-project/opendataloader-pdf/blob/721d955c79b531ba2a3b6beb32f2bb7e7480f42c/THIRD_PARTY/THIRD_PARTY_LICENSES.md), [Docling MIT](https://github.com/docling-project/docling/blob/632f00c1a81c8a32aa55e8519c60a685c99dba10/LICENSE), [RapidOCR Apache-2.0](https://github.com/RapidAI/RapidOCR/blob/095232a4c94f7f0e6600ba5bba1177010ad696d4/LICENSE) | 실제 이식 파일과 모델의 고지를 별도로 보존 |
