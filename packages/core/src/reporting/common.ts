import type { AnalysisReport } from '../domain/report.js';
import {
  escapeMarkdown,
  formatDuration,
  formatGrams,
  formatNumber,
  formatRatio,
  formatSignedPercent,
  formatUsd,
  renderTable,
  truncate,
} from './format.js';
import type { MessageKey, Translator } from './i18n/index.js';

/** Hidden marker that makes the GreenCI pull-request comment idempotent. */
export const REPORT_MARKER = '<!-- greenci-report:v1 -->';

type Baseline = AnalysisReport['baseline'];
type MetricComparison = Baseline['metrics'][number];

/** Canonical metric identifiers used in the machine-readable report. */
export const METRICS = {
  wallClock: 'wall-clock-seconds',
  runnerTime: 'runner-seconds',
  listPrice: 'list-price-usd',
  carbon: 'carbon-p50-grams',
} as const;

/** Find one metric comparison by its canonical identifier. */
export function findMetric(
  report: AnalysisReport,
  metric: string,
): MetricComparison | undefined {
  return report.baseline.metrics.find((entry) => entry.metric === metric);
}

const confidenceKeys: Readonly<Record<string, MessageKey>> = {
  high: 'confidence.high',
  medium: 'confidence.medium',
  low: 'confidence.low',
};

const verdictKeys: Readonly<Record<string, MessageKey>> = {
  regression: 'verdict.regression',
  improvement: 'verdict.improvement',
  stable: 'verdict.stable',
  inconclusive: 'verdict.inconclusive',
};

/** Translate a confidence or data-quality grade. */
export function translateConfidence(
  translate: Translator,
  value: string,
): string {
  return translate(confidenceKeys[value] ?? 'confidence.low');
}

/** Translate a regression verdict. */
export function translateVerdict(translate: Translator, value: string): string {
  return translate(verdictKeys[value] ?? 'verdict.inconclusive');
}

/** One sentence answering whether CI improved or regressed. */
export function renderHeadline(
  report: AnalysisReport,
  translate: Translator,
): string {
  const baseline = report.baseline;
  const branch = escapeMarkdown(truncate(baseline.branch ?? '—', 80));
  if (baseline.status === 'unavailable') {
    return translate('headline.unavailable');
  }
  if (baseline.status === 'shape-changed') {
    return translate('headline.shapeChanged');
  }
  if (baseline.status === 'insufficient-samples') {
    return translate('headline.insufficient', {
      samples: baseline.sampleCount,
      minimum: baseline.minimumSamples,
    });
  }
  const runnerTime = findMetric(report, METRICS.runnerTime);
  const parameters = {
    samples: baseline.sampleCount,
    branch,
    percent: formatSignedPercent(runnerTime?.percentChange).replace(
      /^[▲▼▬]\s*/u,
      '',
    ),
  };
  if (runnerTime?.verdict === 'regression') {
    return translate('headline.regression', parameters);
  }
  if (runnerTime?.verdict === 'improvement') {
    return translate('headline.improvement', parameters);
  }
  if (runnerTime?.verdict === 'stable') {
    return translate('headline.stable', parameters);
  }
  return translate('headline.inconclusive', { samples: baseline.sampleCount });
}

interface MetricRow {
  readonly metric: string;
  readonly labelKey: MessageKey;
  readonly current: string;
  readonly baseline: string;
  readonly change: string;
}

function metricRow(
  report: AnalysisReport,
  metric: string,
  labelKey: MessageKey,
  current: number | undefined,
  format: (value: number | undefined) => string,
): MetricRow {
  const comparison = findMetric(report, metric);
  return {
    metric,
    labelKey,
    current: format(current),
    baseline:
      comparison === undefined ? '—' : format(comparison.baselineMedian),
    change: formatSignedPercent(comparison?.percentChange),
  };
}

/** The four headline metrics shown in every GreenCI surface. */
export function headlineMetricRows(report: AnalysisReport): MetricRow[] {
  return [
    metricRow(
      report,
      METRICS.wallClock,
      'metric.wallClock',
      report.current.wallClockSeconds,
      formatDuration,
    ),
    metricRow(
      report,
      METRICS.runnerTime,
      'metric.runnerTime',
      report.current.runnerSeconds,
      formatDuration,
    ),
    metricRow(
      report,
      METRICS.listPrice,
      'metric.listPrice',
      report.cost?.grossListPriceUsd,
      formatUsd,
    ),
    metricRow(
      report,
      METRICS.carbon,
      'metric.carbon',
      report.carbon?.operationalCarbonGrams.p50,
      formatGrams,
    ),
  ];
}

/** Render the shared baseline-versus-current metric table. */
export function renderMetricTable(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  return renderTable(
    [
      translate('table.metric'),
      translate('table.baseline'),
      translate('table.current'),
      translate('table.change'),
    ],
    ['left', 'right', 'right', 'right'],
    headlineMetricRows(report).map((row) => [
      translate(row.labelKey),
      row.baseline,
      row.current,
      row.change,
    ]),
  );
}

