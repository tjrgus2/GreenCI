import { sha256Hex } from '../util/canonical.js';
import { sanitizeLine } from './sanitize.js';

/** One machine-readable finding extracted from a bounded failed-job log. */
export interface Diagnostic {
  readonly parserId: string;
  readonly severity: 'error' | 'warning' | 'notice';
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly confidence: number;
  readonly fingerprint: string;
}

/** Context a parser may use to decide whether it recognizes a log. */
export interface ParserContext {
  readonly jobName: string;
  readonly stepName: string | undefined;
}

/** A deterministic log parser. */
export interface DiagnosticParser {
  readonly id: string;
  canParse(text: string, context: ParserContext): number;
  parse(text: string, context: ParserContext): Diagnostic[];
}

const REPOSITORY_RELATIVE =
  /^(?!\/)(?![a-zA-Z]:)(?!.*\.\.\/)[\w.@+-]+(?:\/[\w.@+ -]+)*\.[\w]+$/u;

/** A path is only usable for an annotation when it stays inside the repository. */
export function isRepositoryRelative(file: string): boolean {
  return REPOSITORY_RELATIVE.test(file.replaceAll('\\', '/'));
}

function fingerprintOf(
  parts: readonly (string | number | undefined)[],
): string {
  return sha256Hex(parts.map((part) => String(part ?? '')).join('|')).slice(
    0,
    32,
  );
}

function diagnostic(
  parserId: string,
  message: string,
  location: {
    file?: string | undefined;
    line?: number | undefined;
    column?: number | undefined;
  } = {},
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  const file =
    location.file !== undefined && isRepositoryRelative(location.file)
      ? location.file.replaceAll('\\', '/')
      : undefined;
  const line =
    file !== undefined && location.line !== undefined && location.line > 0
      ? location.line
      : undefined;
  const confidence = file !== undefined && line !== undefined ? 0.92 : 0.45;
  return {
    parserId,
    severity,
    message: sanitizeLine(message),
    ...(file === undefined ? {} : { file }),
    ...(line === undefined ? {} : { line }),
    ...(file !== undefined &&
    location.column !== undefined &&
    location.column > 0
      ? { column: location.column }
      : {}),
    confidence,
    fingerprint: fingerprintOf([
      parserId,
      file,
      line,
      sanitizeLine(message, 120),
    ]),
  };
}

