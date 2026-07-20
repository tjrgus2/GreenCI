import type { AnalysisReport, NormalizedJob } from '../domain/schemas.js';

/** Escape repository-controlled text before placing it in Markdown tables. */
export function escapeMarkdown(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('`', '\\`')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/\r?\n/g, '<br>');
}

/** Format seconds without producing NaN or infinite output. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return 'Unavailable';
  }
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return minutes === 0 ? `${remainder}s` : `${minutes}m ${remainder}s`;
}

function renderStepRows(job: NormalizedJob): string[] {
  if (job.steps.length === 0) {
    return [`| ${escapeMarkdown(job.apiName)} | — | — |`];
  }
  return job.steps.map(
    (step) =>
      `| ${escapeMarkdown(job.apiName)} | ${escapeMarkdown(step.name)} | ${formatDuration(step.durationSeconds)} |`,
  );
}

/** Render the complete Week 1 result for the GitHub Job Summary surface. */
export function renderJobSummary(report: AnalysisReport): string {
  const jobRows = report.jobs.map(
    (job) =>
      `| ${escapeMarkdown(job.apiName)} | ${escapeMarkdown(job.runnerClass)} | ${escapeMarkdown(job.conclusion)} | ${formatDuration(job.durationSeconds)} |`,
  );
  const stepRows = report.jobs.flatMap(renderStepRows);
  const warningLines = report.warnings.map(
    (warning) => `- ${escapeMarkdown(warning)}`,
  );

  return [
    '<!-- greenci-report:v1 -->',
    '',
    '# GreenCI Current-Run Report',
    '',
    `Run: \`${report.identity.runId}\` (attempt ${report.identity.runAttempt})`,
    '',
    '## Runtime',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Wall-clock time | ${formatDuration(report.current.wallClockSeconds)} |`,
    `| Total runner time | ${formatDuration(report.current.runnerSeconds)} |`,
    `| Peak concurrency | ${report.parallelism.peakConcurrency} |`,
    `| Average concurrency | ${report.parallelism.averageConcurrency.toFixed(3)} |`,
    `| Idle gaps | ${formatDuration(report.parallelism.idleSeconds)} |`,
    '',
    '## Jobs',
    '',
    '| Job | Runner class | Conclusion | Duration |',
    '|---|---|---|---:|',
    ...(jobRows.length === 0 ? ['| — | — | — | — |'] : jobRows),
    '',
    '## Steps',
    '',
    '| Job | Step | Duration |',
    '|---|---|---:|',
    ...(stepRows.length === 0 ? ['| — | — | — |'] : stepRows),
    '',
    '## Data quality and warnings',
    '',
    `Analyzer exclusion: ${escapeMarkdown(report.analyzerExclusion.method)}${report.analyzerExclusion.heuristic ? ' (heuristic)' : ''}`,
    '',
    ...(warningLines.length === 0 ? ['- No warnings.'] : warningLines),
    '',
    'Runtime values come from GitHub Actions timestamps. GreenCI does not directly measure energy in this Week 1 report.',
    '',
  ].join('\n');
}
