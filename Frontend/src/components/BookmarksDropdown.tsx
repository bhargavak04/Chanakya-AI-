"use client";

import React, { useState, useEffect } from "react";
import { Star, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBookmarks } from "@/lib/bookmarks";

interface BookmarksDropdownProps {
  dbId: string | null;
}

export function BookmarksDropdown({ dbId }: BookmarksDropdownProps) {
  const [bookmarks, setBookmarks] = useState<{ id: string; question: string; dbId: string; createdAt: string }[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    if (dbId) setBookmarks(getBookmarks(dbId));
  };

  useEffect(() => {
    refresh();
  }, [dbId]);

  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener("chanakya:bookmarks-updated", onUpdate);
    return () => window.removeEventListener("chanakya:bookmarks-updated", onUpdate);
  }, [dbId]);

  const handleSelect = (question: string) => {
    window.dispatchEvent(new CustomEvent("chanakya:use-bookmark", { detail: { question } }));
    setOpen(false);
  };

  if (!dbId) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors text-[12px] font-medium"
          title="Bookmarked questions"
        >
          <Star className="w-3.5 h-3.5" />
          <span>Bookmarks</span>
          {bookmarks.length > 0 && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {bookmarks.length}
            </span>
          )}
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[280px] max-w-md max-h-[320px] overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="py-6 px-4 text-center text-[13px] text-muted-foreground">
            No bookmarks yet. Star a question after getting an answer to save it here.
          </div>
        ) : (
          bookmarks.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => handleSelect(b.question)}
              className="cursor-pointer py-2.5 px-3 text-[13px] line-clamp-2"
            >
              {b.question}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
