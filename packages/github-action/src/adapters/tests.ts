import { z } from 'zod';
import {
  DEFAULT_ZIP_LIMITS,
  TestReportSchema,
  parseJUnitArchive,
  type AnalysisWarning,
} from '@greenci/core';
import { describeError } from './errors.js';
import type { GitHubDataSource } from './github.js';

const ArtifactSchema = z
  .object({
    id: z.number().int().nonnegative(),
    name: z.string(),
    size_in_bytes: z.number().int().nonnegative().optional(),
    expired: z.boolean().optional(),
  })
  .passthrough();

const ArtifactListSchema = z.array(ArtifactSchema);

/** Hard limit on the compressed artifact GreenCI is willing to download. */
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

/** Parsed test results plus any non-fatal collection warnings. */
export interface TestReportCollection {
  readonly report: z.infer<typeof TestReportSchema> | undefined;
  readonly warnings: AnalysisWarning[];
}

/** Which artifact to analyze and under which limits. */
export interface TestReportRequest {
  readonly owner: string;
  readonly repository: string;
  readonly runId: number;
  readonly artifact: string;
  readonly maxUncompressedBytes: number;
  readonly maxFiles: number;
}

/**
 * Download and analyze one JUnit artifact.
 *
 * The archive is attacker-controlled in a fork pull request, so it is read
 * entirely in memory by the hardened ZIP reader and is never written to disk.
 * Every failure degrades to a warning instead of failing the GreenCI job.
 */
export async function collectTestReport(
  source: GitHubDataSource,
  request: TestReportRequest,
): Promise<TestReportCollection> {
  let rawList: unknown;
  try {
    rawList = await source.listArtifacts({
      owner: request.owner,
      repository: request.repository,
      runId: request.runId,
    });
  } catch (error: unknown) {
    return {
      report: undefined,
      warnings: [
        {
          code: 'TEST_ARTIFACT_UNAVAILABLE',
          source: 'github-api',
          message: `Artifacts could not be listed (${describeError(error)}); the test report was skipped.`,
        },
      ],
    };
  }

  const parsed = ArtifactListSchema.safeParse(rawList);
  const artifact = parsed.success
    ? parsed.data.find(
        (entry) => entry.name === request.artifact && entry.expired !== true,
      )
    : undefined;
  if (artifact === undefined) {
    return {
      report: undefined,
      warnings: [
        {
          code: 'TEST_ARTIFACT_UNAVAILABLE',
          source: 'github-api',
          message: `No usable artifact named "${request.artifact}" was found in this run.`,
        },
      ],
    };
  }
  if ((artifact.size_in_bytes ?? 0) > MAX_ARTIFACT_BYTES) {
    return {
      report: undefined,
      warnings: [
        {
          code: 'TEST_ARTIFACT_UNSAFE',
          source: 'action',
          message: `Artifact "${request.artifact}" exceeds the ${MAX_ARTIFACT_BYTES}-byte download limit and was not fetched.`,
        },
      ],
    };
  }

  let archive: Buffer;
  try {
    const bytes = await source.downloadArtifact({
      owner: request.owner,
      repository: request.repository,
      artifactId: artifact.id,
    });
    archive = Buffer.from(bytes);
  } catch (error: unknown) {
    return {
      report: undefined,
      warnings: [
        {
          code: 'TEST_ARTIFACT_UNAVAILABLE',
          source: 'github-api',
          message: `Artifact "${request.artifact}" could not be downloaded (${describeError(error)}).`,
        },
      ],
    };
  }

  if (archive.byteLength > MAX_ARTIFACT_BYTES) {
    return {
      report: undefined,
      warnings: [
        {
          code: 'TEST_ARTIFACT_UNSAFE',
          source: 'action',
          message: `Artifact "${request.artifact}" exceeded the download limit after transfer and was discarded.`,
        },
      ],
    };
  }

  const summary = parseJUnitArchive(archive, {
    zipLimits: {
      ...DEFAULT_ZIP_LIMITS,
      maxEntries: request.maxFiles,
      maxTotalUncompressedBytes: request.maxUncompressedBytes,
    },
  });

  const warnings: AnalysisWarning[] = [];
  if (summary.rejections.length > 0) {
    warnings.push({
      code: 'TEST_ARTIFACT_UNSAFE',
      source: 'action',
      message: `${summary.rejections.length} archive member(s) were refused: ${summary.rejections
        .slice(0, 5)
        .map((rejection) => rejection.reason)
        .join(', ')}.`,
    });
  }
  if (summary.total === 0 && summary.parsedFiles === 0) {
    warnings.push({
      code: 'TEST_ARTIFACT_UNAVAILABLE',
      source: 'action',
      message: `Artifact "${request.artifact}" contained no readable JUnit XML file.`,
    });
    return { report: undefined, warnings };
  }

  return {
    report: TestReportSchema.parse({
      artifact: request.artifact,
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      errored: summary.errored,
      skipped: summary.skipped,
      durationSeconds: summary.durationSeconds,
      parsedFiles: summary.parsedFiles,
      truncated: summary.truncated,
      slowestSuites: summary.slowestSuites,
      slowestCases: summary.slowestCases,
      failedCases: summary.failedCases,
      rejections: summary.rejections.map((rejection) => ({
        path: rejection.path,
        reason: rejection.reason,
      })),
    }),
    warnings,
  };
}
