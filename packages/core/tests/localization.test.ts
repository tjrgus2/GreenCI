import { describe, expect, it } from 'vitest';
import {
  CORE_WARNING_CODES,
  analyzeWorkflow,
} from '../src/analysis/analyze.js';
import { resolveConfig } from '../src/domain/config.js';
import type { AnalysisReport } from '../src/domain/report.js';
import { BUILT_IN_RULES } from '../src/recommendation/rules.js';
import { EVIDENCE_SOURCES } from '../src/recommendation/types.js';
import { createTranslator, en, ko } from '../src/reporting/i18n/index.js';
import { renderJobSummary } from '../src/reporting/markdown.js';
import { renderPullRequestComment } from '../src/reporting/pr-comment.js';

const english = new Map(Object.entries(en));
const korean = new Map(Object.entries(ko));

/**
 * `RECOMMENDATION_RULE_FAILED` names the rules that crashed, and those
 * identifiers appear nowhere else in the report, so it intentionally has no
 * localized template and falls back to the analyzer's English text.
 */
const WARNINGS_WITHOUT_TEMPLATES = new Set(['RECOMMENDATION_RULE_FAILED']);

const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function at(seconds: number): string {
  return new Date(epoch + seconds * 1000).toISOString();
}

function job(
  id: number,
  apiName: string,
  start: number,
  steps: readonly { name: string; seconds: number }[],
): unknown {
  let cursor = start;
  const mapped = steps.map((step, index) => {
    const startedAt = at(cursor);
    cursor += step.seconds;
    return {
      index: index + 1,
      name: step.name,
      normalizedName: step.name.toLocaleLowerCase('en-US'),
      startedAt,
      completedAt: at(cursor),
      conclusion: 'success' as const,
      isRunnerInternal: false,
    };
  });
  return {
    id,
    apiName,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: at(start),
    completedAt: at(cursor),
    conclusion: 'success',
    steps: mapped,
  };
}

/**
 * A pipeline that installs dependencies three times and fans a security matrix
 * out three ways, so cache, duplication, matrix, and critical-path rules all
 * fire and the report exercises every localized surface at once.
 */
function jobs(jitter = 0): unknown[] {
  const install = 25 + jitter;
  return [
    job(1, 'Build', 0, [
      { name: 'npm ci', seconds: install },
      { name: 'npm run build', seconds: 13 },
    ]),
    job(2, 'Unit test', 38 + jitter, [
      { name: 'npm ci', seconds: install },
      { name: 'npm test', seconds: 18 },
    ]),
    job(3, 'Integration test', 81 + jitter * 2, [
      { name: 'npm ci', seconds: install },
      { name: 'Run integration tests', seconds: 48 },
    ]),
    ...['secrets', 'deps', 'sast'].map((rule, index) =>
      job(4 + index, `Security (${rule})`, 0, [
        { name: 'Scan', seconds: 42 + jitter },
      ]),
    ),
  ];
}

function report(locale: 'en' | 'ko'): AnalysisReport {
  return analyzeWorkflow({
    identity: {
      owner: 'owner',
      repository: 'repo',
      workflowId: 1,
      workflowPath: '.github/workflows/ci.yml',
      runId: 700,
      runAttempt: 1,
      headSha: 'abc123',
      headBranch: 'feature',
      baseBranch: 'main',
      event: 'pull_request',
      pullRequestNumber: 9,
      repositoryVisibility: 'private',
    },
    generatedAt: at(1800),
    config: { version: 1, locale, carbon: { region: 'KR' } },
    workflowDefinition: {
      jobs: {
        build: { name: 'Build' },
        'unit-test': { name: 'Unit test', needs: ['build'] },
        'integration-test': { name: 'Integration test', needs: ['unit-test'] },
        security: {
          name: 'Security',
          strategy: { matrix: { rule: ['secrets', 'deps', 'sast'] } },
        },
      },
    },
    jobs: jobs(),
    baseline: {
      available: true,
      branch: 'main',
      samples: [0, 1, -1, 2].map((jitter, index) => ({
        runId: 600 + index,
        runAttempt: 1,
        headSha: String(index).padStart(40, 'c'),
        jobs: jobs(jitter),
      })),
    },
  });
}