/** One line describing comparison confidence and workflow-shape match. */
export function renderConfidenceLine(
  report: AnalysisReport,
  translate: Translator,
): string {
  const runnerTime = findMetric(report, METRICS.runnerTime);
  const confidence = translateConfidence(
    translate,
    runnerTime?.confidence ?? 'low',
  );
  const parts = [
    `**${translate('label.confidence')}:** ${confidence}`,
    `**${translate('label.shapeMatch')}:** ${formatRatio(report.baseline.shapeSimilarity)}`,
    `**${translate('label.baselineSamples')}:** ${report.baseline.sampleCount}`,
  ];
  if (report.carbon !== undefined) {
    parts.push(
      `**${translate('label.dataQuality')}:** ${translateConfidence(
        translate,
        report.carbon.quality.grade,
      )}`,
    );
  }
  return parts.join(' · ');
}

/** Render the ranked regression table for jobs and steps. */
export function renderRegressionTable(
  report: AnalysisReport,
  translate: Translator,
  limit: number,
): string[] {
  const rows = [
    ...report.baseline.jobComparisons,
    ...report.baseline.stepComparisons,
  ]
    .filter((entry) => entry.verdict === 'regression')
    .sort(
      (left, right) => (right.percentChange ?? 0) - (left.percentChange ?? 0),
    )
    .slice(0, Math.max(1, limit))
    .map((entry) => [
      `\`${escapeMarkdown(truncate(entry.label, 90))}\``,
      formatDuration(entry.baselineMedian),
      formatDuration(entry.current),
      formatSignedPercent(entry.percentChange),
      formatNumber(entry.modifiedZScore, 2),
    ]);
  if (rows.length === 0) {
    return [`_${translate('label.none')}_`];
  }
  return renderTable(
    [
      `${translate('label.job')} / ${translate('label.step')}`,
      translate('table.baseline'),
      translate('table.current'),
      translate('table.change'),
      translate('label.zScore'),
    ],
    ['left', 'right', 'right', 'right', 'right'],
    rows,
  );
}

/** Render the collapsible estimation and data-provenance section. */
export function renderEstimationDetails(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const lines: string[] = [
    `- Runtime source: GitHub Actions API`,
    `- GreenCI version: \`${escapeMarkdown(report.greenciVersion)}\``,
    `- Report schema: \`${escapeMarkdown(report.schemaVersion)}\``,
    `- Config hash: \`${report.configHash.slice(0, 16)}\``,
    `- ${translate('baseline.fingerprint')}: \`${report.baseline.currentFingerprint.slice(0, 16)}\``,
  ];

  if (report.cost === undefined) {
    lines.push(
      `- ${translate('section.cost')}: ${translate('label.disabled')}`,
    );
  } else {
    lines.push(
      `- ${translate('cost.gross')}: ${formatUsd(report.cost.grossListPriceUsd)} (\`${escapeMarkdown(report.cost.modelVersion)}\`)`,
      `- ${translate('cost.billable')}: ${formatUsd(report.cost.estimatedBillableUsd)}`,
      `- ${translate('cost.billableMinutes')}: ${report.cost.billableMinutes}`,
      `- ${translate('cost.invoiceUnknown')}`,
    );
    if (report.cost.billingBasis === 'standard-public-free') {
      lines.push(`- ${translate('cost.publicFree')}`);
    }
    if (report.cost.unknownRunnerClasses.length > 0) {
      lines.push(
        `- ${translate('cost.unknownRunner', {
          classes: report.cost.unknownRunnerClasses
            .map((value) => escapeMarkdown(value))
            .join(', '),
        })}`,
      );
    }
  }

  if (report.carbon === undefined) {
    lines.push(
      `- ${translate('section.carbon')}: ${translate('label.disabled')}`,
    );
  } else {
    const carbon = report.carbon;
    lines.push(
      `- ${translate('carbon.model')}: \`${escapeMarkdown(carbon.modelVersion)}\``,
      `- ${translate('carbon.interval')}: ${formatGrams(carbon.operationalCarbonGrams.p05)} – ${formatGrams(carbon.operationalCarbonGrams.p95)}`,
      `- ${translate('carbon.region')}: ${escapeMarkdown(carbon.region)}${carbon.regionResolved ? '' : ' (fallback)'}`,
      `- ${translate('carbon.samples')}: ${carbon.simulationSamples}`,
      `- ${translate('carbon.seed')}: \`${carbon.seedHash.slice(0, 16)}\``,
      `- ${translate('label.dataQuality')}: ${translateConfidence(translate, carbon.quality.grade)} (${formatNumber(carbon.quality.score, 3)})`,
    );
    if (carbon.unknownRunnerClasses.length > 0) {
      lines.push(
        `- ${translate('carbon.unknownRunner', {
          classes: carbon.unknownRunnerClasses
            .map((value) => escapeMarkdown(value))
            .join(', '),
        })}`,
      );
    }
    lines.push(`- ${escapeMarkdown(carbon.measurementDisclaimer)}`);
  }

  lines.push(`- ${translate('section.dataSources')}:`);
  for (const dataset of report.dataManifest) {
    lines.push(
      `  - \`${escapeMarkdown(dataset.id)}@${escapeMarkdown(dataset.version)}\` — ${escapeMarkdown(truncate(dataset.source, 120))} (${escapeMarkdown(dataset.unit)}, sha256 \`${dataset.sha256.slice(0, 12)}\`)`,
    );
  }

  lines.push('', `_${translate('footer.notMeasured')}_`);
  return lines;
}

/** Render the shared warning list. */
export function renderWarnings(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  if (report.warnings.length === 0) {
    return [`- ${translate('warnings.none')}`];
  }
  return report.warnings.map(
    (warning) =>
      `- \`${warning.code}\` ${escapeMarkdown(truncate(warning.message, 400))} (${warning.source})`,
  );
}
