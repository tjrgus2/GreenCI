import type { AnalysisReport } from '../domain/report.js';
import {
  REPORT_MARKER,
  renderConfidenceLine,
  renderEstimationDetails,
  renderHeadline,
  renderMetricTable,
  renderRegressionTable,
} from './common.js';
import { escapeMarkdown, truncate } from './format.js';
import { createTranslator } from './i18n/index.js';

export { REPORT_MARKER } from './common.js';

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
    REPORT_MARKER,
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
