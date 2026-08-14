import { deflateRawSync } from 'node:zlib';

/** One member to place into a synthetic archive. */
export interface ZipMember {
  readonly path: string;
  readonly data: Buffer | string;
  /** 0 = stored, 8 = deflate. */
  readonly method?: 0 | 8;
  /** Raw external attributes; the high 16 bits carry the unix mode. */
  readonly externalAttributes?: number;
  /** Override the declared uncompressed size, for hostile-archive tests. */
  readonly declaredUncompressedSize?: number;
  /** Override the declared compressed size, for hostile-archive tests. */
  readonly declaredCompressedSize?: number;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

/** Unix mode bits marking a symbolic link, shifted into external attributes. */
export const SYMLINK_ATTRIBUTES = 0xa1ff * 0x10000;

/**
 * Build a minimal but valid ZIP archive in memory.
 *
 * Only the fields GreenCI's reader inspects are populated, which makes it easy
 * to construct deliberately hostile archives for the security tests.
 */
export function buildZip(members: readonly ZipMember[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const member of members) {
    const raw = Buffer.isBuffer(member.data)
      ? member.data
      : Buffer.from(member.data, 'utf8');
    const method = member.method ?? 0;
    const payload = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(member.path, 'utf8');
    const compressedSize = member.declaredCompressedSize ?? payload.byteLength;
    const uncompressedSize = member.declaredUncompressedSize ?? raw.byteLength;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.byteLength, 26);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(member.externalAttributes ?? 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.byteLength + name.byteLength + payload.byteLength;
  }

  const localBlock = Buffer.concat(localParts);
  const centralBlock = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralBlock.byteLength, 12);
  eocd.writeUInt32LE(localBlock.byteLength, 16);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

/** A small, valid JUnit XML document. */
export function junitXml(
  options: {
    readonly suite?: string;
    readonly cases?: readonly {
      name: string;
      time: number;
      status?: 'passed' | 'failed' | 'error' | 'skipped';
      message?: string;
    }[];
  } = {},
): string {
  const suite = options.suite ?? 'example.Suite';
  const cases = options.cases ?? [{ name: 'works', time: 0.5 }];
  const body = cases
    .map((entry) => {
      const open = `<testcase classname="${suite}" name="${entry.name}" time="${entry.time}"`;
      if (entry.status === 'failed') {
        return `${open}><failure message="${entry.message ?? 'assertion failed'}">detail</failure></testcase>`;
      }
      if (entry.status === 'error') {
        return `${open}><error message="${entry.message ?? 'crashed'}">detail</error></testcase>`;
      }
      if (entry.status === 'skipped') {
        return `${open}><skipped /></testcase>`;
      }
      return `${open} />`;
    })
    .join('\n    ');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    `  <testsuite name="${suite}" tests="${cases.length}">`,
    `    ${body}`,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
