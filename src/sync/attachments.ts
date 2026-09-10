import * as FileSystem from "expo-file-system";
import { attachmentsRepo } from "@/db";
import { supabase } from "@/lib/supabase";

/**
 * Photo upload, separated from row sync because the two fail differently: a
 * failed row push is retried in seconds, a failed 4MB photo upload should not
 * hold up the loads list.
 *
 * The file stays on the device until the upload succeeds, so a rate
 * confirmation photographed in a yard with no signal is not lost.
 */

const BUCKET = "documents";

export async function uploadPendingAttachments(): Promise<{ uploaded: number; failed: number }> {
  const client = supabase;
  if (!client) return { uploaded: 0, failed: 0 };

  const pending = await attachmentsRepo.pendingUploads();
  let uploaded = 0;
  let failed = 0;

  for (const attachment of pending) {
    if (!attachment.localUri) continue;
    try {
      const file = new FileSystem.File(attachment.localUri);
      if (!file.exists) {
        // The OS cleared the cache before we got a connection. Nothing to
        // upload and nothing to retry forever.
        await attachmentsRepo.deleteAttachment(attachment.id);
        continue;
      }

      const bytes = await file.bytes();
      const { error } = await client.storage.from(BUCKET).upload(attachment.storagePath, bytes, {
        contentType: attachment.mimeType ?? "application/octet-stream",
        upsert: true,
      });
      if (error) {
        failed += 1;
        continue;
      }

      await attachmentsRepo.markUploaded(attachment.id);
      uploaded += 1;
    } catch {
      failed += 1;
    }
  }

  return { uploaded, failed };
}

/** A signed URL for viewing, since the bucket is private. */
export async function signedUrlFor(storagePath: string, expiresIn = 3600): Promise<string | null> {
  const client = supabase;
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  return error ? null : (data?.signedUrl ?? null);
}

/** Storage paths are always prefixed with the owner's uid — the policy checks it. */
export function storagePathFor(
  userId: string,
  scope: "loads" | "expenses",
  entityId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/${scope}/${entityId}/${Date.now()}-${safeName}`;
}
