import type { AnalysisReport } from '../domain/report.js';
import type { NormalizedJob } from '../domain/schemas.js';
import {
  formatZScore,
  renderConfidenceLine,
  renderEstimationDetails,
  renderHeadline,
  renderMetricTable,
  renderRegressionTable,
  renderWarnings,
  translateConfidence,
  translateVerdict,
} from './common.js';
import {
  escapeMarkdown,
  formatDuration,
  formatGrams,
  formatKwh,
  formatNumber,
  formatRatio,
  formatSignedPercent,
  formatUsd,
  renderTable,
  truncate,
} from './format.js';
import { createTranslator, type Translator } from './i18n/index.js';
import {
  renderCriticalPathSection,
  renderDiagnosticsSection,
  renderFailuresSection,
  renderPolicySection,
  renderRecommendationsSection,
  renderTestsSection,
  renderWhatIfSection,
} from './sections.js';

export { escapeMarkdown, formatDuration } from './format.js';

const JOB_SUMMARY_ROW_LIMIT = 20;

function jobRows(report: AnalysisReport): string[][] {
  return report.jobs.map((job) => [
    escapeMarkdown(truncate(job.apiName, 90)),
    escapeMarkdown(job.runnerClass),
    escapeMarkdown(job.conclusion),
    formatDuration(job.durationSeconds),
  ]);
}

function stepRows(job: NormalizedJob): string[][] {
  if (job.steps.length === 0) {
    return [[escapeMarkdown(truncate(job.apiName, 90)), '—', '—', '—']];
  }
  return job.steps.map((step) => [
    escapeMarkdown(truncate(job.apiName, 90)),
    escapeMarkdown(truncate(step.name, 90)),
    escapeMarkdown(step.conclusion),
    formatDuration(step.durationSeconds),
  ]);
}

function renderBaselineSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const baseline = report.baseline;
  const runRows = baseline.runs
    .slice(0, JOB_SUMMARY_ROW_LIMIT)
    .map((run) => [
      String(run.runId),
      String(run.runAttempt),
      formatRatio(run.shapeSimilarity),
      translate(run.exactShapeMatch ? 'shape.exact' : 'shape.similar'),
      translate(run.included ? 'state.included' : 'state.excluded'),
      formatDuration(run.wallClockSeconds),
      formatDuration(run.runnerSeconds),
    ]);

  const metricRows = baseline.metrics.map((metric) => [
    `\`${escapeMarkdown(metric.metric)}\``,
    formatNumber(metric.baselineMedian, 3),
    formatNumber(metric.current, 3),
    formatSignedPercent(metric.percentChange),
    formatZScore(metric),
    escapeMarkdown(metric.scaleMethod),
    String(metric.sampleCount),
    translateVerdict(translate, metric.verdict),
    translateConfidence(translate, metric.confidence),
  ]);

  return [
    `## ${translate('section.baseline')}`,
    '',
    `- ${translate('baseline.branch')}: ${escapeMarkdown(truncate(baseline.branch ?? '—', 80))}`,
    `- ${translate('baseline.considered')}: ${baseline.consideredRuns}`,
    `- ${translate('baseline.included')}: ${baseline.sampleCount}`,
    `- ${translate('baseline.excludedShape')}: ${baseline.excludedForShape}`,
    `- ${translate('label.shapeMatch')}: ${formatRatio(baseline.shapeSimilarity)} (${translate('label.threshold')} ${formatRatio(baseline.shapeThreshold)})`,
    `- ${translate('baseline.fingerprint')}: \`${baseline.currentFingerprint.slice(0, 24)}\``,
    '',
    ...renderTable(
      [
        translate('label.run'),
        translate('label.attempt'),
        translate('label.shapeMatch'),
        translate('label.shape'),
        translate('label.state'),
        translate('metric.wallClock'),
        translate('metric.runnerTime'),
      ],
      ['right', 'right', 'right', 'left', 'left', 'right', 'right'],
      runRows,
    ),
    '',
    ...renderTable(
      [
        translate('table.metric'),
        translate('table.baseline'),
        translate('table.current'),
        translate('table.change'),
        translate('label.zScore'),
        translate('label.scale'),
        translate('label.samples'),
        translate('label.verdict'),
        translate('label.confidence'),
      ],
      [
        'left',
        'right',
        'right',
        'right',
        'right',
        'left',
        'right',
        'left',
        'left',
      ],
      metricRows,
    ),
  ];
}

