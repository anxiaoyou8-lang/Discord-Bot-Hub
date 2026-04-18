import crypto from "node:crypto";

export function generateTraceId(): string {
  return crypto.randomBytes(6).toString("hex");
}

// ── CRC32 for PNG ──────────────────────────────────────────────────────────
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC32_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG tEXt watermark ─────────────────────────────────────────────────────
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const TEXT_KEY = "trace_id";

function buildTextChunk(keyword: string, value: string): Buffer {
  const data = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(value, "latin1"),
  ]);
  const type = Buffer.from("tEXt", "ascii");
  const chunkCrc = crc32(Buffer.concat([type, data]));
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  type.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(chunkCrc, 8 + data.length);
  return out;
}

export function injectPngWatermark(buf: Buffer, traceId: string): Buffer {
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error("Not a PNG");
  const iendIdx = buf.indexOf(Buffer.from("IEND", "ascii"));
  if (iendIdx === -1) throw new Error("No IEND chunk");
  const insertAt = iendIdx - 4;
  const chunk = buildTextChunk(TEXT_KEY, traceId);
  return Buffer.concat([buf.subarray(0, insertAt), chunk, buf.subarray(insertAt)]);
}

export function extractPngWatermark(buf: Buffer): string | null {
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString("ascii");
    if (type === "tEXt") {
      const data = buf.subarray(pos + 8, pos + 8 + len);
      const nullI = data.indexOf(0);
      if (nullI !== -1 && data.subarray(0, nullI).toString("latin1") === TEXT_KEY) {
        return data.subarray(nullI + 1).toString("latin1");
      }
    }
    if (type === "IEND") break;
    pos += 4 + 4 + len + 4;
  }
  return null;
}

// ── Zero-width steganography for text files ────────────────────────────────
function toBinaryString(s: string): string {
  return [...s].map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join("");
}

function encodeZeroWidth(traceId: string): string {
  return toBinaryString(traceId)
    .split("")
    .map((b) => (b === "0" ? "\u200b" : "\u200c"))
    .join("");
}

export function injectTextWatermark(content: string, traceId: string): string {
  const hidden = encodeZeroWidth(traceId);
  if (content.length === 0) return hidden;
  return content[0] + hidden + content.slice(1);
}

export function extractTextWatermark(content: string): string | null {
  const bits: string[] = [];
  for (const ch of content) {
    if (ch === "\u200b") bits.push("0");
    else if (ch === "\u200c") bits.push("1");
  }
  if (bits.length < 8) return null;
  let result = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    result += String.fromCharCode(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  return result || null;
}

// ── JSON whitespace watermark ──────────────────────────────────────────────
function encodeJsonWhitespace(traceId: string): string {
  return toBinaryString(traceId)
    .split("")
    .map((b) => (b === "0" ? " " : "\t"))
    .join("");
}

export function injectJsonWatermark(content: string, traceId: string): string {
  return content + encodeJsonWhitespace(traceId);
}

export function extractJsonWatermark(content: string): string | null {
  const trimmed = content.trimEnd();
  const suffix = content.slice(trimmed.length);
  const bits: string[] = [];
  for (const ch of suffix) {
    if (ch === " ") bits.push("0");
    else if (ch === "\t") bits.push("1");
  }
  if (bits.length < 8) return null;
  let result = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    result += String.fromCharCode(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  return result || null;
}

// ── Dispatcher ─────────────────────────────────────────────────────────────
const TEXT_EXTS = new Set([
  ".txt", ".md", ".csv", ".html", ".htm", ".xml",
  ".js", ".ts", ".py", ".java", ".c", ".cpp", ".css",
]);

export type WatermarkResult =
  | { ok: true; buffer: Buffer; method: string }
  | { ok: false; buffer: Buffer; method: "none"; reason: string };

export async function applyWatermark(
  fileUrl: string,
  filename: string,
  traceId: string
): Promise<WatermarkResult> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  const lower = filename.toLowerCase();
  const dotIdx = lower.lastIndexOf(".");
  const ext = dotIdx !== -1 ? lower.slice(dotIdx) : "";

  try {
    if (ext === ".png") {
      return { ok: true, buffer: injectPngWatermark(buf, traceId), method: "png-tEXt" };
    }
    if (ext === ".json") {
      const text = buf.toString("utf-8");
      return { ok: true, buffer: Buffer.from(injectJsonWatermark(text, traceId), "utf-8"), method: "json-whitespace" };
    }
    if (TEXT_EXTS.has(ext)) {
      const text = buf.toString("utf-8");
      return { ok: true, buffer: Buffer.from(injectTextWatermark(text, traceId), "utf-8"), method: "zero-width" };
    }
    return { ok: false, buffer: buf, method: "none", reason: `unsupported extension: ${ext || "(none)"}` };
  } catch (err) {
    return {
      ok: false,
      buffer: buf,
      method: "none",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
