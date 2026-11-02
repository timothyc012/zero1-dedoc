# OCR 본문 근거 기반 열 복원 검증

검증일: 2026-10-26. Baseline: `8c8eee21727f6139f1b803b78ae565356a244956`.

## 변경과 적용 범위

무괘선 표의 머리행 box 하나에 두 열이 결합되면 기존 열 수와 칸 배정이 그 결합을 유지하였다. 기존 CTC 위치와 원본 pixel의 빈 구간을 내부 근거로 보존하고, 같은 위치를 본문 숫자 두 행 이상이 지지할 때 해당 열을 둘로 분리한다. 분리 경계는 칸 배정에도 적용한다. 특정 머리글이나 영수증의 열 수는 규칙으로 사용하지 않는다.

위치 근거는 문자열과 함께 private WeakMap에 보존한다. OCR 좌표 변환 때 함께 옮기고, 후처리로 문자열이 바뀌면 사용하지 않는다. 공개 `ocrLines`, IR schema, API option, model, dependency는 추가하거나 변경하지 않았다. 분리 근거가 없는 글은 기존 배정과 병합 칸을 유지한다.

## 실제 OCR 비교

원본은 [issue #141에서 사용한 영수증](https://gist.githubusercontent.com/chrisryugj/e0b2544e372547371009839c853ec227/raw/receipt.png)이다. SHA-256은 `f2a268d28265cfe3397731fe63807ed3f6b04fd5cf225c41c1b27f2d9dec7c09`, 크기는 796×1238이다. 동일한 model과 option으로 baseline과 변경본을 각각 실행하였다.

| 입력 | Baseline 열 수 | 변경본 열 수 | 공개 OCR 글·좌표 |
|---|---:|---:|---|
| 원본 PNG | 3 | 4 | 동일 |
| 폭 85% PNG | 3 | 4 | 동일 |
| 폭 125% PNG | 3 | 4 | 동일 |
| JPEG quality 70 | 3 | 4 | 동일 |
| +1° 회전 PNG | 3 | 4 | 동일 |
| −1° 회전 PNG | 3 | 4 | 동일 |
| 같은 원본의 scan PDF | 3 | 4 | 동일 |
| 별도로 만든 재고·예산 표 2종 | 각각 4 | 각각 4 | 동일, table IR도 동일 |

영수증의 두 값 행은 `1,300 | 2 | 2,600`, `2,500 | 10 | 25,000`으로 복원되었다. 각 barcode와 금액의 대응을 유지하였다. 머리글의 `단 가`는 원래 OCR 결과를 유지한다. +1° 입력에서는 본문 숫자가 독립 box 두 개로 읽히면서 box 여백이 겹치는 경우도 확인하였다.

위 결과의 양성 문서는 한 개이다. 그 변형 여섯 개와 같은 원본의 PDF를 독립 문서 일곱 개로 집계하지 않는다. 별도 표 두 개는 기존 출력 보존을 확인하는 반례이며, 전체 corpus의 품질 개선 수치를 주장하지 않는다.

## 재현

Node `v24.4.1`, macOS arm64, sharp `0.35.5`, onnxruntime-node `1.29.0`에서 기본 PP-OCRv5 mobile det·Korean rec를 사용하였다. model은 `src/ocr/models.ts`의 SHA-256을 확인하였다. 추가 model이나 추가 inference는 사용하지 않는다.

기존 model cache를 준비한 뒤 아래 명령으로 원본을 재현할 수 있다. model을 처음 받는 경우 프로젝트의 `kordoc models` 경로를 사용한다.

```bash
curl -L --fail 'https://gist.githubusercontent.com/chrisryugj/e0b2544e372547371009839c853ec227/raw/receipt.png' -o /tmp/kordoc-141-receipt.png
shasum -a 256 /tmp/kordoc-141-receipt.png
npm run build
node --input-type=module <<'JS'
import { parse } from './dist/index.js';
const result = await parse('/tmp/kordoc-141-receipt.png', { ocrLines: 'all' });
if (!result.success) throw new Error(JSON.stringify(result.error));
console.log(JSON.stringify(result.blocks.filter(b => b.table).map(b => b.table), null, 2));
JS
```

단위 test는 native model 없이도 실행된다.

```bash
node --import tsx --test tests/ocr-column-recovery.test.ts
npm run typecheck
npm test
npm run build
node bench/gate-if-corpus.mjs
```

## 회귀 검증과 한계

- 새 test 16개: raster·CTC 대응, 두 행 지지, 한 행·불일치 위치·근거 없음의 fallback, 독립 숫자 box와 겹치는 여백, 숫자 내부 공백·소수점·부호, 병합 칸 아래 continuation의 최종 Markdown 보존, 표 밖 원문 보존, `tables:false`, 좌표 변환과 문자열 변경 시 무효화.
- 전체 test: 4,495 pass, 0 fail, 15 skip / 총 4,510개. 기존 native test 일부는 task 전용 model cache로 활성화하였다. model 부재 상태의 baseline skip 수와 직접 비교하지 않는다.
- `npm run typecheck`, `npm run build`, `git diff --check`: 통과.
- corpus gate: HWPX 0/170, PDF 0/25로 skip. ODL 200문서·한국 공문서 PDF corpus·HWP 쌍별 benchmark는 미측정이다. GT·평가기·제외 모수는 변경하지 않았다.
- 흰 글씨·반전 배경, 회전된 개별 글 box, 여러 경계가 동시에 가능한 머리글은 이번 복원 대상에서 보수적으로 제외한다. 임의의 숫자 열 구조까지 복원할 수 있는 일반 table recognizer의 범위는 다루지 않았다.

## 자원 사용 비교

한 번 warm-up 후 원본 PNG를 7회 처리하였다. Task의 test·build를 함께 실행하지 않았으나, host의 다른 build·test process가 CPU를 사용해 편차가 컸다. 별도 process 측정의 중앙값은 baseline 455·713 ms, 변경본 2,381 ms였다. 같은 process에서 baseline과 변경본의 순서를 번갈아 실행한 7쌍은 중앙값 1,000 → 672 ms였고, 각각의 범위는 483–1,455 ms, 565–1,069 ms였다. 서로 일관되지 않으므로 성능 개선이나 성능 회귀 부재를 확정하지 않는다.

별도 process의 peak RSS는 baseline 648,080 KiB, 변경본 564,064 KiB였다. 소규모 단일 문서 측정이므로 메모리 개선의 근거로 사용하지 않는다. 안정적인 성능 비교에는 다른 CPU 작업이 없는 기기에서 corpus 측정이 필요하다.

## 구현 판단

내부 위치 근거와 기존 열의 국소 분리를 선택하였다. global header 추론을 교체하지 않아 다른 열의 배정을 유지하며, 별도 inference와 공개 metadata를 추가하지 않는다. 반대로 기존 표 후보가 잘못 잡힌 경우 반복된 숫자 공백을 새 경계로 오판할 가능성은 남는다. 두 행의 독립 근거와 머리행의 실제 빈 구간을 함께 요구해 범위를 제한하였다.

원본·model·큰 JSON 결과는 repository에 포함하지 않는다. 회귀 test는 직접 만든 geometry와 raster를 사용한다. 초기 검증과 local 준비 단계에서는 원격 push·PR 생성·main 반영·배포를 수행하지 않았다.

## 독립 review 후 보완

`d1fafde`에 대해 별도 reviewer가 read-only로 전체 변경을 확인하였다. Minor와 판단 유보 항목은 없었고, 다음 두 finding을 재현해 한 fix pass로 보완하였다.

- Critical: 첫 열 이외의 병합 칸 아래 continuation이 가려진 칸으로 이동해 최종 Markdown에서 빠졌다. 병합 행을 건너뛰는 기존 guard를 모든 열로 확장하였다. 재현 test에서 `AB`가 0회 출력되던 실패를 확인한 뒤 정확히 1회 출력되는 것을 확인하였다.
- Important: `1 234.56` 같은 값이 새 열의 근거가 되거나, 다른 행이 경계를 승인한 뒤 `385 426`을 실제로 분리하였다. 숫자 grouping 판정을 소수점·부호까지 확장하고 경계 추론과 실제 배정에 함께 적용하였다. 이미 승인된 경계를 가로지르는 공백 없는 숫자도 임의로 분리하지 않는다. 결합 box와 독립 box의 반례를 포함해 RED→GREEN으로 확인하였다.

보완 후 focused test 16개를 통과하였다. 최종 commit에 대한 별도 재심사는 수행하지 않았으며, finding의 해결은 실패 재현과 전체 회귀 검증으로 확인하였다.

## PR 제출 전 최신 main 확인

사용자의 후속 PR 생성 지시에 따라 upstream `main`의 `4f3460354f9ddee72e659b4e1a189cd621e1ece9`를 feature branch에 통합하였다. 충돌은 없었다. 새 CHANGELOG 항목은 이미 배포된 4.24.6 이력에 포함되지 않도록 `Unreleased`에 유지하였다.

통합 후 전체 test는 4,498 pass, 0 fail, 15 skip / 총 4,513개이며 typecheck·build를 통과하였다. Native 입력 8종과 build된 scan PDF에서도 위 표의 구조·값 배정·공개 OCR 보존 결과를 다시 확인하였다. 위 원본 비교의 baseline과 GT·평가기·제외 모수는 유지하였다. PR은 fork의 feature branch에서 upstream `main`을 대상으로 제출하며, main 반영·배포는 이번 요청의 범위에 포함하지 않는다.
