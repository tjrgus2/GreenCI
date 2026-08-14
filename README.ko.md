<div align="center">

# 🌱 GreenCI

**이 Pull Request가 CI에 무슨 일을 했는지, 당연해지기 전에 알아내세요.**

<p>
  <a href="https://github.com/tjrgus2/GreenCI/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/tjrgus2/GreenCI/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/tjrgus2/GreenCI/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/tjrgus2/GreenCI/actions/workflows/codeql.yml/badge.svg"></a>
  <a href="https://github.com/tjrgus2/GreenCI/releases"><img alt="Release" src="https://img.shields.io/github/v/release/tjrgus2/GreenCI?include_prereleases&color=2ea043"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
</p>

<p>
  <a href="README.md">English</a> ·
  <a href="README.ko.md"><b>한국어</b></a> ·
  <a href="docs/methodology.md">추정 방식</a> ·
  <a href="docs/security-model.md">보안</a>
</p>

</div>

---

CI는 머지 한 번에 조금씩 느려집니다. 견디기 힘들어질 때쯤엔 어떤 변경이 원인이었는지 아무도
기억하지 못합니다.

GreenCI는 그걸 Pull Request 단계에서 잡아내는 GitHub Action입니다. GitHub이 이미 알고 있는
실행 정보만 읽고 — 코드 체크아웃도, 에이전트도, 외부 서비스도 없이 — 여러분 저장소의 과거
이력으로 만든 견고한 기준선과 비교해서, **실제로 고쳐야 할 Job**을 알려줍니다.

그 Job이 러너 시간과 돈과 모델 기반 탄소를 얼마나 쓰는지도 함께 보고합니다. 그리고 확실하지
않을 때는, 그럴듯한 숫자를 고르는 대신 확실하지 않다고 말합니다.

## 어떻게 보이는가

실제 리포트이고, GitHub이 Pull Request에 그려주는 그대로입니다.

---

**🌱 GreenCI 리포트**

> ⚠ `main` 브랜치의 성공한 실행 5건 중앙값 대비 러너 시간이 88.4% 증가했습니다.

| 지표              |   기준 중앙값 |          현재 |     변화 |
| ----------------- | ------------: | ------------: | -------: |
| ⏱ 실제 경과 시간  |           23s |         1m 3s | ▲ 169.6% |
| 🖥 러너 시간       |           43s |        1m 21s |  ▲ 88.4% |
| 💵 정가 환산 비용 |       $0.0240 |       $0.0320 |  ▲ 33.3% |
| 🌱 탄소, p50      | 0.0676 gCO₂eq | 0.1269 gCO₂eq |  ▲ 87.7% |

**신뢰도:** 높음 · **워크플로 구조 일치도:** 100.0% · **기준 표본 수:** 5 · **데이터 품질:** 높음

**주요 회귀 항목**

| Job / Step              | 기준 중앙값 |  현재 |     변화 | 수정 z-점수 |
| ----------------------- | ----------: | ----: | -------: | ----------: |
| `Test / Simulate tests` |         20s | 1m 0s | ▲ 200.0% |           — |
| `Test`                  |         23s | 1m 3s | ▲ 173.9% |       53.96 |

**Critical Path:** `Build` → `Unit test` → `Integration test` · 2m 34s · 96.3%

**What if? (반사실 추정)**

- `Integration test` −50% → Critical Path ▼ 23.7% · 러너 시간 ▼ 13.0%
- `Security` −50% → Critical Path ▬ 0.0% · 러너 시간 ▼ 22.5%

**개선 제안**

- 🟠 `GCI-CACHE-001` **의존성 설치가 러너 시간을 대부분 차지합니다** (신뢰도 0.85)
- 🔵 `GCI-MATRIX-001` **Matrix 확장이 러너 사용량을 대부분 차지합니다** (신뢰도 0.70)

⚠ **정책:** 정책 경고

---

