import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from './logger';

// Credentials resolved automatically from EC2/ECS instance role via IMDSv2
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
});

const BUCKET_NAME = process.env.AUDIT_S3_BUCKET || 'your-audit-logs-bucket';

export async function uploadToS3(key: string, data: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: data,
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  });

  await s3Client.send(command);
  logger.info(`Uploaded audit archive to s3://${BUCKET_NAME}/${key}`);
  return `s3://${BUCKET_NAME}/${key}`;
}

export { BUCKET_NAME };
