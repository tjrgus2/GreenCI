import { describe, expect, it } from 'vitest';
import { parseJUnitArchive } from '../src/artifacts/junit.js';
import {
  DEFAULT_ZIP_LIMITS,
  readZipEntries,
  validateArchivePath,
} from '../src/artifacts/zip.js';
import { SYMLINK_ATTRIBUTES, buildZip, junitXml } from './zip-builder.js';

function reasonsFor(archive: Buffer): string[] {
  return readZipEntries(archive).rejections.map(
    (rejection) => rejection.reason,
  );
}

describe('archive path validation', () => {
  it('accepts a normal relative path', () => {
    expect(validateArchivePath('reports/junit.xml')).toEqual({
      ok: true,
      path: 'reports/junit.xml',
    });
    expect(validateArchivePath('./reports/junit.xml')).toEqual({
      ok: true,
      path: 'reports/junit.xml',
    });
  });

  it('refuses absolute, drive-letter, traversal, and null-byte paths', () => {
    expect(validateArchivePath('/etc/passwd').ok).toBe(false);
    expect(validateArchivePath('C:/Windows/system.ini').ok).toBe(false);
    expect(validateArchivePath('../../outside.xml').ok).toBe(false);
    expect(validateArchivePath('reports/../../outside.xml').ok).toBe(false);
    expect(validateArchivePath('..\\..\\outside.xml').ok).toBe(false);
    expect(validateArchivePath('bad\0name.xml').ok).toBe(false);
    expect(validateArchivePath('').ok).toBe(false);
  });
});

describe('hardened ZIP reader', () => {
  it('reads stored and deflated members', () => {
    const archive = buildZip([
      { path: 'a.xml', data: 'stored' },
      { path: 'b.xml', data: 'deflated'.repeat(50), method: 8 },
    ]);
    const result = readZipEntries(archive);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'a.xml',
      'b.xml',
    ]);
    expect(result.entries[0]?.bytes.toString('utf8')).toBe('stored');
    expect(result.rejections).toEqual([]);
  });

  it('refuses a zip-slip path without touching the filesystem', () => {
    const archive = buildZip([
      { path: '../../outside.xml', data: junitXml() },
      { path: 'reports/ok.xml', data: junitXml() },
    ]);
    const result = readZipEntries(archive);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'reports/ok.xml',
    ]);
    expect(result.rejections[0]).toEqual({
      path: '../../outside.xml',
      reason: 'path-traversal',
    });
  });

  it('refuses an absolute path and a symbolic link', () => {
    expect(reasonsFor(buildZip([{ path: '/etc/passwd', data: 'x' }]))).toEqual([
      'absolute-path',
    ]);
    expect(
      reasonsFor(
        buildZip([
          {
            path: 'link.xml',
            data: '/etc/passwd',
            externalAttributes: SYMLINK_ATTRIBUTES,
          },
        ]),
      ),
    ).toEqual(['symlink']);
  });

  it('refuses a decompression bomb by compression ratio', () => {
    const archive = buildZip([
      { path: 'bomb.xml', data: 'a'.repeat(400_000), method: 8 },
    ]);
    expect(reasonsFor(archive)).toEqual(['compression-ratio']);
    expect(readZipEntries(archive).entries).toEqual([]);
  });

  it('refuses a member larger than the per-entry limit', () => {
    const archive = buildZip([
      {
        path: 'huge.xml',
        data: Buffer.alloc(64),
        declaredUncompressedSize: 6_000_000,
      },
    ]);
    expect(reasonsFor(archive)).toEqual(['entry-too-large']);
  });

  it('stops at the total uncompressed limit and reports truncation', () => {
    const archive = buildZip([
      { path: 'one.xml', data: Buffer.alloc(600) },
      { path: 'two.xml', data: Buffer.alloc(600) },
    ]);
    const result = readZipEntries(archive, {
      ...DEFAULT_ZIP_LIMITS,
      maxTotalUncompressedBytes: 700,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.rejections[0]?.reason).toBe('total-size');
  });

  it('stops at the entry-count limit', () => {
    const archive = buildZip(
      Array.from({ length: 5 }, (_, index) => ({
        path: `file-${index}.xml`,
        data: 'x',
      })),
    );
    const result = readZipEntries(archive, {
      ...DEFAULT_ZIP_LIMITS,
      maxEntries: 2,
    });
    expect(result.entries).toHaveLength(2);
    expect(result.rejections[0]?.reason).toBe('entry-limit');
    expect(result.truncated).toBe(true);
  });

  it('refuses an unsupported compression method and a zip64 sentinel', () => {
    expect(
      reasonsFor(
        buildZip([{ path: 'lzma.xml', data: 'x', method: 14 as unknown as 0 }]),
      ),
    ).toEqual(['unsupported-compression']);
    expect(
      reasonsFor(
        buildZip([
          {
            path: 'big.xml',
            data: 'x',
            declaredUncompressedSize: 0xffffffff,
          },
        ]),
      ),
    ).toEqual(['zip64-unsupported']);
  });

  it('reports a corrupt archive instead of throwing', () => {
    expect(reasonsFor(Buffer.from('not a zip file at all'))).toEqual([
      'corrupt',
    ]);
    const truncatedData = buildZip([{ path: 'a.xml', data: 'hello' }]);
    const mangled = Buffer.from(truncatedData);
    mangled.writeUInt32LE(999_999, mangled.byteLength - 6);
    expect(readZipEntries(mangled).entries).toEqual([]);
  });

  it('skips directory members', () => {
    const archive = buildZip([
      { path: 'reports/', data: '' },
      { path: 'reports/ok.xml', data: 'x' },
    ]);
    expect(readZipEntries(archive).entries.map((entry) => entry.path)).toEqual([
      'reports/ok.xml',
    ]);
  });
});

