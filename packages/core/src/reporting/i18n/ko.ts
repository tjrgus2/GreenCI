import type { Messages } from './en.js';

/** Korean report bundle. Console logs and JSON fields stay English. */
export const ko: Messages = {
  'report.title': '🌱 GreenCI 리포트',
  'report.currentOnly': '현재 실행 분석',

  'headline.regression':
    '⚠ `{branch}` 브랜치의 성공한 실행 {samples}건 중앙값 대비 러너 시간이 {percent} 증가했습니다.',
  'headline.improvement':
    '✅ `{branch}` 브랜치의 성공한 실행 {samples}건 중앙값 대비 러너 시간이 {percent} 감소했습니다.',
  'headline.stable':
    '✅ `{branch}` 브랜치의 성공한 실행 {samples}건 중앙값 대비 통계적으로 유의한 변화가 없습니다.',
  'headline.inconclusive':
    'ℹ 기준 실행 {samples}건과의 비교 결과를 신뢰하기 어렵습니다.',
  'headline.unavailable':
    'ℹ 비교 가능한 기준 실행이 없어 현재 실행만 분석했습니다.',
  'headline.insufficient':
    'ℹ 비교 가능한 기준 실행이 {samples}건뿐입니다(최소 {minimum}건). 회귀로 단정하지 않습니다.',
  'headline.shapeChanged':
    'ℹ 워크플로 구조가 변경되어 과거 실행과 비교하지 않았습니다.',

  'table.metric': '지표',
  'table.baseline': '기준 중앙값',
  'table.current': '현재',
  'table.change': '변화',
  'table.value': '값',

  'metric.wallClock': '⏱ 실제 경과 시간',
  'metric.runnerTime': '🖥 러너 시간',
  'metric.carbon': '🌱 탄소, p50',
  'metric.listPrice': '💵 정가 환산 비용',

  'label.confidence': '신뢰도',
  'label.shapeMatch': '워크플로 구조 일치도',
  'label.baselineSamples': '기준 표본 수',
  'label.unavailable': '측정 불가',
  'label.dataQuality': '데이터 품질',
  'label.none': '없음',
  'label.job': 'Job',
  'label.step': 'Step',
  'label.duration': '소요 시간',
  'label.runnerClass': '러너 클래스',
  'label.conclusion': '결과',
  'label.samples': '표본 수',
  'label.zScore': '수정 z-점수',
  'label.verdict': '판정',
  'label.disabled': '비활성화됨',

  'confidence.high': '높음',
  'confidence.medium': '보통',
  'confidence.low': '낮음',

  'verdict.regression': '회귀',
  'verdict.improvement': '개선',
  'verdict.stable': '안정',
  'verdict.inconclusive': '판단 보류',

  'section.topRegressions': '주요 회귀 항목',
  'section.runtime': '실행 시간',
  'section.jobs': 'Job',
  'section.steps': 'Step',
  'section.parallelism': '병렬성',
  'section.baseline': '기준선 비교',
  'section.cost': '비용',
  'section.carbon': '탄소',
  'section.details': '추정 방식과 데이터 품질',
  'section.warnings': '경고 및 축소 동작',
  'section.dataSources': '데이터 출처',

  'cost.gross': '정가 환산 총액',
  'cost.billable': '추정 과금액',
  'cost.billableMinutes': '과금 분(Job 단위 올림)',
  'cost.invoiceUnknown':
    'GreenCI는 GitHub 청구서를 읽을 수 없으므로 실제 청구 금액은 계산하지 않습니다.',
  'cost.publicFree':
    '현재 정책상 공개 저장소의 표준 GitHub 호스팅 러너는 무료입니다. 비교를 위해 정가 환산액을 함께 표시합니다.',
  'cost.unknownRunner':
    '알 수 없는 러너 클래스에는 가격을 적용하지 않았습니다: {classes}.',

  'carbon.interval': '탄소 구간, p05–p95',
  'carbon.energy': '전력량, p50',
  'carbon.region': '지역',
  'carbon.model': '탄소 모델',
  'carbon.samples': '시뮬레이션 표본 수',
  'carbon.seed': '결정론적 시드',
  'carbon.unknownRunner':
    '알 수 없는 러너 클래스에는 전력 모델을 적용하지 않았습니다: {classes}.',

  'parallelism.peak': '최대 동시 실행 수',
  'parallelism.average': '평균 동시 실행 수',
  'parallelism.idle': '유휴 구간',

  'baseline.branch': '기준 브랜치',
  'baseline.considered': '검토한 실행 수',
  'baseline.included': '비교한 실행 수',
  'baseline.excludedShape': '구조 불일치로 제외한 실행 수',
  'baseline.fingerprint': '워크플로 구조 지문',

  'section.whatIf': 'What if? (반사실 추정)',
  'whatIf.unavailable': '이 실행에서는 추정할 수 있는 시나리오가 없습니다.',
  'whatIf.scenario': '시나리오',
  'whatIf.criticalPath': 'Critical Path',
  'whatIf.runnerTime': '러너 시간',
  'whatIf.listPrice': '정가 환산 비용',
  'whatIf.carbon': '탄소 p50',
  'whatIf.onCriticalPath':
    '{target}은(는) Critical Path 위에 있으므로 {percent} 빨라지면 개발자 대기 시간이 줄어듭니다.',
  'whatIf.offCriticalPath':
    '{target}은(는) Critical Path 위에 없으므로 {percent} 빨라져도 대기 시간은 줄지 않고 러너 시간·비용·탄소만 절감됩니다.',
  'whatIf.runnerOnly':
    '워크플로 그래프를 사용할 수 없어 소요 시간에서 파생되는 지표만 추정했습니다.',

  'section.criticalPath': 'Critical Path',
  'section.hotspots': 'Critical Path 밖의 자원 소비 지점',
  'section.recommendations': '개선 제안',
  'section.policy': '정책',
  'section.tests': '테스트 리포트',
  'section.diagnostics': '실패 진단',
  'section.failures': '실패',

  'criticalPath.method.dag': '워크플로 needs 그래프로 재구성함',
  'criticalPath.method.interval-fallback':
    '구간 중첩 기반 추정 — 워크플로 정의를 사용할 수 없어 정확한 DAG Critical Path가 아닙니다',
  'criticalPath.method.unavailable': '이 실행에서는 계산할 수 없음',
  'criticalPath.total': 'Critical Path 소요 시간',
  'criticalPath.share': '실제 경과 시간 대비 비중',
  'criticalPath.waiting':
    'Critical Path 위의 Job은 개발자가 기다리는 시간을 늘립니다. Critical Path 밖의 지점은 대기 시간을 늘리지 않지만 러너 시간·비용·탄소를 소비합니다.',
  'label.contribution': '기여도',
  'label.runnerShare': '러너 시간 비중',

  'policy.conclusion.pass': '모든 정책이 예산 이내',
  'policy.conclusion.warn': '정책 경고',
  'policy.conclusion.fail': '정책 실패',
  'policy.conclusion.skipped': '설정된 정책 없음',
  'policy.rule': '규칙',
  'policy.actual': '실측값',
  'policy.threshold': '임계값',
  'policy.mode': '모드',
  'policy.result': '결과',
  'policy.passed': '예산 이내',
  'policy.violated': '초과',
  'policy.notEvaluated': '평가하지 않음',

  'recommendation.evidence': '근거',
  'recommendation.impact': '절감 가능량(상한 추정)',
  'recommendation.none': '신뢰도 기준을 넘은 제안이 없습니다.',
  'recommendation.disclaimer':
    '개선 제안은 결정론적이고 근거 기반의 제안이며, 보장된 해결책이 아닙니다.',

  'tests.total': '테스트 수',
  'tests.passed': '성공',
  'tests.failed': '실패',
  'tests.errored': '오류',
  'tests.skipped': '건너뜀',
  'tests.duration': '총 테스트 시간',
  'tests.slowestSuites': '가장 느린 Suite',
  'tests.slowestCases': '가장 느린 테스트 케이스',
  'tests.failedCases': '실패한 테스트 케이스',
  'tests.rejected': '거부된 아카이브 항목',
  'tests.unavailable': '분석한 테스트 리포트 아티팩트가 없습니다.',

  'diagnostics.disabled':
    '실패 로그 파싱이 비활성화되어 있습니다. `analysis.failure-logs.enabled`를 켜면 실패한 Job 로그의 제한된 끝부분만 로컬에서 분석합니다.',
  'diagnostics.none': '추출된 진단 결과가 없습니다.',
  'diagnostics.privacy':
    '로그는 메모리에서만 읽고, 크기를 제한하며, 자격 증명을 마스킹하고, 저장하거나 외부로 전송하지 않습니다.',

  'failures.none': '실패한 Job이 없습니다.',
  'failures.job': '실패한 Job',
  'failures.step': '실패한 Step',
  'failures.before': '실패까지 소요 시간',
  'failures.position': '전체 경과 시간 중 실패 지점',

  'warnings.none': '경고 없음.',
  'footer.generated':
    'GreenCI {version} · 리포트 스키마 {schema} · 로케일 {locale}',
  'footer.notMeasured':
    '탄소 값은 직접 측정값이 아니라 모델 기반 운영 배출량 추정값입니다.',

  'label.analyzerExclusion': '분석기 Job 제외 방식',
  'label.heuristic': '휴리스틱',
  'label.run': '실행',
  'label.attempt': '시도',
  'label.shape': '구조',
  'label.state': '상태',
  'label.scale': '척도',
  'label.kind': '종류',
  'label.threshold': '임계값',
  'label.suite': '스위트',
  'label.message': '메시지',
  'label.parser': '파서',
  'label.severity': '심각도',
  'label.location': '위치',
  'shape.exact': '완전 일치',
  'shape.similar': '유사',
  'state.included': '포함',
  'state.excluded': '제외',
  'details.runtimeSource': '런타임 데이터 출처',
  'details.runtimeSourceValue': 'GitHub Actions API',
  'details.version': 'GreenCI 버전',
  'details.schema': '리포트 스키마',
  'details.configHash': '설정 해시',

  'rule.GCI-CACHE-001.title': '의존성 설치가 러너 시간을 대부분 차지합니다',
  'rule.GCI-CACHE-001.explanation':
    '의존성 설치 Step이 전체 러너 시간의 큰 비중을 차지하고 있습니다. Lockfile 기반 의존성 캐시를 쓰거나, 미리 준비한 의존성 아티팩트를 재사용하면 대부분을 제거할 수 있습니다.',
  'rule.GCI-DUP-001.title': '같은 Step이 여러 Job에서 반복 실행됩니다',
  'rule.GCI-DUP-001.explanation':
    '동일한 작업을 하는 Step이 두 개 이상의 Job에서 실행되고 있습니다. 한 번만 수행한 뒤 결과를 아티팩트로 공유하거나 재사용 가능한 워크플로로 분리하면 중복된 러너 시간이 사라집니다.',
  'rule.GCI-MATRIX-001.title': 'Matrix 확장이 러너 사용량을 대부분 차지합니다',
  'rule.GCI-MATRIX-001.explanation':
    '하나의 Matrix Job이 여러 변형으로 확장되어 실행 시간의 대부분을 소비하고 있습니다. Pull Request에서는 축소된 Matrix만 돌리고, 전체 Matrix는 기본 브랜치나 스케줄에서 실행하는 방식을 고려해 보세요.',
  'rule.GCI-ORDER-001.title': '파이프라인이 늦게 실패했습니다',
  'rule.GCI-ORDER-001.explanation':
    '첫 실패가 실행이 상당히 진행된 뒤에 발생해서, 기여자가 파이프라인이 깨진 것을 알기까지 오래 기다렸습니다. 가장 빠른 검사를 먼저 실행하거나 느린 Job을 그 뒤에 두면 피드백 주기가 짧아집니다.',
  'rule.GCI-CRITICAL-001.title': '한 Job이 Critical Path를 지배합니다',
  'rule.GCI-CRITICAL-001.explanation':
    '개발자가 이 워크플로를 기다리는 시간의 대부분을 단일 Job이 차지합니다. 이 Job을 분할하거나 병렬화하면 머지까지의 대기 시간이 줄어들지만, Critical Path 밖의 Job을 최적화해도 대기 시간은 줄지 않습니다.',
  'rule.GCI-REGRESSION-001.title':
    '통계적으로 유의한 CI 성능 회귀가 감지되었습니다',
  'rule.GCI-REGRESSION-001.explanation':
    '현재 실행이 비교 가능한 과거 실행들의 강건 중앙값보다 설정된 임계값 이상으로 느립니다. 아래 표시된 노드가 가장 크게 기여한 지점이므로 먼저 확인해 보세요.',
  'rule.GCI-FLAKY-001.title': '워크플로 실행 시간이 실행마다 불안정합니다',
  'rule.GCI-FLAKY-001.explanation':
    '이 워크플로의 과거 실행 시간이 크게 흔들려서, 회귀를 감지하기 어렵고 머지 시점을 예측하기도 어렵습니다. 불안정한 캐시, 네트워크에 의존하는 Step, 불안정한 테스트가 흔한 원인입니다.',
  'rule.GCI-QUEUE-001.title': '러너 대기(큐) 시간이 전체 대기를 지배합니다',
  'rule.GCI-QUEUE-001.explanation':
    'Job이 실제로 실행된 시간보다 러너를 배정받기까지 기다린 시간이 전체 경과 시간의 큰 부분을 차지했습니다. 이는 코드 최적화 문제가 아니라 스케줄링과 러너 용량 문제입니다.',

  'source.GitHub Actions step timing': 'GitHub Actions Step 실행 시간',
  'source.GitHub Actions step names': 'GitHub Actions Step 이름',
  'source.Normalized GitHub Actions step names':
    '정규화한 GitHub Actions Step 이름',
  'source.GitHub Actions job names': 'GitHub Actions Job 이름',
  'source.GitHub job names': 'GitHub Job 이름',
  'source.GitHub Actions job conclusions': 'GitHub Actions Job 실행 결과',
  'source.GitHub Actions job timestamps': 'GitHub Actions Job 타임스탬프',
  'source.GitHub Actions run history': 'GitHub Actions 실행 이력',
  'source.GreenCI runtime analysis': 'GreenCI 실행 시간 분석',
  'source.GreenCI critical-path analysis': 'GreenCI Critical Path 분석',
  'source.GreenCI baseline comparison': 'GreenCI 기준선 비교',
  'source.GreenCI robust statistics': 'GreenCI 강건 통계',
  'source.GreenCI per-node comparison': 'GreenCI 노드별 비교',
  'source.GreenCI configuration': 'GreenCI 설정',
  'source.Workflow needs graph': '워크플로 needs 그래프',
  'source.Interval overlap fallback': '구간 중첩 기반 대체 추정',

  'config.rejected':
    '저장소 GreenCI 설정이 거부되어 내장 기본값을 사용합니다: {issues}',
  'config.unknownKeys': '알 수 없는 키 {keys}',
  'config.didYouMean': '`{key}` (`{suggestion}`을(를) 의도하신 것 같습니다)',
  'config.root': '(최상위)',

  'whatIf.disclaimer':
    '반사실 추정값은 특정 Job이 가정상 짧아졌을 때를 GreenCI 모델로 다시 계산한 결과입니다. 실제로 측정된 절감량이 아니며, 그 개선이 달성 가능하다는 보장도 아닙니다.',
  'carbon.measurementDisclaimer':
    '모델 기반 운영 배출량입니다. GreenCI는 GitHub 호스티드 러너의 전력을 직접 측정하지 않으며, SCI 인증 준수를 주장하지 않습니다.',
  'carbon.regionConfigured': '설정값',
  'carbon.regionFallback': '대체값. GitHub는 실행 지역을 공개하지 않습니다',
  'carbon.regionFallbackShort': '대체값',

  'warning.ANALYZER_EXCLUSION_HEURISTIC':
    '현재 분석기 Job의 API 이름이 GITHUB_JOB과 일치하지 않아 휴리스틱으로 제외했습니다.',
  'warning.ANALYZER_NOT_IDENTIFIED':
    '현재 분석기 Job을 식별하지 못했습니다. 아직 완료되지 않은 Job은 소요 시간 지표에 반영되지 않습니다.',
  'warning.JOB_TIMESTAMPS_INCOMPLETE':
    '타임스탬프가 불완전한 Job이 있어 러너 시간 합계에서 제외했습니다.',
  'warning.STEP_TIMESTAMPS_INCOMPLETE':
    '타임스탬프가 불완전한 Step이 있어 소요 시간을 표시할 수 없습니다.',
  'warning.BASELINE_UNAVAILABLE':
    '비교할 수 있는 과거 실행이 없어, GreenCI는 회귀 판정 없이 현재 실행만 보고합니다.',
  'warning.BASELINE_INSUFFICIENT_SAMPLES':
    '비교 가능한 기준 실행이 {samples}건뿐입니다. 회귀를 판정하려면 {minimum}건이 필요합니다. 기준 브랜치에 실행 이력을 더 쌓거나, .greenci.yml에서 `baseline.minimum-samples` 값을 낮추세요.',
  'warning.WORKFLOW_SHAPE_CHANGED':
    '워크플로 구조가 설정된 임계값을 넘어 달라져서 과거 실행 {excluded}건을 비교 대상에서 제외했습니다.',
  'warning.RUNNER_PRICE_UNKNOWN':
    '알 수 없는 러너 클래스에는 단가를 적용하지 않습니다: {classes}. 해당 Job은 비용 합계에서 제외됩니다. 가격 데이터셋이 포함할 수 있도록 러너 라벨을 제보해 주세요.',
  'warning.RUNNER_MODEL_UNKNOWN':
    '알 수 없는 러너 클래스에는 전력 모델을 적용하지 않습니다: {classes}. 해당 Job은 탄소 합계에서 제외됩니다. 전력 데이터셋이 포함할 수 있도록 러너 라벨을 제보해 주세요.',
  'warning.CARBON_REGION_UNKNOWN':
    '설정된 탄소 지역이 내장 데이터셋에 없어 GreenCI가 {region}을(를) 사용하고 데이터 품질 점수를 낮췄습니다. `carbon.region`이 받는 지역 목록은 docs/data-sources.md를 참고하세요.',
  'warning.WORKFLOW_DAG_UNAVAILABLE':
    '워크플로 정의로 needs 그래프를 재구성할 수 없어, 임계 경로를 구간 중첩으로 추정했습니다. 정확한 DAG Critical Path가 아닙니다.',
  'warning.CRITICAL_PATH_DEGRADED':
    'Critical Path를 신뢰도 {confidence} 수준으로 재구성했습니다 ({reasons}).',
};
