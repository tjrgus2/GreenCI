/**
 * English is the source locale. Every other locale must provide the same key
 * set, which the `Messages` type enforces at compile time.
 */
export const en = {
  'report.title': '🌱 GreenCI Report',
  'report.currentOnly': 'Current-run analysis',

  'headline.regression':
    '⚠ Runner time increased by {percent} against the median of {samples} successful runs on `{branch}`.',
  'headline.improvement':
    '✅ Runner time decreased by {percent} against the median of {samples} successful runs on `{branch}`.',
  'headline.stable':
    '✅ No statistically significant change against the median of {samples} successful runs on `{branch}`.',
  'headline.inconclusive':
    'ℹ The comparison with {samples} baseline runs is inconclusive.',
  'headline.unavailable':
    'ℹ No comparable baseline run was available, so this report covers the current run only.',
  'headline.insufficient':
    'ℹ Only {samples} comparable baseline runs were available (minimum {minimum}); no regression is claimed.',
  'headline.shapeChanged':
    'ℹ The workflow structure changed, so historical runs were not compared.',

  'table.metric': 'Metric',
  'table.baseline': 'Baseline median',
  'table.current': 'Current',
  'table.change': 'Change',
  'table.value': 'Value',

  'metric.wallClock': '⏱ Wall-clock time',
  'metric.runnerTime': '🖥 Runner time',
  'metric.carbon': '🌱 Carbon, p50',
  'metric.listPrice': '💵 List-price equivalent',

  'label.confidence': 'Confidence',
  'label.shapeMatch': 'Workflow shape match',
  'label.baselineSamples': 'Baseline samples',
  'label.unavailable': 'Unavailable',
  'label.dataQuality': 'Data quality',
  'label.none': 'None',
  'label.job': 'Job',
  'label.step': 'Step',
  'label.duration': 'Duration',
  'label.runnerClass': 'Runner class',
  'label.conclusion': 'Conclusion',
  'label.samples': 'Samples',
  'label.zScore': 'Modified z-score',
  'label.verdict': 'Verdict',
  'label.disabled': 'Disabled',

  'confidence.high': 'High',
  'confidence.medium': 'Medium',
  'confidence.low': 'Low',

  'verdict.regression': 'Regression',
  'verdict.improvement': 'Improvement',
  'verdict.stable': 'Stable',
  'verdict.inconclusive': 'Inconclusive',

  'section.topRegressions': 'Top regressions',
  'section.runtime': 'Runtime',
  'section.jobs': 'Jobs',
  'section.steps': 'Steps',
  'section.parallelism': 'Parallelism',
  'section.baseline': 'Baseline comparison',
  'section.cost': 'Cost',
  'section.carbon': 'Carbon',
  'section.details': 'Estimation and data-quality details',
  'section.warnings': 'Warnings and degraded modes',
  'section.dataSources': 'Data sources',

  'cost.gross': 'Gross list-price equivalent',
  'cost.billable': 'Estimated billable cost',
  'cost.billableMinutes': 'Billable minutes (rounded per job)',
  'cost.invoiceUnknown':
    'GreenCI cannot read GitHub invoices, so the actual charge is never calculated.',
  'cost.publicFree':
    'Standard GitHub-hosted runners are free for public repositories under the current policy; the list-price equivalent is still shown for comparison.',
  'cost.unknownRunner':
    'No price is applied to unknown runner classes: {classes}.',

  'carbon.interval': 'Carbon interval, p05–p95',
  'carbon.energy': 'Energy, p50',
  'carbon.region': 'Region',
  'carbon.model': 'Carbon model',
  'carbon.samples': 'Simulation samples',
  'carbon.seed': 'Deterministic seed',
  'carbon.unknownRunner':
    'No power model is applied to unknown runner classes: {classes}.',

  'parallelism.peak': 'Peak concurrency',
  'parallelism.average': 'Average concurrency',
  'parallelism.idle': 'Idle gaps',

  'baseline.branch': 'Baseline branch',
  'baseline.considered': 'Runs considered',
  'baseline.included': 'Runs compared',
  'baseline.excludedShape': 'Runs excluded by workflow shape',
  'baseline.fingerprint': 'Workflow shape fingerprint',

  'warnings.none': 'No warnings.',
  'footer.generated':
    'GreenCI {version} · report schema {schema} · locale {locale}',
  'footer.notMeasured':
    'Carbon values are modeled operational emissions, not direct measurements.',
} as const;

/** Every translatable message key. */
export type MessageKey = keyof typeof en;

/** A complete locale bundle. */
export type Messages = Record<MessageKey, string>;
