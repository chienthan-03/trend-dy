import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minio",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minio12345",
  },
  forcePathStyle: true,
});

const bucket = process.env.S3_BUCKET ?? "factory";

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`Bucket "${bucket}" already exists`);
} catch {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Created bucket "${bucket}"`);
}
