<div align="center">

# 🌱 GreenCI

**어떤 Job이 CI를 느리게 만들었고, 그게 얼마인지.**

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

CI는 머지 한 번에 조금씩 느려집니다. 누가 불평할 때쯤이면 원인은 이미 커밋 스무 개 뒤에 있죠.

GreenCI는 워크플로 안의 Job으로 돌면서 지금 이 Pull Request가 무엇을 바꿨는지 보고합니다.
Actions API에서 실행·Job·Step, 워크플로 파일, 그리고 기준 브랜치의 최근 성공한 실행들을 읽어서,
그 이력의 중앙값과 MAD를 기준으로 현재 실행을 비교합니다.

어려운 건 측정이 아니라 어느 Job을 고쳐야 하는지입니다. 머지를 지연시키는 Job과 러너 시간을
많이 쓰는 Job은 보통 서로 다르기 때문에, Critical Path와 러너 사용량을 따로 계산해서 보고합니다.

## 리포트 모양

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

이 실행에서는 `Integration test`가 대기 시간을, `Security`가 러너 비용을 끌고 있습니다.

라이브 실행: [느려진 PR](https://github.com/tjrgus2/greenci-demo/pull/1) ·
[늦게 실패한 PR](https://github.com/tjrgus2/greenci-demo/pull/2) ·
[최적화된 PR](https://github.com/tjrgus2/greenci-demo/pull/3) ·
[GreenCI가 자기 자신을 분석한 결과](https://github.com/tjrgus2/GreenCI/actions/workflows/greenci-self.yml)

## 설치

Job 하나 추가하고, 분석하려는 Job을 `needs`에 적으면 됩니다.

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

설치는 이게 전부입니다. 기본 정책이 없으니 직접 규칙을 쓰기 전까지는 Pull Request를 막지
않습니다.

`if: always()`를 자주 빼먹는데, 이게 없으면 Job이 실패할 때마다 GreenCI가 건너뛰어집니다.
정작 리포트가 필요한 순간이죠.

`pull-requests: write`는 선택입니다. 이 권한이 없으면 코멘트 대신 Job Summary를 쓰고 경고를
남깁니다. fork PR에는 GitHub이 읽기 전용 토큰을 주니까 자연히 이 경로를 타게 됩니다.

`@v1`은 릴리스 워크플로만 옮길 수 있습니다. 더 단단히 고정하고 싶으면 릴리스가 붙은 커밋을
쓰세요. 릴리스 아티팩트에는 빌드 증명이 붙어 있어서 무엇을 고정했는지 검증할 수 있습니다.

```yaml
- uses: tjrgus2/GreenCI@3c5ead811321207fc9add6abe74755ca8f9ce88a # v1.0.0-rc.3
```

## 무엇을 보고하는가

| 어디에                | 무엇을                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull Request          | 코멘트 1개를 만들고 이후 같은 코멘트를 갱신. 판정, 기준 중앙값 대비 핵심 지표 4개, 주요 회귀 항목, Critical Path, 반사실 추정, 개선 제안, 정책 결과. |
| 실행 페이지           | Job Summary. 위 내용에 Job/Step 표, 기준선 표본 전체, Job 단위 과금 반올림, 탄소 백분위, 테스트 결과, 가정 목록, 경고가 더해집니다.                  |
| `greenci-report.json` | 전체 리포트. [`schemas/report-v1.schema.json`](schemas/report-v1.schema.json)으로 검증되고, 분기에 쓸 수 있는 Action 출력 8개가 함께 나옵니다.       |
| Annotation            | 실패 로그 파싱을 켜면 신뢰도가 충분한 진단에 파일·줄 주석이 붙습니다.                                                                                |

<details>
<summary><b>측정하는 항목 전체</b></summary>

<br>

- **실행 시간** — 실제 경과 시간, 러너 시간, 큐 대기 시간, 유휴 구간, 최대·평균 동시 실행 수,
  Job/Step 단위 타이밍.
- **회귀 탐지** — 중앙값과 MAD 기반 수정 z-점수, IQR 및 백분율 전용 대체 경로.
- **워크플로 구조 지문** — 통계를 돌리기 전에 구조가 호환되지 않는 이력을 버립니다.
- **DAG Critical Path** — `jobs.<id>.needs`에서 재구성. Matrix 확장, 매핑 신뢰도 등급, 그리고
  그렇다고 표시되는 구간 중첩 대체 경로.
- **반사실 추정** — Critical Path 위의 Job과 병렬 소비 지점을 각각 50% 빠르게 하면 무엇이
  달라지는지.
- **비용** — 버전 관리되는 정가에 대한 Job 단위 분 반올림.
- **탄소** — 2000 표본 Monte Carlo로 p05/p50/p95와 데이터 품질 등급.
- **개선 제안** — 근거와 상한 영향 추정이 붙은 결정론적 규칙 8개.
- **정책** — 8개 지표에 대한 `report`/`warn`/`fail`.
- **JUnit** — 총계, 가장 느린 Suite와 케이스, 실패 케이스. 강화된 메모리 내 아카이브 리더로
  읽습니다.
- **실패 진단** — 선택 활성. 10개 툴체인에 대한 크기 제한·자격 증명 마스킹 로그 파싱.
- **영어/한국어** — 모든 표시 화면.

| 지표             | 의미                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| 실제 경과 시간   | 마지막 Job 종료 − 첫 Job 시작. 개발자가 실제로 기다린 시간에 가깝습니다.     |
| 러너 시간        | Job 소요 시간의 합. 실제로 소비하고 과금되는 양입니다.                       |
| Critical Path    | `needs`를 지나는 최장 가중 경로. 대기 시간을 줄이는 유일한 방법입니다.       |
| 비임계 소비 지점 | Critical Path 밖의 큰 러너 소비. 줄이면 돈은 아끼지만 시간은 그대로입니다.   |
| 큐 대기 시간     | Job 생성부터 시작까지. 스케줄링 지연이 코드 변경으로 읽히지 않게 분리합니다. |
| 최대·평균 동시성 | 워크플로가 빠르면서 동시에 비쌀 수 있는 이유.                                |

</details>

## 회귀 판정 기준

네 조건이 동시에 성립해야 합니다. 백분율 변화가 임계값을 넘고, 기준선 중앙값·MAD에 대한 수정
z-점수가 자기 임계값을 넘고, 표본이 충분하고, 워크플로 구조가 여전히 일치해야 합니다. 이력에
느린 실행 하나가 섞여 있다고 경보가 울리지는 않습니다.

구조 비교가 먼저 돌아갑니다. Job id, `needs` 간선, Step 키, 러너 클래스로 지문을 만들고 설정된
유사도보다 많이 다른 과거 실행을 버립니다. 이 단계가 없으면 통계가 서로 다른 워크플로를 비교하게
됩니다.

쓸 수 있는 척도가 없을 때도 있습니다. 표본이 전부 같아서 MAD가 0인 경우죠. 그러면 IQR로,
그다음엔 단순 백분율 비교로 내려가고 신뢰도는 낮음으로 고정됩니다. 모든 판정에는 등급이 붙고,
`fail` 정책 규칙은 근거가 되는 측정값의 신뢰도가 부족하면 스스로 `warn`으로 내려갑니다.

## 비용과 탄소

비용은 **정가 환산액**입니다. 러너 사용량 × 공개 분당 요금이고, GitHub이 과금하는 방식대로 각
Job의 1분 미만 시간을 합산 전에 올립니다. 표준 러너를 무료로 만드는 공개 저장소 정책을 적용한
추정 과금액은 따로 표시합니다. 실제 청구 금액은 계산하지 않습니다. 플랜 포함 분이나 조직 과금
계약은 Action이 볼 수 없습니다. 알 수 없는 러너 클래스에는 유추로 가격을 매기지 않고 총계에서
빼고 경고로 알립니다.

탄소는 측정값이 아니라 **모델 기반 운영 배출량**입니다. GitHub은 CPU 사용률, 호스트 하드웨어,
호스트 공유 여부, 순간 전력, 데이터센터 지역, 시설 PUE 중 아무것도 공개하지 않으므로 이 값들은
전부 삼각 분포에서 2000회 결정론적으로 샘플링됩니다. 결과는 데이터 품질 등급과 등급을 낮춘 이유,
가정 목록, 시드와 함께 p05/p50/p95로 나옵니다.

유도 과정과 모든 숫자의 분류(측정값 / 추정값 / 가정값 / 사용자 설정값 / 데이터셋 유래)는
[docs/methodology.md](docs/methodology.md)에 있습니다.

## 개선 제안

임계값이 고정된 손으로 쓴 규칙 8개입니다. 모델은 쓰지 않습니다. 각 제안은 자기가 발동한 근거를
함께 출력하므로 계산을 직접 따라갈 수 있습니다.

```text
🟠 GCI-CACHE-001  의존성 설치가 러너 시간을 대부분 차지합니다  (신뢰도 0.85)
   install-seconds: 75          →  75 ≥ 20 ✓
   install-share-percent: 26.8  →  26.8% ≥ 15% ✓
   절감 가능량: 53s              →  75 × 0.7
```

신뢰도 값은 학습된 확률이 아니라 규칙마다 정해둔 상수입니다. `GCI-CRITICAL-001`은 `needs`
그래프를 직접 읽었으면 0.85, Critical Path가 구간 중첩 대체 경로에서 나왔으면 0.50을 씁니다.
규칙은 [`packages/core/src/recommendation/rules.ts`](packages/core/src/recommendation/rules.ts)에
있고, 새 규칙 추가는 첫 기여로 하기 괜찮습니다.

## 보안

설계 전체가 한 가지 결정에서 나옵니다. GreenCI는 메타데이터만 읽고 코드는 다루지 않습니다.
무언가를 보낼 GreenCI 서비스 자체가 없습니다.

- 외부 통신 대상은 딱 한 곳, 분석 대상 저장소의 GitHub API입니다. 텔레메트리, 애널리틱스, 모델
  API 호출은 없습니다.
- 분석기는 Actions API만으로 동작합니다. Pull Request를 체크아웃하지 않고, 저장소가 제어하는
  문자열을 셸에 넘기지 않고, `eval`을 쓰지 않습니다.
- `.greenci.yml`, 워크플로 파일, 아티팩트, 로그는 신뢰할 수 없는 입력으로 취급합니다. 크기 제한,
  alias 비활성 YAML, 스키마 검증, 이스케이프를 적용합니다.
- 아티팩트는 GreenCI 자체 메모리 내 ZIP 리더로 읽습니다. zip slip, 절대 경로, 심볼릭 링크, 과대
  멤버, 압축 폭탄을 메모리 할당 전에 거부합니다.
- 실패 로그 파싱은 기본 비활성입니다. 켜면 크기 제한과 자격 증명 마스킹을 적용해 메모리에서만
  처리하고 디스크에 쓰지 않습니다.
- 권한은 `actions: read`, `contents: read`, 그리고 선택적으로 `pull-requests: write`.

위협 모델과 제한값: [docs/security-model.md](docs/security-model.md). 취약점 신고:
[SECURITY.md](SECURITY.md).

## 설정

`.greenci.yml`은 선택입니다. 분석 대상 리비전에서 API로 읽고
[`schemas/config.schema.json`](schemas/config.schema.json)으로 검증합니다. 알 수 없는 키는
거부되고, 의도했을 키를 제안해 줍니다. 아래 예시는 모두 테스트 스위트가 파싱하므로 스키마와
어긋날 수 없습니다.

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

</details>

<details>
<summary><b>고급</b> — 테스트 리포트, 실패 진단, 통계 조정</summary>

<br>

대부분 기본값으로 두면 됩니다.

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

커밋된 fixture를 오프라인으로 재생합니다. GitHub은 관여하지 않습니다.

```bash
pnpm install && pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/demo/inefficient.json
```

`pnpm demo`는 커밋된 최적화 전후 쌍을 재생해서 비교표를 출력합니다.

## 한계

- Job을 `needs`에 나열해야 합니다. GreenCI는 자기가 속한 실행을 분석하므로 의존하지 않는 Job은
  기다릴 수 없습니다.
- 기준선은 Actions API에서 옵니다. 새 저장소, 재구성된 워크플로, 조용한 브랜치에서는 "판단
  보류"가 나오고, 그게 맞는 답입니다.
- 탄소는 모델 추정값입니다. 지역을 설정하지 않으면 알 수 없습니다.
- 비용은 정가 환산액이고 청구서가 아닙니다.
- Matrix 매핑은 휴리스틱입니다. `Build (fast)`처럼 이름에 괄호가 있는 Job은 Matrix 변형으로
  읽힙니다. 매핑이 모호하면 조용히 추측하지 않고 DAG 신뢰도를 낮춥니다.
- 월간 절감 추정은 없습니다. 이유는 [ADR 0007](docs/adr/0007-no-savings-projection.md)에
  적어뒀습니다.
- 자체 호스팅 러너는 시간은 분석하지만 가격·전력 모델이 없어서 비용과 탄소에서 빠지고, 그 사실을
  리포트에 밝힙니다.

## 문서

| 문서                                | 내용                                           |
| ----------------------------------- | ---------------------------------------------- |
| [추정 방식](docs/methodology.md)    | 모든 숫자를 측정값 / 추정값 / 가정값으로 분류. |
| [보안 모델](docs/security-model.md) | 위협 모델, 공격 표면, 각각에 대한 통제.        |
| [아키텍처](docs/architecture.md)    | 경계, 결정론, 축소 동작, 지역화.               |
| [데이터 출처](docs/data-sources.md) | 데이터셋 출처와 정정하는 방법.                 |
| [데모](docs/demo.md)                | 실제 Run ID가 붙은 최적화 전후 기록.           |
| [성능](docs/performance.md)         | GreenCI 자체를 돌리는 데 드는 비용.            |
| [의사결정 기록](docs/adr/README.md) | 무엇을 선택하고 무엇을 거절했는지, 그 이유.    |

## 기여

버그 리포트, 데이터셋 정정, 새 개선 제안 규칙, 새 로그 파서 모두 환영합니다. 자세한 내용은
[CONTRIBUTING.md](CONTRIBUTING.md)에 있습니다. 로컬 검증은 한 명령입니다.

```bash
pnpm verify:all
```

## 라이선스

[Apache-2.0](LICENSE)
