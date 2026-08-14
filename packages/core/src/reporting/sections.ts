import type { AnalysisReport } from '../domain/report.js';
import { translateConfidence } from './common.js';
import {
  escapeMarkdown,
  formatDuration,
  formatGrams,
  formatNumber,
  formatRatio,
  formatUsd,
  renderTable,
  truncate,
} from './format.js';
import type { MessageKey, Translator } from './i18n/index.js';

type Recommendation = AnalysisReport['recommendations'][number];
type PolicyResult = AnalysisReport['policy'];

const SEVERITY_ICON: Readonly<Record<Recommendation['severity'], string>> = {
  critical: '🔴',
  warning: '🟠',
  info: '🔵',
};

const POLICY_ICON: Readonly<Record<PolicyResult['conclusion'], string>> = {
  pass: '✅',
  warn: '⚠',
  fail: '❌',
  skipped: 'ℹ',
};

const POLICY_KEY: Readonly<Record<PolicyResult['conclusion'], MessageKey>> = {
  pass: 'policy.conclusion.pass',
  warn: 'policy.conclusion.warn',
  fail: 'policy.conclusion.fail',
  skipped: 'policy.conclusion.skipped',
};

const CRITICAL_PATH_KEY: Readonly<
  Record<AnalysisReport['criticalPath']['method'], MessageKey>
> = {
  dag: 'criticalPath.method.dag',
  'interval-fallback': 'criticalPath.method.interval-fallback',
  unavailable: 'criticalPath.method.unavailable',
};

/** One line stating the policy outcome, safe for any surface. */
export function renderPolicyBadge(
  report: AnalysisReport,
  translate: Translator,
): string {
  const conclusion = report.policy.conclusion;
  return `${POLICY_ICON[conclusion]} **${translate('section.policy')}:** ${translate(
    POLICY_KEY[conclusion],
  )}`;
}

/** The critical path, always labelled with how it was obtained. */
export function renderCriticalPathSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const criticalPath = report.criticalPath;
  const lines = [
    `## ${translate('section.criticalPath')}`,
    '',
    `_${translate(CRITICAL_PATH_KEY[criticalPath.method])} · ${translate('label.confidence')}: ${translateConfidence(translate, criticalPath.confidence)}_`,
    '',
  ];
  if (criticalPath.method === 'unavailable' || criticalPath.path.length === 0) {
    return [...lines, `_${translate('label.unavailable')}_`];
  }
  return [
    ...lines,
    `- ${translate('criticalPath.total')}: ${formatDuration(criticalPath.totalSeconds)}`,
    `- ${translate('criticalPath.share')}: ${formatRatio(criticalPath.wallClockSharePercent / 100)}`,
    '',
    ...renderTable(
      [
        translate('label.job'),
        translate('label.duration'),
        translate('label.contribution'),
      ],
      ['left', 'right', 'right'],
      criticalPath.path.map((node) => [
        `\`${escapeMarkdown(truncate(node.label, 90))}\``,
        formatDuration(node.durationSeconds),
        formatRatio(node.contributionPercent / 100),
      ]),
    ),
    '',
    `### ${translate('section.hotspots')}`,
    '',
    ...renderTable(
      [
        translate('label.job'),
        translate('metric.runnerTime'),
        translate('label.runnerShare'),
      ],
      ['left', 'right', 'right'],
      criticalPath.nonCriticalHotspots.map((hotspot) => [
        `\`${escapeMarkdown(truncate(hotspot.label, 90))}\``,
        formatDuration(hotspot.runnerSeconds),
        formatRatio(hotspot.runnerSharePercent / 100),
      ]),
    ),
    '',
    `_${translate('criticalPath.waiting')}_`,
  ];
}