function renderNodeComparisons(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const rows = [
    ...report.baseline.jobComparisons,
    ...report.baseline.stepComparisons,
  ]
    .slice(0, JOB_SUMMARY_ROW_LIMIT)
    .map((entry) => [
      translate(entry.kind === 'job' ? 'label.job' : 'label.step'),
      `\`${escapeMarkdown(truncate(entry.label, 90))}\``,
      formatDuration(entry.baselineMedian),
      formatDuration(entry.current),
      formatSignedPercent(entry.percentChange),
      formatZScore(entry),
      String(entry.sampleCount),
      translateVerdict(translate, entry.verdict),
    ]);
  return renderTable(
    [
      translate('label.kind'),
      `${translate('label.job')} / ${translate('label.step')}`,
      translate('table.baseline'),
      translate('table.current'),
      translate('table.change'),
      translate('label.zScore'),
      translate('label.samples'),
      translate('label.verdict'),
    ],
    ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'left'],
    rows,
  );
}

function renderCostSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const cost = report.cost;
  if (cost === undefined) {
    return [
      `## ${translate('section.cost')}`,
      '',
      `_${translate('label.disabled')}_`,
    ];
  }
  return [
    `## ${translate('section.cost')}`,
    '',
    ...renderTable(
      [translate('table.metric'), translate('table.value')],
      ['left', 'right'],
      [
        [translate('cost.gross'), formatUsd(cost.grossListPriceUsd)],
        [translate('cost.billable'), formatUsd(cost.estimatedBillableUsd)],
        [translate('cost.billableMinutes'), String(cost.billableMinutes)],
      ],
    ),
    '',
    ...renderTable(
      [
        translate('label.job'),
        translate('label.runnerClass'),
        translate('label.duration'),
        translate('cost.billableMinutes'),
        translate('cost.gross'),
      ],
      ['left', 'left', 'right', 'right', 'right'],
      cost.jobs
        .slice(0, JOB_SUMMARY_ROW_LIMIT)
        .map((entry) => [
          escapeMarkdown(truncate(entry.jobName, 90)),
          escapeMarkdown(entry.runnerClass),
          formatDuration(entry.durationSeconds),
          String(entry.billableMinutes),
          entry.priced ? formatUsd(entry.grossListPriceUsd) : '—',
        ]),
    ),
    '',
    `_${translate('cost.invoiceUnknown')}_`,
  ];
}

type Carbon = NonNullable<AnalysisReport['carbon']>;

/**
 * Render one carbon assumption value.
 *
 * Every assumption value is a data token except `data-center-region`, which the
 * estimator annotates in prose to say whether the region was configured or
 * fell back. That annotation is rebuilt here from `region` and `regionResolved`
 * so it can be translated, rather than shipped pre-composed in the report.
 */
function assumptionValue(
  carbon: Carbon,
  assumption: Carbon['assumptions'][number],
  translate: Translator,
): string {
  if (assumption.key !== 'data-center-region') {
    return escapeMarkdown(truncate(assumption.value, 160));
  }
  const annotation = translate(
    carbon.regionResolved ? 'carbon.regionConfigured' : 'carbon.regionFallback',
  );
  return `${escapeMarkdown(carbon.region)} (${annotation})`;
}

function renderCarbonSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const carbon = report.carbon;
  if (carbon === undefined) {
    return [
      `## ${translate('section.carbon')}`,
      '',
      `_${translate('label.disabled')}_`,
    ];
  }
  return [
    `## ${translate('section.carbon')}`,
    '',
    ...renderTable(
      [translate('table.metric'), 'p05', 'p50', 'p95'],
      ['left', 'right', 'right', 'right'],
      [
        [
          translate('carbon.energy'),
          formatKwh(carbon.energyKwh.p05),
          formatKwh(carbon.energyKwh.p50),
          formatKwh(carbon.energyKwh.p95),
        ],
        [
          translate('metric.carbon'),
          formatGrams(carbon.operationalCarbonGrams.p05),
          formatGrams(carbon.operationalCarbonGrams.p50),
          formatGrams(carbon.operationalCarbonGrams.p95),
        ],
      ],
    ),
    '',
    ...carbon.assumptions.map(
      (assumption) =>
        `- \`${escapeMarkdown(assumption.key)}\`: ${assumptionValue(carbon, assumption, translate)} — ${translate.optional(
          `source.${assumption.source}`,
          escapeMarkdown(truncate(assumption.source, 160)),
        )}`,
    ),
    '',
    `_${translate('carbon.measurementDisclaimer')}_`,
  ];
}

/** Render the complete GreenCI result for the GitHub Job Summary surface. */
export function renderJobSummary(report: AnalysisReport): string {
  const translate = createTranslator(report.locale);
  return [
    `# ${translate('report.title')}`,
    '',
    `${translate('label.run')} \`${report.identity.runId}\` (${translate('label.attempt')} ${report.identity.runAttempt}) · \`${escapeMarkdown(truncate(report.identity.workflowPath, 120))}\``,
    '',
    `> ${renderHeadline(report, translate)}`,
    '',
    ...renderMetricTable(report, translate),
    '',
    renderConfidenceLine(report, translate),
    '',
    `## ${translate('section.topRegressions')}`,
    '',
    ...renderRegressionTable(report, translate, JOB_SUMMARY_ROW_LIMIT),
    '',
    `## ${translate('section.runtime')}`,
    '',
    ...renderTable(
      [translate('table.metric'), translate('table.value')],
      ['left', 'right'],
      [
        [
          translate('metric.wallClock'),
          formatDuration(report.current.wallClockSeconds),
        ],
        [
          translate('metric.runnerTime'),
          formatDuration(report.current.runnerSeconds),
        ],
        [
          translate('parallelism.peak'),
          String(report.parallelism.peakConcurrency),
        ],
        [
          translate('parallelism.average'),
          formatNumber(report.parallelism.averageConcurrency, 3),
        ],
        [
          translate('parallelism.idle'),
          formatDuration(report.parallelism.idleSeconds),
        ],
      ],
    ),
    '',
    `## ${translate('section.jobs')}`,
    '',
    ...renderTable(
      [
        translate('label.job'),
        translate('label.runnerClass'),
        translate('label.conclusion'),
        translate('label.duration'),
      ],
      ['left', 'left', 'left', 'right'],
      jobRows(report),
    ),
    '',
    `## ${translate('section.steps')}`,
    '',
    ...renderTable(
      [
        translate('label.job'),
        translate('label.step'),
        translate('label.conclusion'),
        translate('label.duration'),
      ],
      ['left', 'left', 'left', 'right'],
      report.jobs.flatMap(stepRows),
    ),
    '',
    ...renderCriticalPathSection(report, translate),
    '',
    ...renderWhatIfSection(report, translate),
    '',
    ...renderBaselineSection(report, translate),
    '',
    ...renderNodeComparisons(report, translate),
    '',
    ...renderRecommendationsSection(report, translate, {
      withEvidence: true,
      limit: JOB_SUMMARY_ROW_LIMIT,
    }),
    '',
    ...renderPolicySection(report, translate),
    '',
    ...renderFailuresSection(report, translate),
    '',
    ...renderTestsSection(report, translate),
    '',
    ...renderDiagnosticsSection(report, translate),
    '',
    ...renderCostSection(report, translate),
    '',
    ...renderCarbonSection(report, translate),
    '',
    `## ${translate('section.details')}`,
    '',
    ...renderEstimationDetails(report, translate),
    '',
    `## ${translate('section.warnings')}`,
    '',
    `${translate('label.analyzerExclusion')}: ${escapeMarkdown(report.analyzerExclusion.method)}${report.analyzerExclusion.heuristic ? ` (${translate('label.heuristic')})` : ''}`,
    '',
    ...renderWarnings(report, translate),
    '',
    translate('footer.generated', {
      version: report.greenciVersion,
      schema: report.schemaVersion,
      locale: report.locale,
    }),
    '',
  ].join('\n');
}
