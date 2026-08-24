// 零依赖的最小 ZIP 生成器（store 模式，不压缩）。
// 只为打包小体积的 SKILL.md 目录包使用，避免引入第三方依赖。
// 实现了 ZIP 本地文件头、中央目录和 EOCD 记录，以及 CRC32 校验。
// 读取侧（readZipEntries）支持 store 与 deflate，用于解析用户上传的技能 zip。

const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = {
  // ZIP 内的路径（用正斜杠），例如 "my-skill/SKILL.md"。
  path: string;
  content: string;
};

// DOS 时间/日期：固定为 1980-01-01 00:00:00，避免构建产物随时间变化。
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}
function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

// 把若干文本条目打包成 ZIP，返回字节流。
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  type Record = { nameBytes: Uint8Array; crc: number; size: number; localOffset: number };
  const records: Record[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const size = data.length;

    // 本地文件头（30 字节固定部分 + 文件名 + 数据）。
    const header = new Uint8Array(30);
    const headerView = new DataView(header.buffer);
    writeUint32(headerView, 0, 0x04034b50); // local file header signature
    writeUint16(headerView, 4, 20); // version needed
    writeUint16(headerView, 6, 0x0800); // flags: UTF-8 filename
    writeUint16(headerView, 8, 0); // compression: store
    writeUint16(headerView, 10, DOS_TIME);
    writeUint16(headerView, 12, DOS_DATE);
    writeUint32(headerView, 14, crc);
    writeUint32(headerView, 18, size); // compressed size
    writeUint32(headerView, 22, size); // uncompressed size
    writeUint16(headerView, 26, nameBytes.length);
    writeUint16(headerView, 28, 0); // extra field length

    localParts.push(header, nameBytes, data);
    records.push({ nameBytes, crc, size, localOffset: offset });
    offset += header.length + nameBytes.length + data.length;
  }

  // 中央目录。
  for (const record of records) {
    const central = new Uint8Array(46);
    const view = new DataView(central.buffer);
    writeUint32(view, 0, 0x02014b50); // central dir signature
    writeUint16(view, 4, 20); // version made by
    writeUint16(view, 6, 20); // version needed
    writeUint16(view, 8, 0x0800); // flags: UTF-8
    writeUint16(view, 10, 0); // compression: store
    writeUint16(view, 12, DOS_TIME);
    writeUint16(view, 14, DOS_DATE);
    writeUint32(view, 16, record.crc);
    writeUint32(view, 20, record.size);
    writeUint32(view, 24, record.size);
    writeUint16(view, 28, record.nameBytes.length);
    writeUint16(view, 30, 0); // extra length
    writeUint16(view, 32, 0); // comment length
    writeUint16(view, 34, 0); // disk number
    writeUint16(view, 36, 0); // internal attrs
    writeUint32(view, 38, 0); // external attrs
    writeUint32(view, 42, record.localOffset);
    centralParts.push(central, record.nameBytes);
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;

  // EOCD（End of Central Directory）。
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 4, 0); // disk number
  writeUint16(eocdView, 6, 0); // central dir start disk
  writeUint16(eocdView, 8, records.length);
  writeUint16(eocdView, 10, records.length);
  writeUint32(eocdView, 12, centralSize);
  writeUint32(eocdView, 16, centralOffset);
  writeUint16(eocdView, 20, 0); // comment length

  // 拼接所有片段。
  const totalSize = offset + centralSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

// --- 读取侧 -------------------------------------------------------------
// 解析 ZIP 字节流，返回每个条目的路径与（解压后的）内容。支持：
//   - compression method 0（store，不压缩）
//   - compression method 8（deflate，最常见）
// 用中央目录定位条目（尺寸以中央目录为准，兼容带数据描述符的本地头）。
import { inflateRawSync } from "node:zlib";

export type ZipReadEntry = { path: string; data: Uint8Array };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function readZipEntries(bytes: Uint8Array): ZipReadEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // 从尾部向前找 EOCD（最多回扫 64KB + 22，覆盖 zip 注释）。
  let eocd = -1;
  const minEocd = Math.max(0, bytes.length - (65536 + 22));
  for (let i = bytes.length - 22; i >= minEocd; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("invalid zip: EOCD not found");
  }

  const centralCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipReadEntry[] = [];

  for (let i = 0; i < centralCount; i += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error("invalid zip: central entry signature mismatch");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const path = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));

    // 跳过目录项（macOS 的 __MACOSX、常见隐藏文件）。
    const isDirectory = path.endsWith("/");
    if (isDirectory) {
      cursor = nameStart + nameLen + extraLen + commentLen;
      continue;
    }

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error("invalid zip: local header signature mismatch");
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === 0) {
      data = raw;
    } else if (method === 8) {
      data = inflateRawSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
    } else {
      throw new Error(`unsupported zip compression method: ${method}`);
    }
    if (data.length !== uncompressedSize) {
      throw new Error(`zip entry size mismatch: ${path}`);
    }

    entries.push({ path, data });
    cursor = nameStart + nameLen + extraLen + commentLen;
  }

  return entries;
}
