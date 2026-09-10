import { attachmentToRow, rowToAttachment } from "../mappers";
import type { Attachment } from "../models";
import { PRIMARY_KEYS } from "../schema";
import { buildUpsert, getDatabase, nowIso, toBind, type Row } from "../sqlite";
import { query, softDelete } from "./base";

export async function listAttachments(
  target: { loadId?: string; expenseId?: string },
): Promise<Attachment[]> {
  if (target.loadId) {
    const rows = await query<Row>(
      "SELECT * FROM attachments WHERE load_id = ? AND _deleted = 0 ORDER BY created_at DESC",
      [target.loadId],
    );
    return rows.map(rowToAttachment);
  }
  if (target.expenseId) {
    const rows = await query<Row>(
      "SELECT * FROM attachments WHERE expense_id = ? AND _deleted = 0 ORDER BY created_at DESC",
      [target.expenseId],
    );
    return rows.map(rowToAttachment);
  }
  return [];
}

export async function saveAttachment(attachment: Attachment): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const { sql, values } = buildUpsert(
    "attachments",
    { ...attachmentToRow(attachment), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
    PRIMARY_KEYS.attachments,
  );
  await db.runAsync(sql, values);
}

export async function deleteAttachment(id: string): Promise<void> {
  await softDelete("attachments", id);
}

/** Attachments still sitting on the device waiting for a connection. */
export async function pendingUploads(): Promise<Attachment[]> {
  const rows = await query<Row>(
    "SELECT * FROM attachments WHERE _deleted = 0 AND uploaded = 0 AND local_uri IS NOT NULL",
  );
  return rows.map(rowToAttachment);
}

export async function markUploaded(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE attachments SET uploaded = 1, updated_at = ?, _dirty = 1 WHERE id = ?", toBind([
    nowIso(),
    id,
  ]));
}
