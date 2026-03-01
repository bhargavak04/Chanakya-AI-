/**
 * Conversation memory - short-term state per session
 */
import { getInternalDb, generateId } from "../db/internal.js";
import type { ConversationState } from "../../types/index.js";

export function createConversation(activeDbId: string): string {
  const db = getInternalDb();
  const id = generateId();
  db.prepare(
    `INSERT INTO conversations (id, active_db_id, updated_at) VALUES (?, ?, datetime('now'))`
  ).run(id, activeDbId);
  return id;
}

export function getConversation(conversationId: string): { active_db_id: string } | null {
  const db = getInternalDb();
  const row = db.prepare("SELECT active_db_id FROM conversations WHERE id = ?").get(conversationId) as
    | { active_db_id: string }
    | undefined;
  return row ?? null;
}

export function getLatestState(conversationId: string): ConversationState | null {
  const db = getInternalDb();
  const row = db
    .prepare(
      `SELECT structured_state FROM conversation_turns 
       WHERE conversation_id = ? AND structured_state IS NOT NULL 
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(conversationId) as { structured_state: string } | undefined;

  if (!row?.structured_state) return null;
  try {
    return JSON.parse(row.structured_state) as ConversationState;
  } catch {
    return null;
  }
}

export function addTurn(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  structuredState?: ConversationState
): void {
  const db = getInternalDb();
  const id = generateId();
  db.prepare(
    `INSERT INTO conversation_turns (id, conversation_id, role, content, structured_state)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, conversationId, role, content, structuredState ? JSON.stringify(structuredState) : null);

  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
}
