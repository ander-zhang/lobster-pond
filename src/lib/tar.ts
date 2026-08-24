import { gunzipSync } from "node:zlib";

export type TarReadEntry = {
  path: string;
  data: Uint8Array;
};

// 读取 gzip 压缩的 tar 包，支持常见的 ustar/PAX 文件条目。
export function readTarGzEntries(bytes: Uint8Array): TarReadEntry[] {
  let tar: Buffer;
  try {
    tar = gunzipSync(Buffer.from(bytes));
  } catch {
    throw new Error("不是有效的 gzip 文件");
  }

  const entries: TarReadEntry[] = [];
  let offset = 0;
  let pendingPath: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const type = header[156];
    const size = parseOctal(header.subarray(124, 136));
    const rawPath = readString(header.subarray(0, 100));
    const prefix = readString(header.subarray(345, 500));
    const path = pendingPath ?? (prefix ? `${prefix}/${rawPath}` : rawPath);
    pendingPath = null;
    offset += 512;

    if (offset + size > tar.length) {
      throw new Error("tar 文件条目超出文件范围");
    }
    const data = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    // GNU long name 与 PAX path 扩展用于承载超出 ustar 字段长度的路径。
    if (type === 76) {
      pendingPath = readString(data);
      continue;
    }
    if (type === 120) {
      const paxPath = readPaxPath(data);
      if (paxPath) pendingPath = paxPath;
      continue;
    }
    // 目录、链接等不是可读取的技能文件，其他常规文件保留。
    if (type === 53 || type === 50 || type === 49) continue;
    if (path) entries.push({ path, data: new Uint8Array(data) });
  }
  return entries;
}

function readString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(bytes.subarray(0, end < 0 ? bytes.length : end)).trim();
}

function parseOctal(bytes: Uint8Array): number {
  const value = readString(bytes).replace(/^\0+/, "").trim();
  if (!/^[0-7]+$/.test(value)) throw new Error("tar 文件包含无效的条目大小");
  return parseInt(value, 8);
}

function readPaxPath(data: Uint8Array): string | null {
  const text = new TextDecoder().decode(data);
  for (const record of text.split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(record);
    if (match) return match[1];
  }
  return null;
}