describe('message coverage', () => {
  it('translates the prose of every built-in rule', () => {
    expect(BUILT_IN_RULES.length).toBeGreaterThan(0);
    for (const rule of BUILT_IN_RULES) {
      for (const suffix of ['title', 'explanation']) {
        const key = `rule.${rule.id}.${suffix}`;
        expect(english.get(key)?.length ?? 0, key).toBeGreaterThan(0);
        expect(korean.get(key)?.length ?? 0, key).toBeGreaterThan(0);
      }
    }
  });

  it('translates every evidence source a rule is allowed to emit', () => {
    for (const source of EVIDENCE_SOURCES) {
      const key = `source.${source}`;
      expect(korean.get(key)?.length ?? 0, key).toBeGreaterThan(0);
    }
  });

  it('translates every core warning code', () => {
    for (const code of CORE_WARNING_CODES) {
      const key = `warning.${code}`;
      if (WARNINGS_WITHOUT_TEMPLATES.has(code)) {
        expect(korean.has(key), key).toBe(false);
        continue;
      }
      expect(korean.get(key)?.length ?? 0, key).toBeGreaterThan(0);
    }
  });

  it('keeps English evidence sources identical to the text the report stores', () => {
    // Translating at render time must not change what an English reader sees,
    // so the English bundle maps each source to itself.
    for (const source of EVIDENCE_SOURCES) {
      expect(english.get(`source.${source}`), source).toBe(source);
    }
  });

  it('falls back to analyzer text for a key it does not know', () => {
    const translate = createTranslator('ko');
    expect(translate.optional('rule.CUSTOM-001.title', 'Custom finding')).toBe(
      'Custom finding',
    );
    expect(
      translate.optional('warning.TEST_ARTIFACT_UNSAFE', 'Upstream said no'),
    ).toBe('Upstream said no');
  });
});

describe('Korean report rendering', () => {
  it('leaves no English analyzer prose in the rendered report', () => {
    const korean_ = report('ko');
    const markdown = renderJobSummary(korean_);

    expect(korean_.recommendations.length).toBeGreaterThan(0);
    for (const recommendation of korean_.recommendations) {
      // The English text the report stores must not reach a Korean reader.
      expect(markdown, recommendation.ruleId).not.toContain(
        recommendation.title,
      );
      expect(markdown, recommendation.ruleId).not.toContain(
        recommendation.explanation,
      );
      expect(markdown).toContain(
        korean.get(`rule.${recommendation.ruleId}.title`),
      );
      for (const evidence of recommendation.evidence) {
        expect(markdown, evidence.metric).not.toContain(evidence.source);
      }
    }

    expect(markdown).not.toContain(korean_.whatIf.disclaimer);
    expect(markdown).toContain(ko['whatIf.disclaimer']);
    expect(markdown).not.toContain('Modeled operational emissions');
    expect(markdown).toContain(ko['carbon.measurementDisclaimer']);

    expect(korean_.warnings.length).toBeGreaterThan(0);
    for (const warning of korean_.warnings) {
      if (WARNINGS_WITHOUT_TEMPLATES.has(warning.code)) {
        continue;
      }
      expect(markdown, warning.code).not.toContain(warning.message);
    }
  });

  it('interpolates warning specifics recovered from the report', () => {
    const markdown = renderJobSummary(report('ko'));
    // CRITICAL_PATH_DEGRADED carries a confidence grade and reasons that the
    // warning itself does not store; both come back from the report.
    expect(markdown).toContain(
      'Critical Path를 신뢰도 보통 수준으로 재구성했습니다',
    );
    expect(markdown).toContain('matrix-jobs-aggregated');
  });

  it('translates the pull-request comment as well as the job summary', () => {
    const comment = renderPullRequestComment(report('ko'));
    expect(comment).toContain('🌱 GreenCI 리포트');
    expect(comment).toContain('의존성 설치가 러너 시간을 대부분 차지합니다');
    expect(comment).not.toContain('Dependency installation dominates');
  });

  it('keeps the JSON report locale-independent', () => {
    // The rendered surfaces localize; the machine-readable artifact does not,
    // so tooling and the published schema never depend on a display setting.
    const koReport = report('ko');
    const enReport = report('en');
    expect(koReport.recommendations.map((entry) => entry.title)).toEqual(
      enReport.recommendations.map((entry) => entry.title),
    );
    expect(koReport.whatIf.disclaimer).toBe(enReport.whatIf.disclaimer);
    expect(koReport.carbon?.measurementDisclaimer).toBe(
      enReport.carbon?.measurementDisclaimer,
    );
    expect(koReport.warnings.map((entry) => entry.message)).toEqual(
      enReport.warnings.map((entry) => entry.message),
    );
    expect(koReport.locale).toBe('ko');
    expect(enReport.locale).toBe('en');
  });

  it('localizes CONFIG_INVALID at validation time, the one documented exception', () => {
    // Its message names the rejected keys and the suggestions for them, and
    // neither appears anywhere else in the report, so there is nothing for a
    // render-time translation to rebuild from. The `code` stays the stable
    // machine-readable half.
    const rejected = (locale: 'en' | 'ko'): string =>
      resolveConfig({ locale, carbon: { regoin: 'KR' } }).warnings[0]
        ?.message ?? '';
    expect(rejected('ko')).toContain('알 수 없는 키');
    expect(rejected('en')).toContain('unknown key(s)');
    expect(rejected('ko')).not.toBe(rejected('en'));
  });
});