/** Failed jobs, failed steps, and how late the failure landed. */
export function renderFailuresSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const failures = report.failures;
  if (failures.failedJobCount === 0) {
    return [
      `## ${translate('section.failures')}`,
      '',
      `_${translate('failures.none')}_`,
    ];
  }
  return [
    `## ${translate('section.failures')}`,
    '',
    ...(failures.firstFailureWallClockPercent === undefined
      ? []
      : [
          `- ${translate('failures.position')}: ${formatRatio(failures.firstFailureWallClockPercent / 100)}`,
          '',
        ]),
    ...renderTable(
      [
        translate('failures.job'),
        translate('label.conclusion'),
        translate('failures.step'),
        translate('failures.before'),
      ],
      ['left', 'left', 'left', 'right'],
      failures.failures.map((failure) => [
        `\`${escapeMarkdown(truncate(failure.jobName, 90))}\``,
        escapeMarkdown(failure.conclusion),
        failure.failedStepName === undefined
          ? '—'
          : `\`${escapeMarkdown(truncate(failure.failedStepName, 90))}\``,
        formatDuration(failure.secondsBeforeFailure),
      ]),
    ),
  ];
}

function impactLine(
  recommendation: Recommendation,
  translate: Translator,
): string | undefined {
  const impact = recommendation.estimatedImpact;
  if (impact === undefined) {
    return undefined;
  }
  const parts = [
    impact.runnerSeconds === undefined
      ? undefined
      : formatDuration(impact.runnerSeconds),
    impact.costUsd === undefined ? undefined : formatUsd(impact.costUsd),
    impact.carbonGrams === undefined
      ? undefined
      : formatGrams(impact.carbonGrams),
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0
    ? undefined
    : `  - ${translate('recommendation.impact')}: ${parts.join(' · ')}`;
}

/** Recommendations with rule id, confidence, evidence, and bounded impact. */
export function renderRecommendationsSection(
  report: AnalysisReport,
  translate: Translator,
  options: { readonly withEvidence: boolean; readonly limit: number },
): string[] {
  const recommendations = report.recommendations.slice(
    0,
    Math.max(0, options.limit),
  );
  if (recommendations.length === 0) {
    return [
      `## ${translate('section.recommendations')}`,
      '',
      `_${translate('recommendation.none')}_`,
    ];
  }
  const lines: string[] = [`## ${translate('section.recommendations')}`, ''];
  for (const recommendation of recommendations) {
    lines.push(
      `- ${SEVERITY_ICON[recommendation.severity]} \`${escapeMarkdown(recommendation.ruleId)}\` **${escapeMarkdown(recommendation.title)}** (${translate('label.confidence')} ${formatNumber(recommendation.confidence, 2)})`,
      `  - ${escapeMarkdown(recommendation.explanation)}`,
    );
    if (options.withEvidence) {
      for (const evidence of recommendation.evidence) {
        lines.push(
          `  - ${translate('recommendation.evidence')} \`${escapeMarkdown(evidence.metric)}\`: ${escapeMarkdown(truncate(String(evidence.observed), 120))}${
            evidence.baseline === undefined
              ? ''
              : ` (${translate('table.baseline')}: ${escapeMarkdown(truncate(String(evidence.baseline), 60))})`
          } — ${escapeMarkdown(truncate(evidence.source, 80))}`,
        );
      }
    }
    const impact = impactLine(recommendation, translate);
    if (impact !== undefined) {
      lines.push(impact);
    }
  }
  lines.push('', `_${translate('recommendation.disclaimer')}_`);
  return lines;
}

/** Every policy evaluation, including the ones that were not enforced. */
export function renderPolicySection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const policy = report.policy;
  const lines = [
    `## ${translate('section.policy')}`,
    '',
    renderPolicyBadge(report, translate),
    '',
  ];
  if (policy.evaluations.length === 0) {
    return lines;
  }
  return [
    ...lines,
    ...renderTable(
      [
        translate('policy.rule'),
        translate('policy.actual'),
        translate('policy.threshold'),
        translate('policy.mode'),
        translate('label.confidence'),
        translate('policy.result'),
      ],
      ['left', 'right', 'right', 'left', 'left', 'left'],
      policy.evaluations.map((evaluation) => [
        `\`${escapeMarkdown(evaluation.metric)}\` ${escapeMarkdown(evaluation.operator)}`,
        evaluation.actual === undefined
          ? '—'
          : formatNumber(evaluation.actual, 2),
        formatNumber(evaluation.threshold, 2),
        escapeMarkdown(evaluation.mode),
        translateConfidence(translate, evaluation.confidence),
        !evaluation.evaluated
          ? translate('policy.notEvaluated')
          : evaluation.passed
            ? translate('policy.passed')
            : translate('policy.violated'),
      ]),
    ),
    '',
    ...policy.evaluations
      .filter((evaluation) => !evaluation.passed || !evaluation.evaluated)
      .map(
        (evaluation) =>
          `- \`${escapeMarkdown(evaluation.ruleId)}\`: ${escapeMarkdown(evaluation.explanation)}`,
      ),
  ];
}

