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
};