describe('JUnit artifact analysis', () => {
  it('aggregates suites, cases, and outcomes', () => {
    const archive = buildZip([
      {
        path: 'reports/unit.xml',
        data: junitXml({
          suite: 'unit',
          cases: [
            { name: 'fast', time: 0.1 },
            { name: 'slow', time: 12.5 },
            { name: 'broken', time: 1, status: 'failed', message: 'boom' },
            { name: 'crashed', time: 2, status: 'error' },
            { name: 'ignored', time: 0, status: 'skipped' },
          ],
        }),
      },
    ]);
    const summary = parseJUnitArchive(archive);
    expect(summary.total).toBe(5);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.errored).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.durationSeconds).toBeCloseTo(15.6, 5);
    expect(summary.slowestCases[0]?.name).toBe('slow');
    expect(summary.failedCases.map((entry) => entry.name)).toEqual([
      'broken',
      'crashed',
    ]);
    expect(summary.failedCases[0]?.message).toBe('boom');
    expect(summary.parsedFiles).toBe(1);
  });

  it('parses a nested testsuite and a bare testsuite root', () => {
    const nested = [
      '<testsuites>',
      '  <testsuite name="outer">',
      '    <testsuite name="inner" tests="1">',
      '      <testcase classname="inner" name="deep" time="1" />',
      '    </testsuite>',
      '  </testsuite>',
      '</testsuites>',
    ].join('\n');
    const bare = [
      '<testsuite name="solo" tests="1">',
      '  <testcase classname="solo" name="only" time="2" />',
      '</testsuite>',
    ].join('\n');
    const summary = parseJUnitArchive(
      buildZip([
        { path: 'nested.xml', data: nested },
        { path: 'bare.xml', data: bare },
      ]),
    );
    expect(summary.total).toBe(2);
    expect(summary.parsedFiles).toBe(2);
  });

  it('does not expand XML entities', () => {
    const payload = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE testsuites [',
      '  <!ENTITY boom "AAAAAAAAAA">',
      ']>',
      '<testsuites><testsuite name="s" tests="1">',
      '<testcase classname="s" name="&boom;&boom;&boom;" time="1" />',
      '</testsuite></testsuites>',
    ].join('\n');
    const summary = parseJUnitArchive(
      buildZip([{ path: 'entities.xml', data: payload }]),
    );
    expect(summary.total).toBe(1);
    expect(summary.slowestCases[0]?.name).not.toContain('AAAAAAAAAA');
  });

  it('ignores non-XML members and oversized XML', () => {
    const summary = parseJUnitArchive(
      buildZip([
        { path: 'notes.txt', data: 'ignored' },
        { path: 'ok.xml', data: junitXml() },
        { path: 'big.xml', data: junitXml() },
      ]),
      {
        junitLimits: { maxXmlBytes: 80, maxTestCases: 10, maxReportedCases: 5 },
      },
    );
    expect(summary.parsedFiles).toBe(0);
    expect(summary.skippedFiles).toEqual(['ok.xml', 'big.xml']);
  });

  it('truncates at the test-case limit', () => {
    const summary = parseJUnitArchive(
      buildZip([
        {
          path: 'many.xml',
          data: junitXml({
            cases: Array.from({ length: 10 }, (_, index) => ({
              name: `case-${index}`,
              time: 1,
            })),
          }),
        },
      ]),
      {
        junitLimits: {
          maxXmlBytes: 1_000_000,
          maxTestCases: 4,
          maxReportedCases: 5,
        },
      },
    );
    expect(summary.total).toBe(4);
    expect(summary.truncated).toBe(true);
  });

  it('survives malformed XML and reports the refused members', () => {
    const summary = parseJUnitArchive(
      buildZip([
        { path: '../escape.xml', data: junitXml() },
        { path: 'broken.xml', data: '<testsuites><oops' },
        { path: 'good.xml', data: junitXml() },
      ]),
    );
    expect(summary.total).toBe(1);
    expect(summary.rejections[0]?.reason).toBe('path-traversal');
  });
});
