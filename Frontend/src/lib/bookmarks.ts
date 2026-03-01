/**
 * Bookmarked questions - stored in localStorage per dbId
 */

const STORAGE_KEY = "chanakya:bookmarks";

export interface Bookmark {
  id: string;
  question: string;
  dbId: string;
  createdAt: string;
}

function loadAll(): Record<string, Bookmark[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(data: Record<string, Bookmark[]>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("chanakya:bookmarks-updated"));
  } catch {
    //
  }
}

export function getBookmarks(dbId: string): Bookmark[] {
  const data = loadAll();
  return (data[dbId] ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addBookmark(dbId: string, question: string): Bookmark {
  const data = loadAll();
  const list = data[dbId] ?? [];
  const existing = list.find((b) => b.question.trim() === question.trim());
  if (existing) return existing;

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    question: question.trim(),
    dbId,
    createdAt: new Date().toISOString(),
  };
  data[dbId] = [...list, bookmark];
  save(data);
  return bookmark;
}

export function removeBookmark(dbId: string, id: string) {
  const data = loadAll();
  const list = (data[dbId] ?? []).filter((b) => b.id !== id);
  data[dbId] = list;
  save(data);
}

export function isBookmarked(dbId: string, question: string): boolean {
  const list = getBookmarks(dbId);
  return list.some((b) => b.question.trim() === question.trim());
}

export function getBookmarkId(dbId: string, question: string): string | null {
  const list = getBookmarks(dbId);
  const b = list.find((x) => x.question.trim() === question.trim());
  return b?.id ?? null;
}