마지막 `What if?` 두 줄을 보세요. 이 대비가 핵심입니다. `Integration test`를 빠르게 하면
대기 시간은 줄지만 러너 시간은 얼마 안 아낍니다. `Security`를 빠르게 하면 러너 시간은 가장
많이 아끼지만 아무의 대기 시간도 줄지 않습니다. 대부분의 도구는 숫자 하나만 보여주고, 지금
어느 쪽 상황인지는 여러분이 알아서 추측하게 만듭니다.

**실제로 돌아가는 걸 보세요:** [느려진 PR](https://github.com/tjrgus2/greenci-demo/pull/1)
· [늦게 실패한 PR](https://github.com/tjrgus2/greenci-demo/pull/2) · [최적화된 PR](https://github.com/tjrgus2/greenci-demo/pull/3)
· [GreenCI가 자기 자신을 분석한 결과](https://github.com/tjrgus2/GreenCI/actions/workflows/greenci-self.yml)

## 설치

Job 하나만 추가하고, 분석하려는 Job을 `needs`에 나열하세요.

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

설치는 이게 전부입니다. 첫 리포트를 받으려고 설정할 건 없고, 기본 정책도 없으니 Pull
Request를 막지도 않습니다.

알아두면 좋은 세 가지:

- **`if: always()`가 중요합니다.** 이게 없으면 Job이 실패했을 때 — 즉 리포트가 가장 필요한
  순간에 — GreenCI가 건너뛰어집니다.
- **`pull-requests: write`는 선택입니다.** 이 권한이 없으면(GitHub이 읽기 전용 토큰을 주는
  fork PR 포함) 코멘트 대신 Job Summary를 쓰고 경고를 남깁니다.
- **원하면 고정하세요.** `@v1`은 보호된 릴리스 워크플로만 옮길 수 있습니다. 움직이는 태그를
  신뢰하고 싶지 않다면 릴리스가 붙은 커밋을 고정하세요. 릴리스 아티팩트에는 빌드 증명이
  붙어 있으니 무엇을 고정했는지 검증할 수 있습니다.
  ```yaml
  - uses: tjrgus2/GreenCI@7c8f4ac36dda3f2066eb8fea358ac1b4ea25c7f7 # v1.0.0-rc.2
  ```

## 무엇이 다른가

**거짓 경보를 내지 않습니다.** 회귀로 판정하려면 백분율 변화 _그리고_ 견고한 z-점수 _그리고_
충분한 표본 _그리고_ 비교 가능한 워크플로 구조가 모두 있어야 합니다. 이력에 느린 이상치
하나가 있다고 경보가 울리지 않습니다. 직전 실행 하나와 비교하는 도구는 노이즈가 너무 커서
결국 사람들이 무시하게 되는데, 그 실패 모드를 피하려는 설계입니다.

**기다림과 지출을 구분합니다.** 머지를 지연시키는 Job과 러너 시간을 많이 태우는 Job은 보통
다른 Job입니다. GreenCI는 `needs` 그래프를 다시 세워서 둘을 따로 보고하고, 각각을 고치면
무엇을 얻는지 추정합니다.

**불확실성을 숨기지 않습니다.** 탄소는 데이터 품질 등급과 가정 목록, 재현 가능한 시드가 붙은
p05–p95 구간입니다. 측정값인 척하는 확신에 찬 숫자 하나가 아닙니다.

**일부러 심심하게 만들었습니다.** 서버도, 데이터베이스도, 계정도, 텔레메트리도, LLM도, 소스
업로드도 없습니다. 같은 입력이면 항상 같은 출력입니다.

## 무엇을 얻는가

**Pull Request에** — 코멘트 하나. 한 번 만들고 이후엔 같은 코멘트를 갱신합니다. 판정, 기준
중앙값 대비 핵심 지표 4개, 주요 회귀 항목, Critical Path, 반사실 추정, 개선 제안, 정책 결과.

**실행 페이지에** — Job Summary. 위 내용 전부에 Job/Step 표, 기준선 표본 전체, Job 단위 과금
반올림, 탄소 백분위, 테스트 결과, 진단, 모든 가정과 모든 경고가 더해집니다.

**데이터로** — `greenci-report.json`.
[`schemas/report-v1.schema.json`](schemas/report-v1.schema.json)으로 검증되며, 여러분의
Step에서 분기에 쓸 수 있는 Action 출력 8개가 함께 나옵니다.

**Annotation으로** — 실패 로그 파싱을 켜면, 신뢰도가 충분한 진단에 파일·줄 단위 주석이 붙습니다.

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

API 경계 이후는 전부 입력의 순수 함수입니다. [`packages/core`](packages/core)는
네트워크·파일시스템·시계·시드 없는 난수를 건드리지 않습니다. 그래서 같은 실행은 항상 같은
리포트를 만들고, 어떤 분석이든 fixture로 오프라인 재현이 됩니다.

<details>
<summary><b>측정하는 항목 전체</b></summary>

<br>

- **실행 시간** — 실제 경과 시간, 총 러너 시간, 큐 대기 시간, 유휴 구간, 최대·평균 동시 실행
  수, Job/Step 단위 타이밍.
- **회귀 탐지** — 성공한 기준 브랜치 실행에 대한 중앙값·MAD와 수정 z-점수, IQR 및 백분율 전용
  대체 경로.
- **워크플로 구조 지문** — 통계를 계산하기 전에 구조가 호환되지 않는 이력을 버립니다.
- **DAG Critical Path** — `jobs.<id>.needs`에서 재구성. Matrix 확장, 매핑 신뢰도 등급, 그리고
  그렇다고 명시하는 구간 중첩 대체 경로를 갖습니다.
- **반사실 What-if** — Critical Path 위의 Job과 병렬 소비 지점을 각각 50% 빠르게 하면 무엇을
  얻는지.
- **비용** — 버전 관리되는 정가에 대한 Job 단위 분 반올림.
- **탄소** — 결정론적 2000 표본 Monte Carlo로 p05/p50/p95와 데이터 품질 등급 산출.
- **개선 제안** — 결정론적 규칙 8개. 각각 ID, 근거, 신뢰도, 상한이 명시된 영향 추정을 갖습니다.
  모델은 쓰지 않습니다.
- **정책** — 8개 지표에 대한 `report`/`warn`/`fail`. 신뢰가 안 되는 측정값으로는 실패시키지
  않습니다.
- **JUnit 분석** — 총계, 가장 느린 Suite와 케이스, 실패 케이스. 강화된 메모리 내 아카이브
  리더로 읽습니다.
- **실패 진단** — 선택 활성. 크기 제한·자격 증명 마스킹된 실패 로그 파싱(10개 툴체인)과
  파일·줄 Annotation.
- **영어/한국어** — 모든 표시 화면 전체 번역.

| 지표             | 의미                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| 실제 경과 시간   | 마지막 Job 종료 − 첫 Job 시작. 개발자가 실제로 기다린 시간에 가깝습니다.   |
| 러너 시간        | Job 소요 시간의 합. 실제로 소비하고 과금되는 양입니다.                     |
| Critical Path    | `needs`를 지나는 최장 가중 경로. 대기 시간을 줄이는 유일한 방법입니다.     |
| 비임계 소비 지점 | Critical Path 밖의 큰 러너 소비. 줄이면 돈은 아끼지만 시간은 못 아낍니다.  |
| 큐 대기 시간     | Job 생성부터 시작까지. 스케줄링 지연이 코드 문제로 보이지 않게 분리합니다. |
| 최대·평균 동시성 | 워크플로가 빠르면서 동시에 비쌀 수 있는 이유.                              |

</details>

## 그 숫자들에 대해

신뢰를 잃는 가장 쉬운 방법은 근거를 댈 수 없는 걸 말하는 겁니다. 그래서:

**비용.** GreenCI는 **정가 환산 총액**(러너 사용량 × 공개 분당 요금, GitHub이 과금하는
방식대로 각 Job의 1분 미만 시간을 _합산 전에_ 올림)과 표준 러너를 무료로 만드는 공개 저장소
정책을 적용한 **추정 과금액**을 보고합니다. **실제 청구 금액은 보고하지 않습니다.** 플랜 포함
분과 조직 과금 계약은 Action이 볼 수 없으니, 여러분의 청구서를 안다고 주장하지 않습니다. 알 수
없는 러너 클래스에는 유추로 가격을 매기지 않고, 총계에서 제외한 뒤 경고로 알립니다.

**탄소.** **모델 기반 운영 배출량**입니다. 전력을 측정하지 않고, 하드웨어 카운터를 읽지 않고,
SCI 적합성을 주장하지 않습니다. GitHub은 CPU 사용률·호스트 하드웨어·호스트 공유 여부·순간
전력·데이터센터 지역·시설 PUE 중 어느 것도 공개하지 않습니다. 그래서 이 값들은 전부 삼각
분포에서 2000회 결정론적으로 샘플링되고, 결과는 데이터 품질 등급과 등급을 낮춘 이유, 시드와
함께 p05/p50/p95로 발표됩니다.

**개선 제안.** 임계값이 고정된 손으로 쓴 규칙 8개입니다. 신뢰도 숫자는 학습된 확률이 아니라
규칙마다 사람이 정한 값이고, 모든 제안은 그 판단의 근거가 된 관측값을 함께 출력하므로 계산을
직접 검산할 수 있습니다.

전체 유도 과정과 **무엇이 측정값이고 무엇이 추정·가정값인지**의 정확한 분류:
[docs/methodology.md](docs/methodology.md).

## 보안

- GreenCI 서버·데이터베이스·계정이 없습니다. 유일한 외부 통신 대상은 분석 대상 저장소의
  GitHub API입니다.
- 텔레메트리, 애널리틱스, LLM 호출, 소스 코드 업로드가 없습니다.
- 분석기는 Pull Request 코드를 체크아웃하거나 실행하지 않고, 저장소가 제어하는 문자열로 셸을
  실행하지 않으며, `eval`을 쓰지 않습니다.
- `.greenci.yml`, 워크플로 정의, 아티팩트, 로그는 모두 신뢰할 수 없는 입력으로 취급합니다.
  크기 제한, alias 비활성 YAML, 스키마 검증, 이스케이프를 적용합니다.
- 아티팩트는 GreenCI 자체 메모리 내 ZIP 리더로 읽으며, zip slip·절대 경로·심볼릭 링크·과대
  멤버·압축 폭탄을 **메모리 할당 전에** 거부합니다.
- 실패 로그 파싱은 **기본 비활성**입니다. 켜더라도 크기 제한, 자격 증명 마스킹, 메모리 내
  처리가 적용되고 저장하지 않습니다.
- 최소 권한: `actions: read`, `contents: read`, 선택적으로 `pull-requests: write`. 그 외에는
  절대 요구하지 않습니다.

위협 모델과 전체 제한값 표: [docs/security-model.md](docs/security-model.md). 취약점 신고:
[SECURITY.md](SECURITY.md).

## 설정

`.greenci.yml`은 선택 사항입니다. 분석 대상 리비전에서 API로 읽고
[`schemas/config.schema.json`](schemas/config.schema.json)으로 검증합니다. 알 수 없는 키는
거부되며, **의도했을 키를 제안해 줍니다.**

아래 예시는 모두 테스트 스위트가 파싱하므로 스키마와 어긋날 수 없습니다.

<details>
<summary><b>권장</b> — 한국어 리포트, 실제 지역, 경고 예산</summary>

<br>

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

</details>

<details>
<summary><b>엄격</b> — 신뢰도 높은 회귀에서 GreenCI Job을 실패시키기</summary>

<br>

```yaml
version: 1

policy:
  default-mode: warn
  rules:
    - metric: runner-time-regression-percent
      operator: greater-than
      value: 20
      mode: fail
      minimum-confidence: high
    - metric: carbon-p95-grams
      operator: greater-than
      value: 10
      mode: warn
    - metric: failed-jobs
      operator: greater-than
      value: 0
      mode: warn
```

`fail` 규칙은 근거가 되는 측정값의 신뢰도가 `minimum-confidence`보다 낮으면 자동으로 `warn`으로
내려갑니다. GreenCI는 자기가 신뢰하지 않는 숫자로 여러분의 Pull Request를 막지 않습니다.

</details>

<details>
<summary><b>고급</b> — 테스트 리포트, 실패 진단, 통계 조정</summary>

<br>

```yaml
version: 1

baseline:
  branch: main
  successful-runs: 10
  minimum-samples: 5
  workflow-shape-threshold: 0.85
  statistics:
    regression-percent: 10
    modified-z-score: 3
carbon:
  region: EU
  simulation-samples: 4000
analysis:
  what-if:
    speedup-percent: 30
  failure-logs:
    enabled: true
    max-jobs: 2
  test-reports:
    - artifact: test-results
      format: junit
report:
  top-hotspots: 8
  annotations:
    min-confidence: 0.9
recommendations:
  minimum-confidence: 0.6
  max-count: 8
```

</details>

Action 입력과 출력 전체 표는 [README.md](README.md#configuration)에 있습니다.

## 로컬에서 돌려보기

네트워크도, 토큰도, GitHub도 필요 없습니다.

```bash
pnpm install && pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/demo/inefficient.json
```

커밋된 최적화 전후 시연은 한 명령입니다.

```bash
pnpm demo
```

## 한계

설치 전에 알아두면 좋은 것들:

- **Job을 `needs`에 나열해야 합니다.** GreenCI는 자신이 속한 실행을 분석하므로, 의존하지 않는
  Job은 기다릴 수 없습니다.
- **기준선은 Actions API에서 옵니다.** 새 저장소, 재구성된 워크플로, 조용한 브랜치에서는
  정당하게 "판단 보류"가 나옵니다.
- **탄소는 측정값이 아니라 모델 추정값**이며, 지역을 설정하지 않으면 알 수 없습니다.
- **비용은 정가 환산액**이고 여러분의 청구서가 아닙니다.
- **Matrix 매핑은 휴리스틱입니다.** `Build (fast)`처럼 이름에 괄호가 있는 Job은 Matrix 변형으로
  읽힙니다. 매핑이 모호하면 조용히 추측하지 않고 DAG 신뢰도를 낮춥니다.
- **월간 절감 추정은 없습니다.** 이유와 대신 제공하는 것은
  [ADR 0007](docs/adr/0007-no-savings-projection.md)에 있습니다.
- **자체 호스팅 러너**는 시간은 분석하지만 가격·전력 모델이 없어서 비용과 탄소에서 제외되며,
  그 사실을 리포트에 밝힙니다.

## 문서

| 문서                                | 내용                                            |
| ----------------------------------- | ----------------------------------------------- |
| [추정 방식](docs/methodology.md)    | 모든 숫자를 측정값 / 추정값 / 가정값으로 분류.  |
| [보안 모델](docs/security-model.md) | 위협 모델, 공격 표면, 각각에 대한 통제.         |
| [아키텍처](docs/architecture.md)    | 경계, 결정론, 축소 동작, 지역화.                |
| [데이터 출처](docs/data-sources.md) | 데이터셋 출처와 정정하는 방법.                  |
| [데모](docs/demo.md)                | 실제 Run ID가 붙은 최적화 전후 이야기.          |
| [성능](docs/performance.md)         | GreenCI 자체를 돌리는 데 드는 비용.             |
| [의사결정 기록](docs/adr/README.md) | 무엇을 선택하고 무엇을 거절했는지, 그리고 이유. |

## 기여

버그 리포트, 데이터셋 정정, 새로운 개선 제안 규칙이나 로그 파서 모두 환영합니다.
[CONTRIBUTING.md](CONTRIBUTING.md)에서 시작하세요. 로컬 검증 전체는 한 명령입니다.

```bash
pnpm verify:all
```

## 라이선스

[Apache-2.0](LICENSE)
