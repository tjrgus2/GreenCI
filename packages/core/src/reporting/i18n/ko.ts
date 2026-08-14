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

  'warnings.none': '경고 없음.',
  'footer.generated':
    'GreenCI {version} · 리포트 스키마 {schema} · 로케일 {locale}',
  'footer.notMeasured':
    '탄소 값은 직접 측정값이 아니라 모델 기반 운영 배출량 추정값입니다.',
};
