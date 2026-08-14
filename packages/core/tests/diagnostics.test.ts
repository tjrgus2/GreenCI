import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIAGNOSTIC_LIMITS,
  isRepositoryRelative,
  parseFailureLog,
  redactSecrets,
  sanitizeLine,
  selectAnnotations,
  stripAnsi,
  stripControlCharacters,
  stripLogTimestamp,
} from '../src/diagnostics/index.js';

const context = { jobName: 'Test', stepName: 'Run' };

function parse(log: string) {
  return parseFailureLog(log, context, DEFAULT_DIAGNOSTIC_LIMITS);
}

describe('log sanitization', () => {
  it('removes ANSI colour, runner timestamps, and control characters', () => {
    expect(stripAnsi('\u001B[31mred\u001B[0m')).toBe('red');
    expect(stripLogTimestamp('2026-08-14T05:30:02.5828275Z hello')).toBe(
      'hello',
    );
    expect(stripControlCharacters('a\u0000b\u0007c')).toBe('abc');
    expect(stripControlCharacters('keep\ttab\nnewline')).toBe(
      'keep\ttab\nnewline',
    );
  });

  it('redacts anything that looks like a credential', () => {
    expect(redactSecrets(`token ghp_${'a'.repeat(36)}`)).toBe(
      'token [redacted]',
    );
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('[redacted]');
    expect(redactSecrets('password = hunter2hunter2')).toBe('[redacted]');
    expect(
      redactSecrets('Authorization: Bearer abcdefghijklmnopqrst'),
    ).toContain('[redacted]');
    expect(redactSecrets('-----BEGIN RSA PRIVATE KEY-----')).toBe('[redacted]');
    expect(redactSecrets('nothing sensitive here')).toBe(
      'nothing sensitive here',
    );
  });

  it('bounds the length of a reported line', () => {
    expect(sanitizeLine('x'.repeat(500), 20)).toHaveLength(20);
    expect(sanitizeLine('x'.repeat(500), 20).endsWith('…')).toBe(true);
  });
});

describe('repository-relative path guard', () => {
  it('accepts a repository path and rejects an escape', () => {
    expect(isRepositoryRelative('src/app.ts')).toBe(true);
    expect(isRepositoryRelative('src\\app.ts')).toBe(true);
    expect(isRepositoryRelative('/etc/passwd')).toBe(false);
    expect(isRepositoryRelative('C:/Windows/win.ini')).toBe(false);
    expect(isRepositoryRelative('../outside.ts')).toBe(false);
    expect(isRepositoryRelative('no-extension')).toBe(false);
  });
});

