import { describe, expect, it } from 'vitest';
import {
  MAX_CONFIG_BYTES,
  loadRepositoryConfig,
} from '../src/config/repository-config.js';
import { fakeSource, httpError } from './fake-source.js';

const reference = {
  owner: 'owner',
  repository: 'repo',
  path: '.greenci.yml',
  ref: 'abc123',
};

function fileResponse(contents: string, overrides: object = {}): unknown {
  return {
    type: 'file',
    encoding: 'base64',
    size: Buffer.byteLength(contents, 'utf8'),
    content: Buffer.from(contents, 'utf8').toString('base64'),
    ...overrides,
  };
}

describe('repository configuration loading', () => {
  it('decodes a YAML mapping at the analyzed revision', async () => {
    const source = fakeSource({
      async getFileContent(parameters) {
        expect(parameters.ref).toBe('abc123');
        return fileResponse('version: 1\nlocale: ko\n');
      },
    });
    const result = await loadRepositoryConfig(source, reference);
    expect(result.raw).toEqual({ version: 1, locale: 'ko' });
    expect(result.warnings).toEqual([]);
  });

  it('treats a missing file as a normal absence of configuration', async () => {
    const result = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          throw httpError(404);
        },
      }),
      reference,
    );
    expect(result.raw).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('warns instead of failing when the file cannot be read', async () => {
    const result = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          throw httpError(403);
        },
      }),
      reference,
    );
    expect(result.warnings[0]?.code).toBe('CONFIG_UNAVAILABLE');
  });

  it('rejects a directory, an unsupported encoding, and an oversized file', async () => {
    const directory = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return [{ type: 'dir' }];
        },
      }),
      reference,
    );
    expect(directory.warnings[0]?.code).toBe('CONFIG_UNAVAILABLE');

    const encoding = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return fileResponse('version: 1', { encoding: 'none', content: '' });
        },
      }),
      reference,
    );
    expect(encoding.warnings[0]?.message).toContain('content encoding');

    const oversized = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return fileResponse('version: 1', { size: MAX_CONFIG_BYTES + 1 });
        },
      }),
      reference,
    );
    expect(oversized.warnings[0]?.message).toContain('exceeds');
  });

  it('rejects a decoded payload larger than the declared size', async () => {
    const payload = 'a'.repeat(MAX_CONFIG_BYTES + 10);
    const result = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return {
            type: 'file',
            encoding: 'base64',
            size: 10,
            content: Buffer.from(payload, 'utf8').toString('base64'),
          };
        },
      }),
      reference,
    );
    expect(result.warnings[0]?.message).toContain('exceeds');
  });

  it('rejects YAML aliases used as an amplification vector', async () => {
    const bomb = [
      'a: &anchor',
      '  - value',
      '  - value',
      'b: *anchor',
      '',
    ].join('\n');
    const result = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return fileResponse(bomb);
        },
      }),
      reference,
    );
    expect(result.raw).toBeUndefined();
    expect(result.warnings[0]?.code).toBe('CONFIG_INVALID');
  });

  it('rejects a non-mapping document and an empty document', async () => {
    const sequence = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return fileResponse('- one\n- two\n');
        },
      }),
      reference,
    );
    expect(sequence.warnings[0]?.code).toBe('CONFIG_INVALID');

    const empty = await loadRepositoryConfig(
      fakeSource({
        async getFileContent() {
          return fileResponse('\n');
        },
      }),
      reference,
    );
    expect(empty.raw).toBeUndefined();
    expect(empty.warnings).toEqual([]);
  });
});
