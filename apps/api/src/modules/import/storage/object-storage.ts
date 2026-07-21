import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

export type ObjectStorage = {
  putObject: (
    key: string,
    body: Buffer | string,
    contentType?: string,
  ) => Promise<void>;
  getObject: (key: string) => Promise<Buffer>;
  headObject: (key: string) => Promise<{ contentLength: number; contentType?: string }>;
  getObjectStream: (
    key: string,
    range?: { start: number; end: number },
  ) => Promise<{
    body: Readable;
    contentLength: number;
    contentRange?: string;
    contentType?: string;
  }>;
  deleteObject: (key: string) => Promise<void>;
  getSignedDownloadUrl: (key: string, expiresInSeconds?: number) => Promise<string>;
};

export type S3EnvConfig = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
};

export const readS3Env = (): S3EnvConfig => ({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minio",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minio12345",
  bucket: process.env.S3_BUCKET ?? "factory",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

export const createS3Client = (config: S3EnvConfig = readS3Env()): S3Client =>
  new S3Client({
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });

export const createObjectStorage = (
  client: S3Client = createS3Client(),
  bucket: string = readS3Env().bucket,
): ObjectStorage => ({
  putObject: async (key, body, contentType) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
        ContentType: contentType,
      }),
    );
  },
  getObject: async (key) => {
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Empty S3 object: ${key}`);
    }
    return Buffer.from(bytes);
  },
  headObject: async (key) => {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType,
    };
  },
  getObjectStream: async (key, range) => {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(range
          ? { Range: `bytes=${range.start}-${range.end}` }
          : {}),
      }),
    );
    if (!result.Body) {
      throw new Error(`Empty S3 object stream: ${key}`);
    }
    const contentLength =
      result.ContentLength ??
      (range ? range.end - range.start + 1 : 0);
    return {
      body: result.Body as Readable,
      contentLength,
      contentRange: result.ContentRange,
      contentType: result.ContentType,
    };
  },
  deleteObject: async (key) => {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  },
  getSignedDownloadUrl: async (key, expiresInSeconds = 3600) =>
    getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    ),
});

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
