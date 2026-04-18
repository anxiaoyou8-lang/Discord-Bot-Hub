const SEPARATOR = ":";

export function encodeFileInfo(userId: string): string {
  const timestamp = Date.now();
  const raw = `${timestamp}${SEPARATOR}${userId}`;
  return Buffer.from(raw, "utf-8").toString("base64url");
}

export interface DecodedFileInfo {
  timestamp: number;
  userId: string;
}

export function decodeFileInfo(encoded: string): DecodedFileInfo | null {
  try {
    const raw = Buffer.from(encoded, "base64url").toString("utf-8");
    const sepIdx = raw.indexOf(SEPARATOR);
    if (sepIdx === -1) return null;
    const tsStr = raw.slice(0, sepIdx);
    const userId = raw.slice(sepIdx + 1);
    const timestamp = parseInt(tsStr, 10);
    if (isNaN(timestamp) || !userId) return null;
    return { timestamp, userId };
  } catch {
    return null;
  }
}

export function buildRenamedFilename(originalName: string, encoded: string): string {
  const dotIdx = originalName.lastIndexOf(".");
  const ext = dotIdx !== -1 ? originalName.slice(dotIdx) : "";
  return `${encoded}${ext}`;
}
