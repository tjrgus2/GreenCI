# 🌱 GreenCI

**이 Pull Request가 CI를 얼마나 느리게, 비싸게 만들었는가 — 어디서, 얼마나 확실하게?**

GreenCI는 모든 Pull Request에서 그 질문에 답하는 GitHub Action입니다. GitHub이 이미
가지고 있는 워크플로 실행 메타데이터를 읽어, 통계적으로 견고한 기준선 대비 대기 시간·러너
소비량·비용·모델 기반 탄소의 변화를 보고하고, **실제로 고쳐야 할 Job**을 알려줍니다.

서버 없음, 데이터베이스 없음, 계정 없음, 텔레메트리 없음, 소스 코드 업로드 없음, LLM 없음.
분석기는 Pull Request 코드를 체크아웃하거나 실행하지 않습니다.

[English](README.md) · [한국어](README.ko.md)

---

## 왜 GreenCI인가

CI는 머지 한 번에 조금씩 느려집니다. 누군가 알아차릴 때쯤엔 어떤 변경이 원인이었는지
아무도 모릅니다. 기존 도구는 직전 실행 하나와 비교하거나(노이즈가 너무 커서 개발자가 결국
무시하게 됩니다), 아무도 열지 않는 대시보드 뒤에 답을 숨깁니다.

GreenCI는 네 가지에서 다른 선택을 합니다.

- **거짓 경보를 내지 않습니다.** 회귀 판정에는 백분율 변화 **그리고** 견고한 z-점수
  **그리고** 충분한 표본 **그리고** 비교 가능한 워크플로 구조가 모두 필요합니다. 기준선에
  느린 이상치 하나가 있다고 경보가 울리지 않습니다.
- **기다림과 지출을 구분합니다.** 머지를 지연시키는 Job과 러너 시간을 많이 쓰는 Job은
  보통 다른 Job입니다. GreenCI는 `needs` 그래프를 재구성해 둘을 따로 보고하고, 각각을
  개선하면 무엇을 얻는지 추정합니다.
- **불확실성을 숨기지 않고 보여줍니다.** 탄소는 데이터 품질 등급, 가정 목록, 재현 가능한
  시드가 함께 붙은 p05–p95 구간입니다. 확신에 찬 숫자 하나가 아닙니다.
- **방해하지 않습니다.** 기본 설치는 정책 규칙이 하나도 없으므로 Pull Request를 막을 수
  없습니다. 코멘트 권한이 없으면 실패하는 대신 Job Summary로 대체합니다.

## Pull Request 코멘트 예시

```md
# 🌱 GreenCI 리포트

> ⚠ `main` 브랜치의 성공한 실행 5건 중앙값 대비 러너 시간이 88.4% 증가했습니다.

| 지표              |   기준 중앙값 |          현재 |     변화 |
| ----------------- | ------------: | ------------: | -------: |
| ⏱ 실제 경과 시간  |           23s |         1m 3s | ▲ 169.6% |
| 🖥 러너 시간       |           43s |        1m 21s |  ▲ 88.4% |
| 💵 정가 환산 비용 |       $0.0240 |       $0.0320 |  ▲ 33.3% |
| 🌱 탄소, p50      | 0.0676 gCO₂eq | 0.1269 gCO₂eq |  ▲ 87.7% |

**신뢰도:** 높음 · **워크플로 구조 일치도:** 100.0% · **기준 표본 수:** 5 · **데이터 품질:** 높음

## 주요 회귀 항목

| Job / Step              | 기준 중앙값 |  현재 |     변화 | 수정 z-점수 |
| ----------------------- | ----------: | ----: | -------: | ----------: |
| `Test / Simulate tests` |         20s | 1m 0s | ▲ 200.0% |           — |
| `Test`                  |         23s | 1m 3s | ▲ 173.9% |       53.96 |

**Critical Path:** `Build` → `Unit test` → `Integration test` · 2m 34s · 96.3%

**What if? (반사실 추정)**

- `Integration test` −50% → Critical Path ▼ 23.7% · 러너 시간 ▼ 13.0%
- `Security` −50% → Critical Path ▬ 0.0% · 러너 시간 ▼ 22.5%

## 개선 제안

- 🟠 `GCI-CACHE-001` **의존성 설치가 러너 시간을 지배합니다** (신뢰도 0.85)
- 🔵 `GCI-MATRIX-001` **매트릭스 확장이 러너 소비를 지배합니다** (신뢰도 0.70)

⚠ **정책:** 정책 경고
```

