import { inflateRawSync } from 'node:zlib';

/**
 * Hardened, dependency-free ZIP reader for untrusted CI artifacts.
 *
 * Artifacts are attacker-controlled in a fork pull request, so this reader is
 * deliberately conservative: it never writes to disk, never follows a symlink,
 * never accepts a path that could escape an extraction root, and enforces
 * count, size, and compression-ratio limits before allocating memory.
 */

/** Bounds applied while reading an artifact. */
export interface ZipLimits {
  readonly maxEntries: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxCompressionRatio: number;
}

/** Conservative defaults taken from the design contract. */
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 100,
  maxTotalUncompressedBytes: 10 * 1024 * 1024,
  maxEntryUncompressedBytes: 5 * 1024 * 1024,
  maxCompressionRatio: 200,
};

/** One accepted archive member. */
export interface ZipEntry {
  readonly path: string;
  readonly bytes: Buffer;
}

/** Why one member was refused. */
export interface ZipRejection {
  readonly path: string;
  readonly reason:
    | 'absolute-path'
    | 'path-traversal'
    | 'symlink'
    | 'unsupported-compression'
    | 'zip64-unsupported'
    | 'entry-too-large'
    | 'compression-ratio'
    | 'total-size'
    | 'entry-limit'
    | 'corrupt';
}

/** Everything the reader accepted, refused, or could not understand. */
export interface ZipReadResult {
  readonly entries: readonly ZipEntry[];
  readonly rejections: readonly ZipRejection[];
  readonly truncated: boolean;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;
const UNIX_SYMLINK = 0xa000;

class CorruptArchiveError extends Error {}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.byteLength - 65_557);
  for (let offset = buffer.byteLength - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new CorruptArchiveError('End of central directory not found');
}

/**
 * Validate an archive member path.
 *
 * Rejects absolute paths, Windows drive letters, UNC paths, and any `..`
 * segment, so a member can never be interpreted as a location outside an
 * extraction root even by a caller that does write to disk.
 */
export function validateArchivePath(
  raw: string,
): { ok: true; path: string } | { ok: false; reason: ZipRejection['reason'] } {
  const normalized = raw.replaceAll('\\', '/');
  if (normalized.length === 0 || normalized.includes('\0')) {
    return { ok: false, reason: 'corrupt' };
  }
  if (normalized.startsWith('/') || /^[a-zA-Z]:/u.test(normalized)) {
    return { ok: false, reason: 'absolute-path' };
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..')) {
    return { ok: false, reason: 'path-traversal' };
  }
  return {
    ok: true,
    path: segments.filter((segment) => segment !== '.').join('/'),
  };
}

interface CentralEntry {
  readonly rawPath: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly externalAttributes: number;
}

function readCentralDirectory(buffer: Buffer): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: CentralEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.byteLength) {
      throw new CorruptArchiveError('Central directory header out of bounds');
    }
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new CorruptArchiveError('Central directory signature mismatch');
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength;
    if (end > buffer.byteLength) {
      throw new CorruptArchiveError('Central directory name out of bounds');
    }
    entries.push({
      rawPath: buffer.toString('utf8', offset + 46, end),
      compressionMethod: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      externalAttributes: buffer.readUInt32LE(offset + 38),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset = end + extraLength + commentLength;
  }
  return entries;
}

function readMemberBytes(buffer: Buffer, entry: CentralEntry): Buffer {
  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.byteLength) {
    throw new CorruptArchiveError('Local header out of bounds');
  }
  if (buffer.readUInt32LE(header) !== LOCAL_SIGNATURE) {
    throw new CorruptArchiveError('Local header signature mismatch');
  }
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.byteLength) {
    throw new CorruptArchiveError('Compressed data out of bounds');
  }
  const compressed = buffer.subarray(start, end);
  const bytes =
    entry.compressionMethod === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, {
          maxOutputLength: entry.uncompressedSize + 1,
        });
  if (bytes.byteLength !== entry.uncompressedSize) {
    throw new CorruptArchiveError('Declared uncompressed size mismatch');
  }
  return bytes;
}

/** Read an in-memory ZIP archive under strict limits. */
export function readZipEntries(
  buffer: Buffer,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): ZipReadResult {
  const entries: ZipEntry[] = [];
  const rejections: ZipRejection[] = [];
  let truncated = false;
  let totalBytes = 0;

  let central: CentralEntry[];
  try {
    central = readCentralDirectory(buffer);
  } catch {
    return {
      entries: [],
      rejections: [{ path: '(archive)', reason: 'corrupt' }],
      truncated: false,
    };
  }

  for (const entry of central) {
    if (entry.rawPath.endsWith('/')) {
      continue;
    }
    if (entries.length >= limits.maxEntries) {
      rejections.push({ path: entry.rawPath, reason: 'entry-limit' });
      truncated = true;
      break;
    }

    const validated = validateArchivePath(entry.rawPath);
    if (!validated.ok) {
      rejections.push({ path: entry.rawPath, reason: validated.reason });
      continue;
    }
    if (((entry.externalAttributes >>> 16) & 0xf000) === UNIX_SYMLINK) {
      rejections.push({ path: validated.path, reason: 'symlink' });
      continue;
    }
    if (
      entry.compressedSize === ZIP64_SENTINEL ||
      entry.uncompressedSize === ZIP64_SENTINEL
    ) {
      rejections.push({ path: validated.path, reason: 'zip64-unsupported' });
      continue;
    }
    if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
      rejections.push({
        path: validated.path,
        reason: 'unsupported-compression',
      });
      continue;
    }
    if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
      rejections.push({ path: validated.path, reason: 'entry-too-large' });
      continue;
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio
    ) {
      rejections.push({ path: validated.path, reason: 'compression-ratio' });
      continue;
    }
    if (
      totalBytes + entry.uncompressedSize >
      limits.maxTotalUncompressedBytes
    ) {
      rejections.push({ path: validated.path, reason: 'total-size' });
      truncated = true;
      break;
    }

    try {
      const bytes = readMemberBytes(buffer, entry);
      totalBytes += bytes.byteLength;
      entries.push({ path: validated.path, bytes });
    } catch {
      rejections.push({ path: validated.path, reason: 'corrupt' });
    }
  }

  return { entries, rejections, truncated };
}
