// 测试用最小 ZIP 写入器：生成标准 ZIP（stored/deflate），可构造恶意条目
// （路径穿越、符号链接、声明超大文件等），不依赖系统 zip 命令。
import zlib from "node:zlib";

export interface ZipEntryInput {
  name: string;
  content?: Buffer | string;
  isDirectory?: boolean;
  isSymlink?: boolean;
  method?: "stored" | "deflate";
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface PreparedEntry {
  name: Buffer;
  method: number;
  compressed: Buffer;
  uncompressedSize: number;
  crc: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

function prepare(entry: ZipEntryInput): PreparedEntry {
  const content = entry.content === undefined ? Buffer.alloc(0) : Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
  const method = entry.method === "deflate" || content.length > 0 ? 8 : 0;
  const compressed = method === 8 ? zlib.deflateRawSync(content) : content;
  return {
    name: Buffer.from(entry.name, "utf8"),
    method,
    compressed,
    uncompressedSize: content.length,
    crc: crc32(content),
    isDirectory: entry.isDirectory === true,
    isSymlink: entry.isSymlink === true,
  };
}

export function createZip(entries: ZipEntryInput[]): Buffer {
  const prepared = entries.map(prepare);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of prepared) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date
    local.writeUInt32LE(entry.crc, 14);
    local.writeUInt32LE(entry.compressed.length, 18);
    local.writeUInt32LE(entry.uncompressedSize, 22);
    local.writeUInt16LE(entry.name.length, 26);
    local.writeUInt16LE(0, 28); // extra
    localParts.push(local, entry.name, entry.compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // version made by (Unix)
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(0, 12); // time
    central.writeUInt16LE(0x21, 14); // date
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressed.length, 20);
    central.writeUInt32LE(entry.uncompressedSize, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    let externalAttrs = 0o100644 << 16;
    if (entry.isDirectory) externalAttrs = (0o40755 << 16) | 0x10;
    if (entry.isSymlink) externalAttrs = 0o120777 << 16;
    central.writeUInt32LE(externalAttrs >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, entry.name);

    offset += 30 + entry.name.length + entry.compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd disk
  eocd.writeUInt16LE(prepared.length, 8);
  eocd.writeUInt16LE(prepared.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}