describe('failure log parsers', () => {
  it('parses TypeScript errors with a file and line', () => {
    const result = parse(
      [
        'src/app.ts(12,5): error TS2345: Argument of type string is not assignable.',
        'src/other.ts:20:3 - error TS2322: Type number is not assignable.',
      ].join('\n'),
    );
    expect(result.parserId).toBe('typescript');
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]?.file).toBe('src/app.ts');
    expect(result.diagnostics[0]?.line).toBe(12);
    expect(result.diagnostics[0]?.column).toBe(5);
    expect(result.diagnostics[0]?.confidence).toBeGreaterThan(0.9);
  });

  it('parses ESLint output with the preceding file header', () => {
    const result = parse(
      [
        'src/index.ts',
        '  12:5   error    Unexpected console statement  no-console',
        '  20:1   warning  Missing return type           @typescript-eslint/explicit-function-return-type',
        '',
      ].join('\n'),
    );
    const eslint = result.diagnostics.filter(
      (entry) => entry.parserId === 'eslint',
    );
    expect(eslint).toHaveLength(2);
    expect(eslint[0]?.file).toBe('src/index.ts');
    expect(eslint[0]?.message).toContain('no-console');
    expect(eslint[1]?.severity).toBe('warning');
  });

  it('parses a Vitest failure', () => {
    const result = parse(
      [
        ' FAIL  src/math.test.ts > adds numbers',
        'AssertionError: expected 3 to be 4',
      ].join('\n'),
    );
    expect(result.diagnostics[0]?.parserId).toBe('jest-vitest');
    expect(result.diagnostics[0]?.file).toBe('src/math.test.ts');
  });

  it('parses a Python traceback and a pytest failure', () => {
    const traceback = parse(
      [
        'Traceback (most recent call last):',
        '  File "app/main.py", line 42, in handler',
        '    raise ValueError("bad input")',
        'ValueError: bad input',
      ].join('\n'),
    );
    expect(traceback.diagnostics[0]?.parserId).toBe('python');
    expect(traceback.diagnostics[0]?.file).toBe('app/main.py');
    expect(traceback.diagnostics[0]?.line).toBe(42);

    const pytestResult = parse(
      'FAILED tests/test_math.py::test_add - assert 3 == 4',
    );
    expect(pytestResult.diagnostics[0]?.parserId).toBe('pytest');
    expect(pytestResult.diagnostics[0]?.file).toBe('tests/test_math.py');
  });

  it('parses Java, Gradle, and Maven failures', () => {
    const javaResult = parse(
      [
        'Exception in thread "main" java.lang.NullPointerException: boom',
        '\tat com.example.App.main(App.java:17)',
      ].join('\n'),
    );
    expect(
      javaResult.diagnostics.some((entry) => entry.parserId === 'java'),
    ).toBe(true);

    const gradleResult = parse(
      [
        '> Task :app:test FAILED',
        '* What went wrong:',
        'Execution failed.',
      ].join('\n'),
    );
    expect(
      gradleResult.diagnostics.some((entry) => entry.parserId === 'gradle'),
    ).toBe(true);

    const mavenResult = parse(
      '[ERROR] src/main/java/App.java:[12,8] cannot find symbol',
    );
    expect(mavenResult.diagnostics[0]?.parserId).toBe('maven');
    expect(mavenResult.diagnostics[0]?.line).toBe(12);
  });

  it('parses GCC and Clang diagnostics', () => {
    const result = parse("src/main.c:8:12: error: expected ';' before '}'");
    expect(result.diagnostics[0]?.parserId).toBe('gcc-clang');
    expect(result.diagnostics[0]?.file).toBe('src/main.c');
  });

  it('falls back to the generic exit-code parser', () => {
    const result = parse('##[error]Process completed with exit code 1.');
    expect(result.parserId).toBe('exit-code');
    expect(result.diagnostics[0]?.message).toContain('exited with code 1');
    expect(result.diagnostics[0]?.confidence).toBeLessThan(0.5);
  });

  it('returns nothing recognizable for unstructured output', () => {
    const result = parse('everything is fine, nothing to see here');
    expect(result.parserId).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('redacts credentials that appear inside a diagnostic message', () => {
    const result = parse(
      `src/app.ts(1,1): error TS2345: failed with token ghp_${'b'.repeat(36)}`,
    );
    expect(result.diagnostics[0]?.message).toContain('[redacted]');
    expect(result.diagnostics[0]?.message).not.toContain('ghp_');
  });

  it('never reports a file path outside the repository', () => {
    const result = parse(
      '/etc/secrets/app.ts(3,1): error TS2345: leaked path attempt',
    );
    expect(result.diagnostics[0]?.file).toBeUndefined();
    expect(result.diagnostics[0]?.line).toBeUndefined();
    expect(result.diagnostics[0]?.confidence).toBeLessThan(0.5);
  });

  it('bounds bytes, lines, and diagnostic count', () => {
    const noise = Array.from(
      { length: 60 },
      (_, index) => `src/f${index}.ts(1,1): error TS2345: message ${index}`,
    ).join('\n');
    const result = parseFailureLog(noise, context, {
      maxBytes: 1_000_000,
      maxLines: 10,
      maxDiagnostics: 5,
    });
    expect(result.diagnostics).toHaveLength(5);
    expect(result.truncatedLines).toBe(true);

    const huge = parseFailureLog('x'.repeat(200), context, {
      maxBytes: 50,
      maxLines: 100,
      maxDiagnostics: 5,
    });
    expect(huge.truncatedBytes).toBe(true);
  });

  it('deduplicates identical diagnostics', () => {
    const repeated = [
      'src/app.ts(12,5): error TS2345: same problem',
      'src/app.ts(12,5): error TS2345: same problem',
    ].join('\n');
    expect(parse(repeated).diagnostics).toHaveLength(1);
  });

  it('isolates a parser that throws', () => {
    const result = parseFailureLog(
      'anything',
      context,
      DEFAULT_DIAGNOSTIC_LIMITS,
      [
        {
          id: 'broken',
          canParse: () => 10,
          parse: () => {
            throw new Error('parser bug');
          },
        },
      ],
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.parserId).toBeUndefined();
  });
});

describe('annotation selection', () => {
  it('emits only confident, located, deduplicated diagnostics', () => {
    const result = parse(
      [
        'src/app.ts(12,5): error TS2345: located and confident',
        '##[error]Process completed with exit code 1.',
      ].join('\n'),
    );
    const annotations = selectAnnotations(result.diagnostics, {
      minConfidence: 0.9,
      maxCount: 20,
    });
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.file).toBe('src/app.ts');
  });

  it('honours the annotation count limit', () => {
    const result = parse(
      Array.from(
        { length: 5 },
        (_, index) => `src/f${index}.ts(1,1): error TS2345: message ${index}`,
      ).join('\n'),
    );
    expect(
      selectAnnotations(result.diagnostics, {
        minConfidence: 0.5,
        maxCount: 2,
      }),
    ).toHaveLength(2);
    expect(
      selectAnnotations(result.diagnostics, {
        minConfidence: 0.5,
        maxCount: 0,
      }),
    ).toEqual([]);
  });
});