function lines(text: string): string[] {
  return text.split(/\r?\n/u);
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

const typescriptPattern =
  /(?<file>[\w./@+-]+\.[cm]?tsx?)[(:](?<line>\d+)[,:](?<column>\d+)\)?\s*[-:]?\s*error\s+(?<code>TS\d+):\s*(?<message>.+)/gu;

const typescript: DiagnosticParser = {
  id: 'typescript',
  canParse: (text) => countMatches(text, new RegExp(typescriptPattern)) * 3,
  parse: (text) =>
    [...text.matchAll(new RegExp(typescriptPattern))].map((match) =>
      diagnostic(
        'typescript',
        `${match.groups?.['code'] ?? ''} ${match.groups?.['message'] ?? ''}`,
        {
          file: match.groups?.['file'],
          line: Number(match.groups?.['line']),
          column: Number(match.groups?.['column']),
        },
      ),
    ),
};

const eslint: DiagnosticParser = {
  id: 'eslint',
  // Leading indentation is stripped during sanitization, so it is optional.
  canParse: (text) =>
    countMatches(text, /^\s*\d+:\d+\s+(?:error|warning)\s{2,}/gmu) * 2,
  parse: (text) => {
    const results: Diagnostic[] = [];
    let file: string | undefined;
    for (const raw of lines(text)) {
      const line = sanitizeLine(raw, 500);
      const fileMatch = /^([\w./@+-]+\.[cm]?[jt]sx?)$/u.exec(line);
      if (fileMatch?.[1] !== undefined) {
        file = fileMatch[1];
        continue;
      }
      const issue =
        /^(?<line>\d+):(?<column>\d+)\s+(?<severity>error|warning)\s+(?<message>.+?)(?:\s{2,}(?<rule>[\w@/-]+))?$/u.exec(
          line.trim(),
        );
      if (issue === null) {
        continue;
      }
      results.push(
        diagnostic(
          'eslint',
          `${issue.groups?.['message'] ?? ''}${issue.groups?.['rule'] === undefined ? '' : ` (${issue.groups['rule']})`}`,
          {
            file,
            line: Number(issue.groups?.['line']),
            column: Number(issue.groups?.['column']),
          },
          issue.groups?.['severity'] === 'warning' ? 'warning' : 'error',
        ),
      );
    }
    return results;
  },
};

const jestPattern =
  /(?:●|✕|FAIL)\s+(?<message>.+?)\s*$|at\s+.*\((?<file>[\w./@+-]+\.[cm]?[jt]sx?):(?<line>\d+):(?<column>\d+)\)/gmu;

const jestVitest: DiagnosticParser = {
  id: 'jest-vitest',
  canParse: (text) =>
    countMatches(text, /^\s*(?:FAIL|●|✕)\s+/gmu) * 2 +
    (/(?:AssertionError|expect\(received\))/u.test(text) ? 3 : 0),
  parse: (text) => {
    const results: Diagnostic[] = [];
    const failures = [
      ...text.matchAll(/^\s*(?:FAIL|●|✕)\s+(?<message>.+)$/gmu),
    ];
    for (const failure of failures) {
      const message = failure.groups?.['message'] ?? '';
      const fileMatch =
        /([\w./@+-]+\.(?:test|spec)\.[cm]?[jt]sx?)(?::(\d+))?/u.exec(message);
      results.push(
        diagnostic('jest-vitest', message, {
          file: fileMatch?.[1],
          line: fileMatch?.[2] === undefined ? undefined : Number(fileMatch[2]),
        }),
      );
    }
    void jestPattern;
    return results;
  },
};

const pythonTraceback: DiagnosticParser = {
  id: 'python',
  canParse: (text) =>
    (/^Traceback \(most recent call last\)/mu.test(text) ? 5 : 0) +
    countMatches(text, /^\s*File "[^"]+", line \d+/gmu),
  parse: (text) => {
    const frames = [
      ...text.matchAll(/^\s*File "(?<file>[^"]+)", line (?<line>\d+)/gmu),
    ];
    const last = frames.at(-1);
    const failure = [
      ...text.matchAll(
        /^(?<type>[A-Z][\w.]*(?:Error|Exception)):\s*(?<message>.*)$/gmu,
      ),
    ].at(-1);
    if (failure === undefined) {
      return [];
    }
    return [
      diagnostic(
        'python',
        `${failure.groups?.['type'] ?? ''}: ${failure.groups?.['message'] ?? ''}`,
        {
          file: last?.groups?.['file'],
          line:
            last?.groups?.['line'] === undefined
              ? undefined
              : Number(last.groups['line']),
        },
      ),
    ];
  },
};

const pytest: DiagnosticParser = {
  id: 'pytest',
  canParse: (text) =>
    countMatches(text, /^(?:FAILED|ERROR)\s+[\w./-]+::[\w.]+/gmu) * 3,
  parse: (text) =>
    [
      ...text.matchAll(
        /^(?:FAILED|ERROR)\s+(?<file>[\w./-]+\.py)::(?<test>[\w.:[\]-]+)(?:\s+-\s+(?<message>.*))?$/gmu,
      ),
    ].map((match) =>
      diagnostic(
        'pytest',
        `${match.groups?.['test'] ?? ''}${match.groups?.['message'] === undefined ? '' : `: ${match.groups['message']}`}`,
        { file: match.groups?.['file'] },
      ),
    ),
};

