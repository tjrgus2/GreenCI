import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { GreenCIConfigFileSchema } from '@greenci/core';

/**
 * Documentation drift is a real defect: a configuration example that no longer
 * validates teaches users something false. These tests parse what the docs
 * actually say and check it against the shipped contracts.
 */

/**
 * Read a document with its line endings normalized.
 *
 * The fence patterns below anchor on `\n`, so a CRLF working tree — the default
 * on Windows with `core.autocrlf=true` — matched nothing and quietly reduced the
 * per-example checks to zero cases. What these tests assert is content, not
 * encoding.
 */
function read(relativePath: string): string {
  return readFileSync(resolve(relativePath), 'utf8').replaceAll('\r\n', '\n');
}

function fencedBlocks(markdown: string, language: string): string[] {
  return [
    ...markdown.matchAll(
      new RegExp(`^\`\`\`${language}\\n([\\s\\S]*?)^\`\`\`$`, 'gmu'),
    ),
  ].map((match) => match[1] ?? '');
}

/** A configuration example, as opposed to a workflow example. */
function isConfigExample(block: string): boolean {
  return /^version: 1$/mu.test(block);
}

const documents = [
  'README.md',
  'README.ko.md',
  'CONTRIBUTING.md',
  'docs/demo.md',
  'docs/methodology.md',
  'docs/security-model.md',
  'docs/data-sources.md',
];

describe('documented configuration examples', () => {
  const examples = documents.flatMap((path) =>
    fencedBlocks(read(path), 'yaml')
      .filter(isConfigExample)
      .map((block, index) => ({ path, index, block })),
  );

  it('finds the documented examples', () => {
    // README carries minimal-plus-recommended, strict budget, and advanced;
    // the Korean README repeats the recommended one.
    expect(examples.length).toBeGreaterThanOrEqual(4);
  });

  it.each(
    documents.flatMap((path) =>
      fencedBlocks(read(path), 'yaml')
        .filter(isConfigExample)
        .map((block, index) => ({ path, index, block })),
    ),
  )('validates $path example $index', ({ block }) => {
    const parsed: unknown = parse(block, { maxAliasCount: 0, merge: false });
    const result = GreenCIConfigFileSchema.safeParse(parsed);
    expect(
      result.success,
      result.success
        ? ''
        : result.error.issues
            .map(
              (issue) =>
                `${issue.path.join('.') || '(root)'}: ${issue.message}`,
            )
            .join('; '),
    ).toBe(true);
  });
});

describe('documented workflow examples', () => {
  const workflows = documents.flatMap((path) =>
    fencedBlocks(read(path), 'yaml')
      .filter((block) => !isConfigExample(block) && block.includes('greenci:'))
      .map((block) => ({ path, block })),
  );

  it('finds the quick-start example in both READMEs', () => {
    expect(workflows.map((entry) => entry.path)).toEqual([
      'README.md',
      'README.ko.md',
    ]);
  });

  it.each(
    documents.flatMap((path) =>
      fencedBlocks(read(path), 'yaml')
        .filter(
          (block) => !isConfigExample(block) && block.includes('greenci:'),
        )
        .map((block) => ({ path, block })),
    ),
  )(
    '$path quick start is valid YAML with the documented contract',
    ({ block }) => {
      const parsed = z
        .object({
          jobs: z.object({
            greenci: z
              .object({
                if: z.literal('always()'),
                needs: z.array(z.string()).min(1),
                'runs-on': z.string().min(1),
                permissions: z.object({
                  actions: z.literal('read'),
                  contents: z.literal('read'),
                  'pull-requests': z.literal('write'),
                }),
                steps: z
                  .array(
                    z
                      .object({
                        uses: z.string().optional(),
                        with: z.record(z.string(), z.unknown()).optional(),
                      })
                      .loose(),
                  )
                  .min(1),
              })
              .loose(),
          }),
        })
        .loose()
        .safeParse(parse(block, { maxAliasCount: 0, merge: false }));
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

      const step = parsed.data?.jobs.greenci.steps[0];
      expect(step?.uses).toBe('tjrgus2/GreenCI@v1');
      expect(step?.with?.['github-token']).toBe('${{ secrets.GITHUB_TOKEN }}');
    },
  );

  it('documents SHA pinning with a real 40-character commit', () => {
    for (const path of ['README.md', 'README.ko.md']) {
      const pins = [
        ...read(path).matchAll(/tjrgus2\/GreenCI@([0-9a-f]{40})/gu),
      ];
      expect(pins.length, path).toBeGreaterThan(0);
    }
  });
});

describe('documented Action inputs match action.yml', () => {
  const actionInputs = Object.keys(
    z
      .object({ inputs: z.record(z.string(), z.unknown()) })
      .loose()
      .parse(parse(read('action.yml'), { maxAliasCount: 0 })).inputs,
  ).sort();

  const actionOutputs = Object.keys(
    z
      .object({ outputs: z.record(z.string(), z.unknown()) })
      .loose()
      .parse(parse(read('action.yml'), { maxAliasCount: 0 })).outputs,
  ).sort();

  it('lists every input in the README table', () => {
    const readme = read('README.md');
    for (const input of actionInputs) {
      expect(readme, input).toContain(`\`${input}\``);
    }
  });

  it('lists every output in the README table', () => {
    const readme = read('README.md');
    for (const output of actionOutputs) {
      expect(readme, output).toContain(`\`${output}\``);
    }
  });

  it('does not document an input that does not exist', () => {
    const documented = [
      ...read('README.md').matchAll(/^\| `([a-z-]+)` \| /gmu),
    ].map((match) => match[1] ?? '');
    for (const name of documented) {
      // The inputs table is the only one keyed by a lowercase hyphenated name.
      if (actionInputs.includes(name)) {
        continue;
      }
      expect(actionOutputs, name).toContain(name);
    }
  });
});
