import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type ObjectStorage = {
  putObject: (
    key: string,
    body: Buffer | string,
    contentType?: string,
  ) => Promise<void>;
  getObject: (key: string) => Promise<Buffer>;
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
});

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