const java: DiagnosticParser = {
  id: 'java',
  canParse: (text) =>
    countMatches(text, /^\s*at\s+[\w$.]+\([\w$]+\.java:\d+\)/gmu) * 2,
  parse: (text) => {
    const exception =
      /^(?:Exception in thread "[^"]*"\s+)?(?<type>[\w$.]+(?:Exception|Error))(?::\s*(?<message>.*))?$/mu.exec(
        text,
      );
    const frame =
      /^\s*at\s+[\w$.]+\((?<file>[\w$]+\.java):(?<line>\d+)\)/mu.exec(text);
    if (exception === null) {
      return [];
    }
    return [
      diagnostic(
        'java',
        `${exception.groups?.['type'] ?? ''}${exception.groups?.['message'] === undefined ? '' : `: ${exception.groups['message']}`}`,
        {
          file: frame?.groups?.['file'],
          line:
            frame?.groups?.['line'] === undefined
              ? undefined
              : Number(frame.groups['line']),
        },
      ),
    ];
  },
};

const gradle: DiagnosticParser = {
  id: 'gradle',
  canParse: (text) =>
    (/^\* What went wrong:/mu.test(text) ? 5 : 0) +
    countMatches(text, /^> Task .+ FAILED$/gmu) * 2,
  parse: (text) => {
    const wrong = /^\* What went wrong:\n(?<message>.+)$/mu.exec(text);
    const failedTasks = [...text.matchAll(/^> Task (?<task>\S+) FAILED$/gmu)];
    const results: Diagnostic[] = [];
    if (wrong?.groups?.['message'] !== undefined) {
      results.push(diagnostic('gradle', wrong.groups['message']));
    }
    for (const task of failedTasks) {
      results.push(
        diagnostic('gradle', `Task ${task.groups?.['task'] ?? ''} failed`),
      );
    }
    return results;
  },
};

const maven: DiagnosticParser = {
  id: 'maven',
  canParse: (text) => countMatches(text, /^\[ERROR\]\s+/gmu) * 2,
  parse: (text) =>
    [
      ...text.matchAll(
        /^\[ERROR\]\s+(?<file>[\w./@+-]+\.java):\[(?<line>\d+),(?<column>\d+)\]\s*(?<message>.+)$/gmu,
      ),
    ].map((match) =>
      diagnostic('maven', match.groups?.['message'] ?? '', {
        file: match.groups?.['file'],
        line: Number(match.groups?.['line']),
        column: Number(match.groups?.['column']),
      }),
    ),
};

const gcc: DiagnosticParser = {
  id: 'gcc-clang',
  canParse: (text) =>
    countMatches(
      text,
      /^[\w./@+-]+\.(?:c|cc|cpp|cxx|h|hpp):\d+:\d+:\s+(?:error|warning):/gmu,
    ) * 3,
  parse: (text) =>
    [
      ...text.matchAll(
        /^(?<file>[\w./@+-]+\.(?:c|cc|cpp|cxx|h|hpp)):(?<line>\d+):(?<column>\d+):\s+(?<severity>error|warning):\s*(?<message>.+)$/gmu,
      ),
    ].map((match) =>
      diagnostic(
        'gcc-clang',
        match.groups?.['message'] ?? '',
        {
          file: match.groups?.['file'],
          line: Number(match.groups?.['line']),
          column: Number(match.groups?.['column']),
        },
        match.groups?.['severity'] === 'warning' ? 'warning' : 'error',
      ),
    ),
};

const exitCode: DiagnosticParser = {
  id: 'exit-code',
  canParse: (text) =>
    /Process completed with exit code \d+/u.test(text) ? 1 : 0,
  parse: (text) => {
    const match = /Process completed with exit code (?<code>\d+)/u.exec(text);
    return match === null
      ? []
      : [
          diagnostic(
            'exit-code',
            `The step exited with code ${match.groups?.['code'] ?? '?'}`,
          ),
        ];
  },
};

/** Parsers tried against every failed-job log, best score first. */
export const BUILT_IN_PARSERS: readonly DiagnosticParser[] = [
  typescript,
  eslint,
  jestVitest,
  pytest,
  pythonTraceback,
  maven,
  gradle,
  java,
  gcc,
  exitCode,
];
