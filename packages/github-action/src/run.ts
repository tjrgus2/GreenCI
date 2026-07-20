import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AnalysisReportSchema,
  analyzeWorkflow,
  renderJobSummary,
  type AnalysisReport,
} from '@greenci/core';
import { collectCurrentRun, type GitHubDataSource } from './adapters/github.js';
import { parseActionInputs } from './config/inputs.js';

/** Side effects supplied by the GitHub Actions entrypoint. */
export interface ActionIO {
  getInput(name: string): string;
  info(message: string): void;
  warning(message: string): void;
  setOutput(name: string, value: string | number): void;
  writeSummary(markdown: string): Promise<void>;
  uploadArtifact(
    name: string,
    files: readonly string[],
    rootDirectory: string,
  ): Promise<void>;
}

/** Environment values used to identify a GitHub Actions run. */
export interface ActionEnvironment {
  readonly GITHUB_REPOSITORY?: string;
  readonly GITHUB_RUN_ID?: string;
  readonly GITHUB_RUN_ATTEMPT?: string;
  readonly GITHUB_JOB?: string;
  readonly RUNNER_TEMP?: string;
}

/** Injected dependencies used to keep action orchestration testable. */
export interface ActionDependencies {
  readonly createSource: (token: string) => GitHubDataSource;
  readonly now: () => Date;
  readonly workingDirectory: string;
}

function parseEnvironment(environment: ActionEnvironment): {
  owner: string;
  repository: string;
  runId: number;
  runAttempt: number;
} {
  const repositoryParts = environment.GITHUB_REPOSITORY?.split('/') ?? [];
  const runId = Number(environment.GITHUB_RUN_ID);
  const runAttempt = Number(environment.GITHUB_RUN_ATTEMPT ?? '1');
  if (
    repositoryParts.length !== 2 ||
    repositoryParts.some((part) => part.length === 0) ||
    !Number.isSafeInteger(runId) ||
    runId < 0 ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1
  ) {
    throw new Error('Current GitHub workflow run could not be identified.');
  }
  const [owner, repository] = repositoryParts;
  if (owner === undefined || repository === undefined) {
    throw new Error('GITHUB_REPOSITORY must contain owner/repository.');
  }
  return { owner, repository, runId, runAttempt };
}

async function writeReport(
  reportPath: string,
  report: AnalysisReport,
): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function appendWarning(
  report: AnalysisReport,
  warning: string,
): AnalysisReport {
  return AnalysisReportSchema.parse({
    ...report,
    warnings: [...report.warnings, warning],
  });
}

/** Execute the Week 1 current-run Action workflow. */
export async function executeAction(
  io: ActionIO,
  environment: ActionEnvironment,
  dependencies: ActionDependencies,
): Promise<AnalysisReport> {
  const inputs = parseActionInputs((name) => io.getInput(name));
  const reference = parseEnvironment(environment);
  io.info('[GreenCI] INFO  collection.current_jobs started');
  const source = dependencies.createSource(inputs.githubToken);
  const collected = await collectCurrentRun(source, reference);
  io.info(
    `[GreenCI] INFO  collection.current_jobs completed jobs=${collected.jobs.length}`,
  );

  let report = analyzeWorkflow({
    identity: collected.identity,
    jobs: collected.jobs,
    ...(environment.GITHUB_JOB === undefined
      ? {}
      : { currentJobName: environment.GITHUB_JOB }),
    generatedAt: dependencies.now().toISOString(),
  });

  if (inputs.locale !== 'en') {
    report = appendWarning(
      report,
      'Korean rendering is scheduled after the Week 1 exit gate; this report uses English.',
    );
  }
  if (inputs.parseFailureLogs) {
    report = appendWarning(
      report,
      'Failure-log parsing is disabled in the Week 1 current-run implementation.',
    );
  }

  const reportPath = resolve(
    environment.RUNNER_TEMP ?? dependencies.workingDirectory,
    'greenci-report.json',
  );
  await writeReport(reportPath, report);

  try {
    await io.writeSummary(renderJobSummary(report));
    io.info('[GreenCI] INFO  report.summary written');
  } catch {
    const warning =
      'Job Summary publication failed; the JSON report remains available.';
    io.warning(`[GreenCI] WARN  report.summary failed`);
    report = appendWarning(report, warning);
    await writeReport(reportPath, report);
  }

  if (inputs.uploadReportArtifact) {
    try {
      await io.uploadArtifact(
        'greenci-report',
        [reportPath],
        dirname(reportPath),
      );
      io.info('[GreenCI] INFO  report.artifact uploaded');
    } catch {
      const warning =
        'Report artifact upload failed; the local JSON report remains available.';
      io.warning('[GreenCI] WARN  report.artifact failed');
      report = appendWarning(report, warning);
      await writeReport(reportPath, report);
    }
  }

  io.setOutput('report-path', reportPath);
  io.setOutput('runner-seconds', report.current.runnerSeconds);
  io.setOutput('carbon-p50-grams', '');
  io.setOutput('carbon-p95-grams', '');
  io.setOutput('list-price-usd', '');
  io.setOutput('policy-conclusion', 'skipped');
  return report;
}