/** JUnit results, including every archive member that was refused. */
export function renderTestsSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const tests = report.tests;
  if (tests === undefined) {
    return [
      `## ${translate('section.tests')}`,
      '',
      `_${translate('tests.unavailable')}_`,
    ];
  }
  return [
    `## ${translate('section.tests')}`,
    '',
    `\`${escapeMarkdown(truncate(tests.artifact, 90))}\``,
    '',
    ...renderTable(
      [translate('table.metric'), translate('table.value')],
      ['left', 'right'],
      [
        [translate('tests.total'), String(tests.total)],
        [translate('tests.passed'), String(tests.passed)],
        [translate('tests.failed'), String(tests.failed)],
        [translate('tests.errored'), String(tests.errored)],
        [translate('tests.skipped'), String(tests.skipped)],
        [translate('tests.duration'), formatDuration(tests.durationSeconds)],
      ],
    ),
    '',
    `### ${translate('tests.slowestCases')}`,
    '',
    ...renderTable(
      ['suite', translate('label.step'), translate('label.duration')],
      ['left', 'left', 'right'],
      tests.slowestCases.map((testCase) => [
        escapeMarkdown(truncate(testCase.suite, 60)),
        escapeMarkdown(truncate(testCase.name, 80)),
        formatDuration(testCase.durationSeconds),
      ]),
    ),
    '',
    `### ${translate('tests.failedCases')}`,
    '',
    ...renderTable(
      ['suite', translate('label.step'), 'message'],
      ['left', 'left', 'left'],
      tests.failedCases.map((testCase) => [
        escapeMarkdown(truncate(testCase.suite, 60)),
        escapeMarkdown(truncate(testCase.name, 80)),
        escapeMarkdown(truncate(testCase.message ?? '—', 120)),
      ]),
    ),
    ...(tests.rejections.length === 0
      ? []
      : [
          '',
          `### ${translate('tests.rejected')}`,
          '',
          ...tests.rejections.map(
            (rejection) =>
              `- \`${escapeMarkdown(truncate(rejection.path, 120))}\`: ${escapeMarkdown(rejection.reason)}`,
          ),
        ]),
  ];
}

/** Sanitized diagnostics, or a clear statement that parsing is disabled. */
export function renderDiagnosticsSection(
  report: AnalysisReport,
  translate: Translator,
): string[] {
  const diagnostics = report.diagnostics;
  if (diagnostics === undefined || !diagnostics.enabled) {
    return [
      `## ${translate('section.diagnostics')}`,
      '',
      `_${translate('diagnostics.disabled')}_`,
    ];
  }
  if (diagnostics.diagnostics.length === 0) {
    return [
      `## ${translate('section.diagnostics')}`,
      '',
      `_${translate('diagnostics.none')}_`,
      '',
      `_${translate('diagnostics.privacy')}_`,
    ];
  }
  return [
    `## ${translate('section.diagnostics')}`,
    '',
    ...renderTable(
      [
        translate('label.job'),
        'parser',
        'severity',
        'location',
        'message',
        translate('label.confidence'),
      ],
      ['left', 'left', 'left', 'left', 'left', 'right'],
      diagnostics.diagnostics.map((entry) => [
        `\`${escapeMarkdown(truncate(entry.jobName, 60))}\``,
        escapeMarkdown(entry.parserId),
        escapeMarkdown(entry.severity),
        entry.file === undefined
          ? '—'
          : `\`${escapeMarkdown(truncate(entry.file, 80))}${entry.line === undefined ? '' : `:${entry.line}`}\``,
        escapeMarkdown(truncate(entry.message, 160)),
        formatNumber(entry.confidence, 2),
      ]),
    ),
    '',
    `_${translate('diagnostics.privacy')}_`,
  ];
}
