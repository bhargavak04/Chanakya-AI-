'use client';

import { useState } from "react";
import { toast } from "sonner";
import { ChatArea } from "@/components/ChatArea";
import { RightPanel } from "@/components/RightPanel";
import { Search, ChevronDown, Share2, MoreHorizontal, Check } from "lucide-react";
import { BookmarksDropdown } from "@/components/BookmarksDropdown";
import { useApp } from "@/context/AppContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Home() {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const { activeDbId, databases, setActiveDbIdAndClearChat, setCustomizeTarget } = useApp();

  const handleOpenChartCustomize = (messageId: string, response: import("@/lib/api").ChatResponseSuccess) => {
    setCustomizeTarget(messageId, response);
    setIsRightPanelOpen(true);
  };
  const activeDb = databases.find((d) => d.id === activeDbId);

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border/40 flex items-center justify-between px-6 bg-background sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 -ml-2">
                  <span>Workspace</span>
                  <span className="text-border">/</span>
                  <span className="text-foreground">{activeDb?.name ?? "Select a database"}</span>
                  <ChevronDown className="w-3 h-3 ml-0.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {databases.map((db) => (
                  <DropdownMenuItem
                    key={db.id}
                    onClick={() => setActiveDbIdAndClearChat(db.id)}
                    className="flex items-center justify-between"
                  >
                    <span>{db.name}</span>
                    {db.id === activeDbId && <Check className="w-3.5 h-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <BookmarksDropdown dbId={activeDbId} />
            <div className="w-[1px] h-4 bg-border mx-1" />
            <button className="p-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
              <Search className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <button onClick={() => toast.info('Coming soon')} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/80 hover:bg-secondary border border-border text-[12px] font-medium transition-colors">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button className="p-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex relative bg-background">
          <ChatArea onOpenChartCustomize={handleOpenChartCustomize} />
        </div>
      </div>
      
      {isRightPanelOpen && (
        <RightPanel
          isOpen={isRightPanelOpen}
          onClose={() => {
            setIsRightPanelOpen(false);
            setCustomizeTarget(null, null);
          }}
        />
      )}
    </div>
  );
}
