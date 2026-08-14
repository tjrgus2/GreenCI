import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { readZipEntries, type ZipLimits, type ZipRejection } from './zip.js';

/** Bounds applied while parsing JUnit XML. */
export interface JUnitLimits {
  readonly maxXmlBytes: number;
  readonly maxTestCases: number;
  readonly maxReportedCases: number;
}

/** Conservative defaults taken from the design contract. */
export const DEFAULT_JUNIT_LIMITS: JUnitLimits = {
  maxXmlBytes: 5 * 1024 * 1024,
  maxTestCases: 100_000,
  maxReportedCases: 10,
};

/** Outcome of one test case. */
export type TestCaseStatus = 'passed' | 'failed' | 'error' | 'skipped';

/** One reported test case. */
export interface TestCaseSummary {
  readonly suite: string;
  readonly name: string;
  readonly durationSeconds: number;
  readonly status: TestCaseStatus;
  readonly message?: string;
}

/** One reported suite. */
export interface TestSuiteSummary {
  readonly name: string;
  readonly total: number;
  readonly failed: number;
  readonly durationSeconds: number;
}

/** Aggregated JUnit results plus every safety decision that was taken. */
export interface TestReportSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errored: number;
  readonly skipped: number;
  readonly durationSeconds: number;
  readonly slowestSuites: readonly TestSuiteSummary[];
  readonly slowestCases: readonly TestCaseSummary[];
  readonly failedCases: readonly TestCaseSummary[];
  readonly parsedFiles: number;
  readonly skippedFiles: readonly string[];
  readonly rejections: readonly ZipRejection[];
  readonly truncated: boolean;
}

/**
 * XML parser hardened for untrusted input: entity processing is disabled, so
 * no entity-expansion payload can be amplified, and no value is coerced.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  htmlEntities: false,
  trimValues: true,
});

const NodeSchema = z.looseObject({});
const NodesSchema = z.union([NodeSchema, z.array(NodeSchema)]);

function asArray(value: unknown): Record<string, unknown>[] {
  const parsed = NodesSchema.safeParse(value);
  if (!parsed.success) {
    return [];
  }
  const data = parsed.data;
  return Array.isArray(data) ? data : [data];
}

function attribute(node: Record<string, unknown>, name: string): string {
  const value = node[`@_${name}`];
  return typeof value === 'string' ? value : '';
}

function seconds(node: Record<string, unknown>): number {
  const parsed = Number.parseFloat(attribute(node, 'time'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function firstMessage(node: unknown): string | undefined {
  const entries = asArray(node);
  const first = entries[0];
  if (first === undefined) {
    return undefined;
  }
  const message = attribute(first, 'message');
  return message.length > 0 ? message : undefined;
}

function statusOf(node: Record<string, unknown>): {
  status: TestCaseStatus;
  message?: string;
} {
  if (node['failure'] !== undefined) {
    const message = firstMessage(node['failure']);
    return { status: 'failed', ...(message === undefined ? {} : { message }) };
  }
  if (node['error'] !== undefined) {
    const message = firstMessage(node['error']);
    return { status: 'error', ...(message === undefined ? {} : { message }) };
  }
  if (node['skipped'] !== undefined) {
    return { status: 'skipped' };
  }
  return { status: 'passed' };
}

function collectSuites(node: unknown): Record<string, unknown>[] {
  const suites = asArray(node);
  return suites.flatMap((suite) => [
    suite,
    ...collectSuites(suite['testsuite']),
  ]);
}

interface Accumulator {
  cases: TestCaseSummary[];
  suites: TestSuiteSummary[];
  truncated: boolean;
}

function accumulate(document: unknown, into: Accumulator, limits: JUnitLimits) {
  const root = NodeSchema.safeParse(document);
  if (!root.success) {
    return;
  }
  const record = root.data as Record<string, unknown>;
  const suites = [
    ...collectSuites(record['testsuites']),
    ...collectSuites(record['testsuite']),
  ];
  for (const suite of suites) {
    const suiteName = attribute(suite, 'name') || '(unnamed suite)';
    const cases = asArray(suite['testcase']);
    if (cases.length === 0) {
      continue;
    }
    let suiteFailed = 0;
    let suiteSeconds = 0;
    for (const testCase of cases) {
      if (into.cases.length >= limits.maxTestCases) {
        into.truncated = true;
        break;
      }
      const outcome = statusOf(testCase);
      const durationSeconds = seconds(testCase);
      suiteSeconds += durationSeconds;
      if (outcome.status === 'failed' || outcome.status === 'error') {
        suiteFailed += 1;
      }
      into.cases.push({
        suite: suiteName,
        name: attribute(testCase, 'name') || '(unnamed test)',
        durationSeconds,
        status: outcome.status,
        ...(outcome.message === undefined ? {} : { message: outcome.message }),
      });
    }
    into.suites.push({
      name: suiteName,
      total: cases.length,
      failed: suiteFailed,
      durationSeconds: suiteSeconds > 0 ? suiteSeconds : seconds(suite),
    });
  }
}

/**
 * Parse every JUnit XML file inside an artifact archive.
 *
 * The archive is read with the hardened ZIP reader, so path traversal,
 * symlinks, oversized members, and decompression bombs are refused before any
 * XML is touched. Parsing failures are per-file and never fatal.
 */
export function parseJUnitArchive(
  archive: Buffer,
  options: {
    readonly zipLimits?: ZipLimits;
    readonly junitLimits?: JUnitLimits;
  } = {},
): TestReportSummary {
  const junitLimits = options.junitLimits ?? DEFAULT_JUNIT_LIMITS;
  const read =
    options.zipLimits === undefined
      ? readZipEntries(archive)
      : readZipEntries(archive, options.zipLimits);

  const accumulator: Accumulator = {
    cases: [],
    suites: [],
    truncated: read.truncated,
  };
  const skippedFiles: string[] = [];
  let parsedFiles = 0;

  for (const entry of read.entries) {
    if (!entry.path.toLocaleLowerCase('en-US').endsWith('.xml')) {
      continue;
    }
    if (entry.bytes.byteLength > junitLimits.maxXmlBytes) {
      skippedFiles.push(entry.path);
      continue;
    }
    try {
      accumulate(
        parser.parse(entry.bytes.toString('utf8')),
        accumulator,
        junitLimits,
      );
      parsedFiles += 1;
    } catch {
      skippedFiles.push(entry.path);
    }
  }

  const byDuration = [...accumulator.cases].sort(
    (left, right) => right.durationSeconds - left.durationSeconds,
  );
  const failedCases = accumulator.cases.filter(
    (entry) => entry.status === 'failed' || entry.status === 'error',
  );

  return {
    total: accumulator.cases.length,
    passed: accumulator.cases.filter((entry) => entry.status === 'passed')
      .length,
    failed: accumulator.cases.filter((entry) => entry.status === 'failed')
      .length,
    errored: accumulator.cases.filter((entry) => entry.status === 'error')
      .length,
    skipped: accumulator.cases.filter((entry) => entry.status === 'skipped')
      .length,
    durationSeconds: accumulator.cases.reduce(
      (total, entry) => total + entry.durationSeconds,
      0,
    ),
    slowestSuites: [...accumulator.suites]
      .sort((left, right) => right.durationSeconds - left.durationSeconds)
      .slice(0, junitLimits.maxReportedCases),
    slowestCases: byDuration.slice(0, junitLimits.maxReportedCases),
    failedCases: failedCases.slice(0, junitLimits.maxReportedCases),
    parsedFiles,
    skippedFiles,
    rejections: read.rejections,
    truncated: accumulator.truncated,
  };
}
