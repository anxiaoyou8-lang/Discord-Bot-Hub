import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "../lib/logger.js";

function getR2Client() {
  const accountId = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY must all be set"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucketName() {
  const bucket = process.env["R2_BUCKET_NAME"];
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set");
  return bucket;
}

export async function saveFileToStorage(
  buffer: Buffer,
  originalFilename: string
): Promise<string> {
  const key = `artwork-files/${randomUUID()}/${originalFilename}`;
  const client = getR2Client();
  const bucket = getBucketName();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
    })
  );

  logger.info({ key, bytes: buffer.length }, "File saved to R2 storage");
  return key;
}

export async function loadFileFromStorage(key: string): Promise<Buffer> {
  const client = getR2Client();
  const bucket = getBucketName();

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error(`File not found in R2: ${key}`);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function isStorageKey(value: string): boolean {
  return value.startsWith("artwork-files/");
}