실제 라이브 실행 결과: [최적화 전](docs/demo.md#before--the-inefficient-pipeline),
[최적화 후](docs/demo.md#after--the-optimized-pipeline).

## 빠른 시작

Job 하나만 추가하고, 분석하려는 Job을 모두 `needs`에 나열하세요.

```yaml
jobs:
  build: # 기존 Job
  test:

  greenci:
    name: GreenCI
    if: always()
    needs: [build, test]
    runs-on: ubuntu-latest

    permissions:
      actions: read
      contents: read
      pull-requests: write

    steps:
      - uses: tjrgus2/GreenCI@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

설치는 이것으로 끝입니다. 첫 리포트를 받기 위해 설정할 것이 없습니다.

**버전 고정.** `@v1`은 최신 v1 릴리스를 따라가며, 보호된 릴리스 워크플로만 이 태그를
갱신합니다. 움직이는 태그를 신뢰하고 싶지 않다면 커밋을 고정하세요.

```yaml
- uses: tjrgus2/GreenCI@d15bc009041ac36bf77ef1699938cdeb5938edb2 # v1.0.0
```

**`if: always()`** 는 중요합니다. 이것이 없으면 Job이 실패했을 때 — 즉 리포트가 가장
필요한 순간에 — GreenCI가 건너뛰어집니다.

**`pull-requests: write`** 는 선택입니다. 이 권한이 없으면(GitHub이 읽기 전용 토큰을
주는 fork Pull Request 포함) GreenCI는 경고를 기록하고 Job Summary만 작성합니다.

## 무엇을 얻는가

| 표면                  | 내용                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull Request 코멘트   | 개선/회귀 여부, 기준 중앙값 대비 핵심 지표 4개, 주요 회귀 항목, Critical Path, 반사실 추정, 개선 제안, 정책 결과. 워크플로당 코멘트 1개를 제자리에서 갱신합니다. |
| Job Summary           | 위 내용 전부 + Job/Step 표, 기준선 표본 전체, Job 단위 과금 반올림, 탄소 백분위, 테스트 결과, 진단, 가정 목록, 모든 경고.                                        |
| `greenci-report.json` | [`schemas/report-v1.schema.json`](schemas/report-v1.schema.json)으로 검증되는 완전한 기계 판독용 리포트.                                                         |
| Annotation            | 실패 로그 파싱을 켠 경우, 신뢰도가 충분한 진단에 대한 파일·줄 단위 주석.                                                                                         |
| Action 출력           | `report-path`, `runner-seconds`, `carbon-p50-grams`, `carbon-p95-grams`, `list-price-usd`, `policy-conclusion`, `critical-path-seconds`, `recommendation-count`. |

## 기능

- **실행 시간 분석** — 실제 경과 시간, 총 러너 시간, 큐 대기 시간, 유휴 구간, 최대·평균
  동시 실행 수, Job/Step 단위 타이밍.
- **견고한 회귀 탐지** — 성공한 기준 브랜치 실행들에 대한 중앙값·MAD와 수정 z-점수,
  IQR 및 백분율 전용 대체 경로.
- **워크플로 구조 지문** — 통계를 계산하기 전에 구조가 호환되지 않는 과거 실행을 제외합니다.
- **DAG Critical Path** — `jobs.<id>.needs`에서 재구성하며, 매트릭스 확장, 매핑 신뢰도
  등급, 그리고 그렇게 명시되는 구간 중첩 대체 분석을 제공합니다.
- **반사실 What-if** — Critical Path 위의 Job과 병렬 소비 지점을 각각 50% 빠르게 하면
  무엇을 얻는지.
- **비용** — 버전 관리되는 정가에 대한 Job 단위 분 반올림. 공개 저장소 과금액과 정가
  환산액을 분리해 표시합니다.
- **탄소** — 결정론적 2000 표본 Monte Carlo로 p05/p50/p95와 데이터 품질 등급 산출.
- **개선 제안** — 결정론적 규칙 8개. 각각 규칙 ID, 근거, 신뢰도, 상한이 명시된 영향 추정을
  가집니다.
- **정책 엔진** — 8개 지표에 대한 `report`/`warn`/`fail`. 신뢰도가 부족한 측정값으로는
  실패시키지 않습니다.
- **JUnit 분석** — 총계, 가장 느린 Suite·케이스, 실패 케이스. 강화된 메모리 내 아카이브
  리더로 읽습니다.
- **실패 진단** — 선택적으로 켜는 제한된 자격 증명 마스킹 실패 로그 파싱(10개 툴체인)과
  Annotation.
- **영어/한국어** 리포트 렌더링.
- **오프라인 재현** — 네트워크 없이 정제된 fixture로 어떤 분석이든 재현합니다.

## 동작 방식

```text
build / test / lint Job 완료
        ↓
if: always() 로 GreenCI Job 실행
        ↓
실행·Job·Step, 워크플로 정의, .greenci.yml,
성공한 기준 브랜치 이력을 읽음 — GitHub API만 사용
        ↓
자기 자신 제외 · needs 그래프 재구성 · 구조 지문
        ↓
견고한 통계 · 비용 · 탄소 · Critical Path · 반사실
        ↓
개선 제안 · 정책
        ↓
PR 코멘트 1개 · Job Summary 1개 · JSON 아티팩트 1개
```

API 경계 이후의 모든 것은 입력의 순수 함수입니다. [`packages/core`](packages/core)는
네트워크·파일시스템·시계·시드 없는 난수를 사용하지 않으므로, 같은 실행은 항상 같은 리포트를
만듭니다.

## 비용

GreenCI는 두 가지를 보고하고 세 번째는 보고하지 않습니다.

- **정가 환산 총액** — 러너 사용량 × 공개 분당 요금. GitHub이 과금하는 방식대로 각 Job의
  1분 미만 시간을 **합산 전에** 올림합니다.
- **추정 과금액** — 위 값에 표준 러너를 무료로 만드는 공개 저장소 정책을 적용한 값.
- **실제 청구 금액** — **계산하지 않습니다.** 플랜 포함 분과 조직 과금 계약은 Action이 볼
  수 없으므로, GreenCI는 여러분의 청구서를 안다고 주장하지 않습니다.

알 수 없는 러너 클래스에는 유추로 가격을 매기지 않습니다. 총계에서 제외하고 경고로 알립니다.

## 탄소

GreenCI는 **모델 기반 운영 배출량**을 보고합니다. 전력을 측정하지 않고, 하드웨어 카운터를
읽지 않으며, SCI 적합성을 주장하지 않습니다.

GitHub은 CPU 사용률, 호스트 하드웨어, 호스트 공유 여부, 순간 전력, 데이터센터 지역, 시설
PUE를 공개하지 않습니다. 따라서 이 값들은 모두 삼각 분포에서 2000회 결정론적 Monte Carlo로
샘플링되며, 결과는 가중 데이터 품질 등급·등급을 낮춘 이유·시드와 함께 p05/p50/p95로
발표됩니다.

전체 유도 과정, 데이터셋 출처, 그리고 **무엇이 측정값이고 무엇이 추정·가정값인지**의 정확한
분류: [docs/methodology.md](docs/methodology.md).

## 보안과 프라이버시

- GreenCI 서버·데이터베이스·계정이 없습니다. 유일한 외부 통신 대상은 분석 대상 저장소의
  GitHub API입니다.
- 텔레메트리, 애널리틱스, LLM 호출, 소스 코드 업로드가 없습니다.
- 분석기는 Pull Request 코드를 체크아웃하지 않고, 저장소가 제어하는 문자열로 셸을 실행하지
  않으며, `eval`을 쓰지 않습니다.
- `.greenci.yml`, 워크플로 정의, 아티팩트, 로그는 모두 신뢰할 수 없는 데이터로 취급합니다.
  크기 제한, alias 비활성 YAML, 스키마 검증, 이스케이프를 적용합니다.
- 아티팩트는 GreenCI 자체 메모리 내 ZIP 리더로 읽으며, zip slip·절대 경로·심볼릭 링크·
  과대 멤버·압축 폭탄을 **메모리 할당 전에** 거부합니다.
- 실패 로그 파싱은 **기본 비활성**입니다. 켜더라도 크기 제한, 자격 증명 마스킹, 메모리
  내 처리, 저장하지 않음이 적용됩니다.
- 최소 권한: `actions: read`, `contents: read`, 선택적으로 `pull-requests: write`.
  그 외에는 절대 요구하지 않습니다.

위협 모델과 전체 제한값 표: [docs/security-model.md](docs/security-model.md).
취약점 신고: [SECURITY.md](SECURITY.md).

## 설정

`.greenci.yml`은 선택 사항이며, 분석 대상 리비전에서 API로 읽고
[`schemas/config.schema.json`](schemas/config.schema.json)으로 검증합니다. 알 수 없는
키는 거부되며, GreenCI가 **의도했을 키를 제안합니다**.

```yaml
version: 1
locale: ko

carbon:
  region: KR

policy:
  rules:
    - metric: runner-time-regression-percent
      operator: greater-than
      value: 25
      mode: warn
```

전체 예시(최소·권장·엄격한 CI 예산·고급 분석)는 [README.md](README.md#configuration)에
있으며, 문서에 실린 모든 예시는 테스트 스위트가 파싱하므로 스키마와 어긋날 수 없습니다.

## CLI

네트워크 없이 어떤 분석이든 오프라인으로 재현합니다.

```bash
pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/demo/inefficient.json
```

커밋된 최적화 전후 시연은 한 명령으로 실행됩니다.

```bash
pnpm demo
```

## 한계

설치 전에 알아두면 좋은 점들:

- **Job을 `needs`에 나열해야 합니다.** GreenCI는 자신이 속한 실행을 분석하므로, 의존하지
  않는 Job을 기다릴 수 없습니다.
- **기준선은 Actions API에서 옵니다.** 새 저장소, 재구성된 워크플로, 조용한 브랜치에서는
  정당하게 "판단 보류"가 나옵니다.
- **탄소는 측정값이 아니라 모델 추정값**이며, 지역을 설정하지 않으면 알 수 없습니다.
- **비용은 정가 환산액**이며 여러분의 청구서가 아닙니다.
- **매트릭스 매핑은 휴리스틱입니다.** `Build (fast)`처럼 이름에 괄호가 있는 Job은 매트릭스
  변형으로 간주됩니다. 매핑이 모호하면 조용히 추측하지 않고 DAG 신뢰도를 낮춥니다.
- **월간 추정은 없습니다.** 이유와 대신 제공하는 것은
  [ADR 0007](docs/adr/0007-no-savings-projection.md)에 있습니다.
- **자체 호스팅 러너**는 시간은 분석하지만 가격·전력 모델이 없어 비용과 탄소에서 제외되며,
  그 사실을 리포트에 명시합니다.

## 기여

버그 리포트, 데이터셋 정정, 새로운 개선 제안 규칙이나 로그 파서 모두 환영합니다.
[CONTRIBUTING.md](CONTRIBUTING.md)에서 시작하세요. 로컬 검증 전체는 한 명령입니다.

```bash
pnpm verify:all
```

## 라이선스

[Apache-2.0](LICENSE).
