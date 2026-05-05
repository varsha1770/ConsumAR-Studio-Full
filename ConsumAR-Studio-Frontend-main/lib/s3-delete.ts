import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

/**
 * THE CLEANER: Deletes objects from S3 buckets.
 */
export async function deleteS3Objects(keys: string[], bucketName: string) {
  if (keys.length === 0) return { success: true, count: 0 };

  const s3 = new S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn("[s3-delete] AWS credentials missing. Mocking deletion for keys:", keys);
      return { success: true, mocked: true, count: keys.length };
    }

    const command = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    });

    const response = await s3.send(command);
    console.log(`[s3-delete] Successfully deleted ${keys.length} objects from ${bucketName}`);
    return { success: true, response };
  } catch (error) {
    console.error("[s3-delete] Error deleting objects from S3:", error);
    return { success: false, error };
  }
}
