import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

function getBucket() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  return objectStorageClient.bucket(bucketId);
}

export async function saveFileToStorage(
  buffer: Buffer,
  originalFilename: string
): Promise<string> {
  const key = `artwork-files/${randomUUID()}/${originalFilename}`;
  const bucket = getBucket();
  const file = bucket.file(key);
  await file.save(buffer, { resumable: false });
  logger.info({ key, bytes: buffer.length }, "File saved to object storage");
  return key;
}

export async function loadFileFromStorage(key: string): Promise<Buffer> {
  const bucket = getBucket();
  const file = bucket.file(key);
  const [buffer] = await file.download();
  return buffer;
}

export function isStorageKey(value: string): boolean {
  return value.startsWith("artwork-files/");
}
