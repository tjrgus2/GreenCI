import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  MAX_ARTIFACT_BYTES,
  collectTestReport,
} from '../src/adapters/tests.js';
import { collectDiagnostics } from '../src/adapters/logs.js';
import { loadWorkflowDefinition } from '../src/adapters/workflow.js';
import { fakeSource, httpError } from './fake-source.js';

const request = {
  owner: 'owner',
  repository: 'repo',
  runId: 100,
  artifact: 'test-results',
  maxUncompressedBytes: 10 * 1024 * 1024,
  maxFiles: 100,
};

const junit = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<testsuites>',
  '  <testsuite name="unit" tests="2">',
  '    <testcase classname="unit" name="fast" time="0.2" />',
  '    <testcase classname="unit" name="broken" time="1.5">',
  '      <failure message="boom">detail</failure>',
  '    </testcase>',
  '  </testsuite>',
  '</testsuites>',
].join('\n');

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

function zipOf(path: string, contents: string): Buffer {
  const name = Buffer.from(path, 'utf8');
  const raw = Buffer.from(contents, 'utf8');
  const payload = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(LOCAL_SIGNATURE, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(payload.byteLength, 18);
  local.writeUInt32LE(raw.byteLength, 22);
  local.writeUInt16LE(name.byteLength, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(payload.byteLength, 20);
  central.writeUInt32LE(raw.byteLength, 24);
  central.writeUInt16LE(name.byteLength, 28);
  const localBlock = Buffer.concat([local, name, payload]);
  const centralBlock = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralBlock.byteLength, 12);
  eocd.writeUInt32LE(localBlock.byteLength, 16);
  return Buffer.concat([localBlock, centralBlock, eocd]);
}

function artifactSource(
  archive: Buffer,
  overrides: Parameters<typeof fakeSource>[0] = {},
) {
  return fakeSource({
    async listArtifacts() {
      return [
        { id: 7, name: 'test-results', size_in_bytes: archive.byteLength },
      ];
    },
    async downloadArtifact() {
      return archive.buffer.slice(
        archive.byteOffset,
        archive.byteOffset + archive.byteLength,
      ) as ArrayBuffer;
    },
    ...overrides,
  });
}

describe('test-report collection', () => {
  it('downloads and parses a JUnit artifact', async () => {
    const result = await collectTestReport(
      artifactSource(zipOf('reports/junit.xml', junit)),
      request,
    );
    expect(result.report?.total).toBe(2);
    expect(result.report?.failed).toBe(1);
    expect(result.report?.artifact).toBe('test-results');
    expect(result.report?.failedCases[0]?.message).toBe('boom');
    expect(result.warnings).toEqual([]);
  });

  it('warns when the artifact does not exist', async () => {
    const result = await collectTestReport(fakeSource(), request);
    expect(result.report).toBeUndefined();
    expect(result.warnings[0]?.code).toBe('TEST_ARTIFACT_UNAVAILABLE');
  });

  it('skips an expired artifact', async () => {
    const result = await collectTestReport(
      fakeSource({
        async listArtifacts() {
          return [{ id: 7, name: 'test-results', expired: true }];
        },
      }),
      request,
    );
    expect(result.warnings[0]?.code).toBe('TEST_ARTIFACT_UNAVAILABLE');
  });

  it('refuses an artifact larger than the download limit', async () => {
    const result = await collectTestReport(
      fakeSource({
        async listArtifacts() {
          return [
            {
              id: 7,
              name: 'test-results',
              size_in_bytes: MAX_ARTIFACT_BYTES + 1,
            },
          ];
        },
      }),
      request,
    );
    expect(result.warnings[0]?.code).toBe('TEST_ARTIFACT_UNSAFE');
  });

  it('warns when listing or downloading fails', async () => {
    const listFailure = await collectTestReport(
      fakeSource({
        async listArtifacts() {
          throw httpError(403);
        },
      }),
      request,
    );
    expect(listFailure.warnings[0]?.message).toContain('HTTP 403');

    const downloadFailure = await collectTestReport(
      fakeSource({
        async listArtifacts() {
          return [{ id: 7, name: 'test-results', size_in_bytes: 10 }];
        },
        async downloadArtifact() {
          throw httpError(500);
        },
      }),
      request,
    );
    expect(downloadFailure.warnings[0]?.message).toContain('HTTP 500');
  });

  it('reports a hostile archive member and still returns safe results', async () => {
    const result = await collectTestReport(
      artifactSource(zipOf('../../escape.xml', junit)),
      request,
    );
    expect(result.report).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'TEST_ARTIFACT_UNSAFE',
    );
    expect(result.warnings[0]?.message).toContain('path-traversal');
  });

  it('warns when the archive has no readable JUnit file', async () => {
    const result = await collectTestReport(
      artifactSource(zipOf('notes.txt', 'nothing here')),
      request,
    );
    expect(result.report).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'TEST_ARTIFACT_UNAVAILABLE',
    );
  });
});

const failure = {
  jobId: 42,
  jobName: 'Test',
  conclusion: 'failure' as const,
  durationSeconds: 60,
  failedStepName: 'Run tests',
  failedStepIndex: 2,
  secondsBeforeFailure: 55,
};

