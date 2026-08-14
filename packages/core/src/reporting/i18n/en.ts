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

  'section.whatIf': 'What if? (counterfactual estimates)',
  'whatIf.unavailable':
    'No counterfactual scenario could be estimated for this run.',
  'whatIf.scenario': 'Scenario',
  'whatIf.criticalPath': 'Critical path',
  'whatIf.runnerTime': 'Runner time',
  'whatIf.listPrice': 'List-price equivalent',
  'whatIf.carbon': 'Carbon p50',
  'whatIf.onCriticalPath':
    '{target} is on the critical path, so making it {percent} faster shortens how long developers wait.',
  'whatIf.offCriticalPath':
    '{target} is not on the critical path, so making it {percent} faster frees runner time, cost, and carbon without shortening the wait.',
  'whatIf.runnerOnly':
    'The workflow graph was unavailable, so only duration-derived metrics are estimated.',

  'section.criticalPath': 'Critical path',
  'section.hotspots': 'Non-critical resource hotspots',
  'section.recommendations': 'Recommendations',
  'section.policy': 'Policy',
  'section.tests': 'Test report',
  'section.diagnostics': 'Failure diagnostics',
  'section.failures': 'Failures',

  'criticalPath.method.dag': 'Reconstructed from the workflow needs graph',
  'criticalPath.method.interval-fallback':
    'Interval-overlap estimate — the workflow definition was unavailable, so this is not an exact DAG critical path',
  'criticalPath.method.unavailable': 'Not available for this run',
  'criticalPath.total': 'Critical-path duration',
  'criticalPath.share': 'Share of wall-clock time',
  'criticalPath.waiting':
    'Critical-path jobs increase how long developers wait. Non-critical hotspots do not, but they still consume runner time, cost, and carbon.',
  'label.contribution': 'Contribution',
  'label.runnerShare': 'Runner-time share',

  'policy.conclusion.pass': 'All policies within budget',
  'policy.conclusion.warn': 'Policy warning',
  'policy.conclusion.fail': 'Policy failure',
  'policy.conclusion.skipped': 'No policy configured',
  'policy.rule': 'Rule',
  'policy.actual': 'Actual',
  'policy.threshold': 'Threshold',
  'policy.mode': 'Mode',
  'policy.result': 'Result',
  'policy.passed': 'Within budget',
  'policy.violated': 'Exceeded',
  'policy.notEvaluated': 'Not evaluated',

  'recommendation.evidence': 'Evidence',
  'recommendation.impact': 'Estimated upper-bound saving',
  'recommendation.none': 'No recommendation reached the confidence threshold.',
  'recommendation.disclaimer':
    'Recommendations are deterministic, evidence-based suggestions, not guaranteed fixes.',

  'tests.total': 'Tests',
  'tests.passed': 'Passed',
  'tests.failed': 'Failed',
  'tests.errored': 'Errored',
  'tests.skipped': 'Skipped',
  'tests.duration': 'Total test time',
  'tests.slowestSuites': 'Slowest suites',
  'tests.slowestCases': 'Slowest test cases',
  'tests.failedCases': 'Failed test cases',
  'tests.rejected': 'Rejected archive members',
  'tests.unavailable': 'No test-report artifact was analyzed.',

  'diagnostics.disabled':
    'Failed-log parsing is disabled. Enable `analysis.failure-logs.enabled` to parse a bounded tail of failed job logs locally.',
  'diagnostics.none': 'No diagnostic could be extracted.',
  'diagnostics.privacy':
    'Logs are read in memory, bounded, credential-redacted, and never stored or transmitted.',

  'failures.none': 'No job failed.',
  'failures.job': 'Failed job',
  'failures.step': 'Failed step',
  'failures.before': 'Time before failure',
  'failures.position': 'Failure position in wall-clock window',

  'warnings.none': 'No warnings.',
  'footer.generated':
    'GreenCI {version} · report schema {schema} · locale {locale}',
  'footer.notMeasured':
    'Carbon values are modeled operational emissions, not direct measurements.',

  'label.analyzerExclusion': 'Analyzer exclusion',
  'label.heuristic': 'heuristic',
  'label.run': 'run',
  'label.attempt': 'attempt',
  'label.shape': 'shape',
  'label.state': 'state',
  'label.scale': 'scale',
  'label.kind': 'kind',
  'label.threshold': 'threshold',
  'label.suite': 'suite',
  'label.message': 'message',
  'label.parser': 'parser',
  'label.severity': 'severity',
  'label.location': 'location',
  'shape.exact': 'exact',
  'shape.similar': 'similar',
  'state.included': 'included',
  'state.excluded': 'excluded',
  'details.runtimeSource': 'Runtime source',
  'details.runtimeSourceValue': 'GitHub Actions API',
  'details.version': 'GreenCI version',
  'details.schema': 'Report schema',
  'details.configHash': 'Config hash',

  // Prose the analyzer writes into the report in English. The report stays
  // locale-independent, so these are translated again at render time, keyed on
  // the stable rule id rather than on the English text.
  'rule.GCI-CACHE-001.title': 'Dependency installation dominates runner time',
  'rule.GCI-CACHE-001.explanation':
    'Dependency installation steps consume a large share of total runner time. A lockfile-aware dependency cache, or reusing a prepared dependency artifact, usually removes most of it.',
  'rule.GCI-DUP-001.title': 'The same step runs in several jobs',
  'rule.GCI-DUP-001.explanation':
    'An equivalent step executes in more than one job. Building or preparing once and sharing the result through an artifact, or extracting a reusable workflow, removes the duplicated runner time.',
  'rule.GCI-MATRIX-001.title': 'A matrix fan-out dominates runner consumption',
  'rule.GCI-MATRIX-001.explanation':
    'One matrix job expands into many variants that together consume most of the run. Consider a reduced matrix on pull requests and the full matrix on the default branch or a schedule.',
  'rule.GCI-ORDER-001.title': 'The pipeline failed late',
  'rule.GCI-ORDER-001.explanation':
    'The first failure landed well into the run, so contributors waited before learning the pipeline was broken. Running the fastest checks first, or gating slow jobs behind them, shortens that feedback loop.',
  'rule.GCI-CRITICAL-001.title': 'One job dominates the critical path',
  'rule.GCI-CRITICAL-001.explanation':
    'A single job accounts for most of the time developers wait for this workflow. Splitting or parallelizing it changes merge latency, while optimizing a non-critical job would not.',
  'rule.GCI-REGRESSION-001.title':
    'A statistically significant CI regression was detected',
  'rule.GCI-REGRESSION-001.explanation':
    'The current run is slower than the robust median of comparable historical runs by more than the configured threshold. The listed node is the largest contributor and is the place to look first.',
  'rule.GCI-FLAKY-001.title': 'Workflow runtime is unstable across runs',
  'rule.GCI-FLAKY-001.explanation':
    'The historical runtime of this workflow varies widely, which makes regressions harder to detect and merge times unpredictable. Unstable caches, network-dependent steps, or flaky tests are the usual causes.',
  'rule.GCI-QUEUE-001.title': 'Runner queue time dominates the wait',
  'rule.GCI-QUEUE-001.explanation':
    'Jobs spent a large part of the wall-clock window waiting for a runner rather than executing. This is a scheduling and capacity question, not a code optimization opportunity.',

  // Evidence and assumption provenance, keyed on the English text the rule
  // emitted so that the machine-readable report needs no extra field.
  'source.GitHub Actions step timing': 'GitHub Actions step timing',
  'source.GitHub Actions step names': 'GitHub Actions step names',
  'source.Normalized GitHub Actions step names':
    'Normalized GitHub Actions step names',
  'source.GitHub Actions job names': 'GitHub Actions job names',
  'source.GitHub job names': 'GitHub job names',
  'source.GitHub Actions job conclusions': 'GitHub Actions job conclusions',
  'source.GitHub Actions job timestamps': 'GitHub Actions job timestamps',
  'source.GitHub Actions run history': 'GitHub Actions run history',
  'source.GreenCI runtime analysis': 'GreenCI runtime analysis',
  'source.GreenCI critical-path analysis': 'GreenCI critical-path analysis',
  'source.GreenCI baseline comparison': 'GreenCI baseline comparison',
  'source.GreenCI robust statistics': 'GreenCI robust statistics',
  'source.GreenCI per-node comparison': 'GreenCI per-node comparison',
  'source.GreenCI configuration': 'GreenCI configuration',
  'source.Workflow needs graph': 'Workflow needs graph',
  'source.Interval overlap fallback': 'Interval overlap fallback',

  // Configuration rejection. Unlike the warnings above, this message names keys
  // that appear nowhere else in the report, so it is composed in the reader's
  // locale at validation time rather than translated at render time.
  'config.rejected':
    'The repository GreenCI configuration was rejected and bundled defaults are used instead: {issues}',
  'config.unknownKeys': 'unknown key(s) {keys}',
  'config.didYouMean': '`{key}` (did you mean `{suggestion}`?)',
  'config.root': '(root)',

  'whatIf.disclaimer':
    'Counterfactual estimates recomputed from GreenCI models over hypothetically shortened jobs. They are not measured savings and not a guarantee that the change is achievable.',
  'carbon.measurementDisclaimer':
    'Modeled operational emissions. GreenCI does not measure electricity on GitHub-hosted runners and does not claim certified SCI compliance.',
  'carbon.regionConfigured': 'configured',
  'carbon.regionFallback':
    'fallback; GitHub does not publish the execution region',
  'carbon.regionFallbackShort': 'fallback',

  // Degraded-mode warnings raised by the core analyzer.
  'warning.ANALYZER_EXCLUSION_HEURISTIC':
    'The current analyzer job was excluded heuristically because its API name did not match GITHUB_JOB.',
  'warning.ANALYZER_NOT_IDENTIFIED':
    'The current analyzer job could not be identified; incomplete jobs do not contribute duration metrics.',
  'warning.JOB_TIMESTAMPS_INCOMPLETE':
    'One or more jobs had incomplete timestamps and were excluded from runner-time totals.',
  'warning.STEP_TIMESTAMPS_INCOMPLETE':
    'One or more steps had incomplete timestamps and show an unavailable duration.',
  'warning.BASELINE_UNAVAILABLE':
    'No comparable historical run was available; GreenCI reports the current run without regression claims.',
  'warning.BASELINE_INSUFFICIENT_SAMPLES':
    'Only {samples} comparable baseline runs were available; {minimum} are required before a regression is claimed. Merge more runs to the baseline branch, or lower `baseline.minimum-samples` in .greenci.yml.',
  'warning.WORKFLOW_SHAPE_CHANGED':
    '{excluded} historical run(s) were excluded because the workflow structure differed by more than the configured shape threshold.',
  'warning.RUNNER_PRICE_UNKNOWN':
    'No price is applied to unknown runner classes: {classes}. Those jobs are excluded from the cost total; report the runner label so the pricing dataset can cover it.',
  'warning.RUNNER_MODEL_UNKNOWN':
    'No power model is applied to unknown runner classes: {classes}. Those jobs are excluded from the carbon total; report the runner label so the power dataset can cover it.',
  'warning.CARBON_REGION_UNKNOWN':
    'The configured carbon region is not in the bundled dataset, so GreenCI used {region} and lowered the data-quality score. See docs/data-sources.md for the regions `carbon.region` accepts.',
  'warning.WORKFLOW_DAG_UNAVAILABLE':
    'The workflow definition could not be used to rebuild the needs graph; criticality is an interval-overlap estimate and is not an exact DAG critical path.',
  'warning.CRITICAL_PATH_DEGRADED':
    'The critical path was reconstructed with {confidence} confidence ({reasons}).',
} as const;

/** Every translatable message key. */
export type MessageKey = keyof typeof en;

/** A complete locale bundle. */
export type Messages = Record<MessageKey, string>;
