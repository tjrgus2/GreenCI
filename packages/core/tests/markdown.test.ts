import { describe, expect, it } from 'vitest';
import { analyzeWorkflow } from '../src/analysis/analyze.js';
import {
  escapeMarkdown,
  formatDuration,
  renderJobSummary,
} from '../src/reporting/markdown.js';

describe('Markdown reporting', () => {
  it('escapes repository-controlled table and HTML syntax', () => {
    expect(escapeMarkdown('bad|`name`<tag>\nnext')).toBe(
      'bad\\|\\`name\\`&lt;tag&gt;<br>next',
    );
  });

  it('formats finite durations safely', () => {
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(Number.NaN)).toBe('Unavailable');
    expect(formatDuration(-1)).toBe('0s');
  });

  it('renders jobs, steps, and escaped names', () => {
    const report = analyzeWorkflow({
      identity: {
        owner: 'owner',
        repository: 'repo',
        workflowId: 1,
        workflowPath: '.github/workflows/ci.yml',
        runId: 1,
        runAttempt: 1,
        headSha: 'abc',
        headBranch: 'main',
        event: 'push',
        repositoryVisibility: 'private',
      },
      jobs: [
        {
          id: 1,
          apiName: 'build | unsafe',
          runnerLabels: ['ubuntu-latest'],
          runnerClass: 'linux-x64',
          startedAt: '2026-07-20T00:00:00.000Z',
          completedAt: '2026-07-20T00:01:00.000Z',
          conclusion: 'success',
          steps: [
            {
              index: 1,
              name: '<script>',
              normalizedName: '<script>',
              startedAt: '2026-07-20T00:00:00.000Z',
              completedAt: '2026-07-20T00:00:30.000Z',
              conclusion: 'success',
              isRunnerInternal: false,
            },
          ],
        },
      ],
      generatedAt: '2026-07-20T00:02:00.000Z',
    });
    const markdown = renderJobSummary(report);
    expect(markdown).toContain('build \\| unsafe');
    expect(markdown).toContain('&lt;script&gt;');
    expect(markdown).not.toContain('<script>');
  });
});