const diagnosticsRequest = {
  owner: 'owner',
  repository: 'repo',
  enabled: true,
  maxBytesPerJob: 65_536,
  maxJobs: 3,
  tailLines: 500,
  annotations: { enabled: true, maxCount: 20, minConfidence: 0.9 },
};

describe('failure-log collection', () => {
  const failures = {
    failedJobCount: 1,
    failures: [failure],
    firstFailureWallClockPercent: 90,
  };

  it('is off unless explicitly enabled', async () => {
    const result = await collectDiagnostics(
      fakeSource({
        async downloadJobLogs() {
          throw new Error('must not download logs');
        },
      }),
      failures,
      { ...diagnosticsRequest, enabled: false },
    );
    expect(result.report.enabled).toBe(false);
    expect(result.report.diagnostics).toEqual([]);
  });

  it('does nothing when no job failed', async () => {
    const result = await collectDiagnostics(
      fakeSource({
        async downloadJobLogs() {
          throw new Error('must not download logs');
        },
      }),
      {
        failedJobCount: 0,
        failures: [],
        firstFailureWallClockPercent: undefined,
      },
      diagnosticsRequest,
    );
    expect(result.report.enabled).toBe(false);
  });

  it('parses only failed job logs and selects confident annotations', async () => {
    const requested: number[] = [];
    const result = await collectDiagnostics(
      fakeSource({
        async downloadJobLogs(parameters) {
          requested.push(parameters.jobId);
          return [
            '2026-08-14T05:30:02.5828275Z src/app.ts(12,5): error TS2345: broken',
            '2026-08-14T05:30:03.0000000Z ##[error]Process completed with exit code 1.',
          ].join('\n');
        },
      }),
      failures,
      diagnosticsRequest,
    );
    expect(requested).toEqual([42]);
    expect(result.report.enabled).toBe(true);
    expect(result.report.jobsParsed).toBe(1);
    expect(result.report.diagnostics[0]?.jobName).toBe('Test');
    expect(result.report.diagnostics[0]?.file).toBe('src/app.ts');
    expect(result.annotations).toHaveLength(1);
    expect(result.report.annotationsEmitted).toBe(1);
  });

  it('emits no annotation when annotations are disabled', async () => {
    const result = await collectDiagnostics(
      fakeSource({
        async downloadJobLogs() {
          return 'src/app.ts(12,5): error TS2345: broken';
        },
      }),
      failures,
      {
        ...diagnosticsRequest,
        annotations: { enabled: false, maxCount: 20, minConfidence: 0.9 },
      },
    );
    expect(result.report.diagnostics).toHaveLength(1);
    expect(result.annotations).toEqual([]);
  });

  it('degrades when a log cannot be downloaded', async () => {
    const result = await collectDiagnostics(
      fakeSource({
        async downloadJobLogs() {
          throw httpError(410);
        },
      }),
      failures,
      diagnosticsRequest,
    );
    expect(result.report.jobsParsed).toBe(0);
    expect(result.warnings[0]?.code).toBe('FAILURE_LOG_UNAVAILABLE');
  });

  it('reports truncation when the log exceeds the configured bounds', async () => {
    const result = await collectDiagnostics(
      fakeSource({
        async downloadJobLogs() {
          return 'src/app.ts(12,5): error TS2345: broken\n'.repeat(200);
        },
      }),
      failures,
      { ...diagnosticsRequest, tailLines: 10 },
    );
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'FAILURE_LOG_TRUNCATED',
    );
  });
});

describe('workflow definition collection', () => {
  const reference = {
    owner: 'owner',
    repository: 'repo',
    path: '.github/workflows/ci.yml',
    ref: 'abc123',
  };

  it('decodes the workflow definition at the analyzed revision', async () => {
    const yaml = 'jobs:\n  build: {}\n  test:\n    needs: [build]\n';
    const result = await loadWorkflowDefinition(
      fakeSource({
        async getFileContent(parameters) {
          expect(parameters.ref).toBe('abc123');
          return {
            type: 'file',
            encoding: 'base64',
            size: yaml.length,
            content: Buffer.from(yaml, 'utf8').toString('base64'),
          };
        },
      }),
      reference,
    );
    expect(result.raw).toEqual({
      jobs: { build: {}, test: { needs: ['build'] } },
    });
    expect(result.warnings).toEqual([]);
  });

  it('warns and degrades when the definition is unreadable', async () => {
    const result = await loadWorkflowDefinition(fakeSource(), reference);
    expect(result.raw).toBeUndefined();
    expect(result.warnings[0]?.code).toBe('WORKFLOW_DAG_UNAVAILABLE');
  });

  it('warns when the definition is not a YAML mapping', async () => {
    const yaml = '- not a workflow\n';
    const result = await loadWorkflowDefinition(
      fakeSource({
        async getFileContent() {
          return {
            type: 'file',
            encoding: 'base64',
            size: yaml.length,
            content: Buffer.from(yaml, 'utf8').toString('base64'),
          };
        },
      }),
      reference,
    );
    expect(result.warnings[0]?.message).toContain('YAML mapping');
  });
});
