import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AnalysisReportSchema,
  WorkflowRunIdentitySchema,
  analyzeWorkflow,
  renderJobSummary,
  renderPullRequestComment,
  resolveConfig,
  type AnalysisReport,
  type AnalysisWarning,
  type ResolvedConfig,
  type WorkflowRunIdentity,
} from '@greenci/core';
import { collectBaseline } from './adapters/baseline.js';
import { publishPullRequestComment } from './adapters/comments.js';
import { collectCurrentRun, type GitHubDataSource } from './adapters/github.js';
import { parseActionInputs } from './config/inputs.js';
import { loadRepositoryConfig } from './config/repository-config.js';

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
  readonly GITHUB_REF?: string;
  readonly GITHUB_BASE_REF?: string;
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

function pullRequestNumberFromRef(ref: string | undefined): number | undefined {
  const match = /^refs\/pull\/(?<number>\d+)\//u.exec(ref ?? '');
  const value = Number(match?.groups?.['number']);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * Fill pull-request identity from the runner environment when the workflow-run
 * payload does not carry it, which happens for several pull-request triggers.
 */
export function withEventIdentity(
  identity: WorkflowRunIdentity,
  environment: ActionEnvironment,
): WorkflowRunIdentity {
  const baseRef = environment.GITHUB_BASE_REF ?? '';
  const pullRequestNumber =
    identity.pullRequestNumber ??
    pullRequestNumberFromRef(environment.GITHUB_REF);
  if (
    identity.baseBranch !== undefined &&
    identity.pullRequestNumber !== undefined
  ) {
    return identity;
  }
  return WorkflowRunIdentitySchema.parse({
    ...identity,
    ...(identity.baseBranch === undefined && baseRef.length > 0
      ? { baseBranch: baseRef }
      : {}),
    ...(pullRequestNumber === undefined ? {} : { pullRequestNumber }),
  });
}

/** Choose the branch whose successful runs form the baseline. */
export function resolveBaselineBranch(
  identity: WorkflowRunIdentity,
  config: ResolvedConfig,
): string | undefined {
  if (identity.baseBranch !== undefined && identity.baseBranch.length > 0) {
    return identity.baseBranch;
  }
  if (config.baseline.branch !== undefined) {
    return config.baseline.branch;
  }
  return identity.headBranch.length > 0 ? identity.headBranch : undefined;
}

async function writeReport(
  reportPath: string,
  report: AnalysisReport,
): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function appendWarnings(
  report: AnalysisReport,
  warnings: readonly AnalysisWarning[],
): AnalysisReport {
  if (warnings.length === 0) {
    return report;
  }
  return AnalysisReportSchema.parse({
    ...report,
    warnings: [...report.warnings, ...warnings],
  });
}

/** Execute the GreenCI Action end to end. */
export async function executeAction(
  io: ActionIO,
  environment: ActionEnvironment,
  dependencies: ActionDependencies,
): Promise<AnalysisReport> {
  const inputs = parseActionInputs((name) => io.getInput(name));
  const reference = parseEnvironment(environment);
  const source = dependencies.createSource(inputs.githubToken);

  io.info('[GreenCI] INFO  collection.current_jobs started');
  const collected = await collectCurrentRun(source, reference);
  const identity = withEventIdentity(collected.identity, environment);
  for (const warning of collected.warnings) {
    io.warning(
      `[GreenCI] WARN  repository.metadata degraded code=${warning.code}`,
    );
  }
  io.info(
    `[GreenCI] INFO  collection.current_jobs completed jobs=${collected.jobs.length}`,
  );

  const repositoryConfig = await loadRepositoryConfig(source, {
    owner: reference.owner,
    repository: reference.repository,
    path: inputs.configPath,
    ref: identity.headSha,
  });
  for (const warning of repositoryConfig.warnings) {
    io.warning(`[GreenCI] WARN  config degraded code=${warning.code}`);
  }
  const overrides = {
    ...(inputs.locale === undefined ? {} : { locale: inputs.locale }),
    ...(inputs.baselineRuns === undefined
      ? {}
      : { baselineRuns: inputs.baselineRuns }),
  };
  const resolution = resolveConfig(repositoryConfig.raw, overrides);

  const baselineBranch = resolveBaselineBranch(identity, resolution.config);
  io.info(
    `[GreenCI] INFO  collection.baseline started branch=${baselineBranch ?? 'none'}`,
  );
  const baseline = await collectBaseline(source, {
    owner: reference.owner,
    repository: reference.repository,
    workflowId: identity.workflowId,
    branch: baselineBranch,
    currentRunId: identity.runId,
    maxRuns: resolution.config.baseline.maxRuns,
  });
  for (const warning of baseline.warnings) {
    io.warning(`[GreenCI] WARN  baseline degraded code=${warning.code}`);
  }
  io.info(
    `[GreenCI] INFO  collection.baseline completed runs=${baseline.samples.length}`,
  );

  let report = analyzeWorkflow({
    identity,
    jobs: collected.jobs,
    ...(environment.GITHUB_JOB === undefined
      ? {}
      : { currentJobName: environment.GITHUB_JOB }),
    generatedAt: dependencies.now().toISOString(),
    warnings: [
      ...collected.warnings,
      ...repositoryConfig.warnings,
      ...baseline.warnings,
    ],
    ...(repositoryConfig.raw === undefined
      ? {}
      : { config: repositoryConfig.raw }),
    ...overrides,
    baseline: {
      available: baseline.available,
      ...(baseline.branch === undefined ? {} : { branch: baseline.branch }),
      samples: baseline.samples,
    },
  });
  io.info(
    `[GreenCI] INFO  analysis.completed baseline_samples=${report.baseline.sampleCount} status=${report.baseline.status}`,
  );

  const reportPath = resolve(
    environment.RUNNER_TEMP ?? dependencies.workingDirectory,
    'greenci-report.json',
  );
  await writeReport(reportPath, report);

  if (resolution.config.report.jobSummary) {
    try {
      await io.writeSummary(renderJobSummary(report));
      io.info('[GreenCI] INFO  report.summary written');
    } catch {
      io.warning('[GreenCI] WARN  report.summary failed');
      report = appendWarnings(report, [
        {
          code: 'SUMMARY_PUBLISH_FAILED',
          source: 'action',
          message:
            'Job Summary publication failed; the JSON report remains available.',
        },
      ]);
    }
  }

  if (
    resolution.config.report.prComment &&
    identity.pullRequestNumber !== undefined
  ) {
    const publication = await publishPullRequestComment(source, {
      owner: reference.owner,
      repository: reference.repository,
      pullRequestNumber: identity.pullRequestNumber,
      body: renderPullRequestComment(report, {
        topHotspots: resolution.config.report.topHotspots,
      }),
      updateExisting: resolution.config.report.updateExistingComment,
    });
    for (const warning of publication.warnings) {
      io.warning(`[GreenCI] WARN  report.comment code=${warning.code}`);
    }
    io.info(`[GreenCI] INFO  report.comment ${publication.action}`);
    report = appendWarnings(report, publication.warnings);
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
      io.warning('[GreenCI] WARN  report.artifact failed');
      report = appendWarnings(report, [
        {
          code: 'ARTIFACT_UPLOAD_FAILED',
          source: 'action',
          message:
            'Report artifact upload failed; the local JSON report remains available.',
        },
      ]);
    }
  }

  await writeReport(reportPath, report);

  io.setOutput('report-path', reportPath);
  io.setOutput('runner-seconds', report.current.runnerSeconds);
  io.setOutput(
    'carbon-p50-grams',
    report.carbon?.operationalCarbonGrams.p50 ?? '',
  );
  io.setOutput(
    'carbon-p95-grams',
    report.carbon?.operationalCarbonGrams.p95 ?? '',
  );
  io.setOutput('list-price-usd', report.cost?.grossListPriceUsd ?? '');
  io.setOutput('policy-conclusion', 'skipped');
  return report;
}
