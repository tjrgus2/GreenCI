import type { AnalysisReport } from '../domain/report.js';
import {
  renderConfidenceLine,
  renderEstimationDetails,
  renderHeadline,
  renderMetricTable,
  renderRegressionTable,
  reportMarker,
} from './common.js';
import {
  escapeMarkdown,
  formatDuration,
  formatRatio,
  truncate,
} from './format.js';
import { createTranslator } from './i18n/index.js';
import { renderPolicyBadge, renderRecommendationsSection } from './sections.js';

export { REPORT_MARKER_PREFIX, reportMarker } from './common.js';

/** A compact critical-path line, or nothing when it is unavailable. */
function renderCriticalPathBrief(
  report: AnalysisReport,
  translate: ReturnType<typeof createTranslator>,
): string[] {
  const criticalPath = report.criticalPath;
  if (criticalPath.method === 'unavailable' || criticalPath.path.length === 0) {
    return [];
  }
  const top = criticalPath.path
    .map((node) => `\`${escapeMarkdown(truncate(node.label, 40))}\``)
    .join(' → ');
  const suffix =
    criticalPath.method === 'interval-fallback'
      ? ` _(${translate('criticalPath.method.interval-fallback')})_`
      : '';
  return [
    `**${translate('section.criticalPath')}:** ${top} · ${formatDuration(criticalPath.totalSeconds)} · ${formatRatio(
      criticalPath.wallClockSharePercent / 100,
    )}${suffix}`,
    '',
  ];
}

/**
 * Render the concise pull-request comment.
 *
 * The comment answers, in order, whether CI regressed, by how much, which
 * nodes caused it, and how the estimate was produced. Detailed tables stay in
 * the Job Summary and the JSON artifact.
 */
export function renderPullRequestComment(
  report: AnalysisReport,
  options: { readonly topHotspots?: number } = {},
): string {
  const translate = createTranslator(report.locale);
  const limit = options.topHotspots ?? 5;
  return [
    reportMarker(report.identity.workflowPath),
    '',
    `# ${translate('report.title')}`,
    '',
    `> ${renderHeadline(report, translate)}`,
    '',
    ...renderMetricTable(report, translate),
    '',
    renderConfidenceLine(report, translate),
    '',
    `## ${translate('section.topRegressions')}`,
    '',
    ...renderRegressionTable(report, translate, limit),
    '',
    ...renderCriticalPathBrief(report, translate),
    ...renderRecommendationsSection(report, translate, {
      withEvidence: false,
      limit,
    }),
    '',
    renderPolicyBadge(report, translate),
    '',
    '<details>',
    `<summary>${translate('section.details')}</summary>`,
    '',
    ...renderEstimationDetails(report, translate),
    '',
    '</details>',
    '',
    `<sub>${translate('footer.generated', {
      version: report.greenciVersion,
      schema: report.schemaVersion,
      locale: report.locale,
    })} · run <code>${report.identity.runId}</code> · <code>${escapeMarkdown(
      truncate(report.identity.workflowPath, 120),
    )}</code></sub>`,
    '',
  ].join('\n');
}
