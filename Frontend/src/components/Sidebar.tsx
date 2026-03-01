'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { 
  PlusCircle, 
  FileText, 
  Database, 
  Bell, 
  Settings, 
  Search,
  ChevronRight,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';

function showComingSoon() {
  toast.info('Coming soon');
}

const navItems = [
  { icon: PlusCircle, label: 'New Chat', key: 'chat', href: '/' },
  { icon: FileText, label: 'Saved Reports', key: 'saved', href: '#' },
  { icon: Database, label: 'Data Sources', key: 'dataSources', href: '/data-sources' },
  { icon: Bell, label: 'Alerts', key: 'alerts', href: '#' },
  { icon: Settings, label: 'Settings', key: 'settings', href: '#' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { setConversationId, setChartTypeOverride } = useApp();

  const handleNewChat = () => {
    setConversationId(null);
    setChartTypeOverride(null);
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent('chanakya:new-chat'));
    } else if (typeof window !== 'undefined') {
      sessionStorage.setItem('chanakya:new-chat', '1');
    }
  };

  return (
    <aside className="w-64 border-r border-border bg-sidebar h-screen flex flex-col sticky top-0">
      <Link href="/" className="p-4 flex items-center mb-4">
        <span className="font-chanakya font-semibold text-lg tracking-tight text-foreground/90">Chanakya</span>
      </Link>

      <div className="px-3 mb-6">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <input 
            type="text" 
            placeholder="Search reports..." 
            className="w-full bg-secondary/50 border border-border rounded-md py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.href !== '#' && (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href));
          const content = (
            <>
              <item.icon className={cn(
                "w-4 h-4 transition-colors flex-shrink-0",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              <span>{item.label}</span>
            </>
          );
          return item.href === '#' ? (
            <button
              key={item.label}
              onClick={showComingSoon}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-[13px] transition-all duration-200 group text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
            >
              {content}
            </button>
          ) : item.key === 'chat' ? (
            <Link
              key={item.label}
              href="/"
              onClick={handleNewChat}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-[13px] transition-all duration-200 group",
                pathname === '/'
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
            >
              {content}
            </Link>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-[13px] transition-all duration-200 group",
                isActive
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4 border-t border-border/50">
        <button className="flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-secondary/80 transition-colors group">
          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center border border-border overflow-hidden">
            <User className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[13px] font-medium text-foreground/90 leading-none mb-1">Alex Rivet</p>
            <p className="text-[11px] text-muted-foreground leading-none">Pro Plan</p>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    </aside>
  );
}
