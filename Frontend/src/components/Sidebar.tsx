'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  MessageSquare,
  FileText,
  Database,
  Settings,
  Search,
  ChevronRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

function showComingSoon() {
  toast.info('Coming soon');
}

const navItems = [
  { icon: MessageSquare, label: 'Chat', key: 'chat', href: '/' },
  { icon: FileText, label: 'Saved Reports', key: 'saved', href: '#' },
  { icon: Database, label: 'Data Sources', key: 'dataSources', href: '/data-sources' },
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

  const navLinkClass =
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150 group';

  return (
    <aside className="w-64 h-screen flex flex-col sticky top-0 bg-sidebar border-r border-sidebar-border/70">
      <Link
        href="/"
        className="flex items-center gap-2 px-5 pt-6 pb-5 min-h-[4.5rem]"
      >
        <Logo size={36} />
        <span className="font-chanakya font-semibold text-base tracking-tight text-foreground">
          Chanakya
        </span>
      </Link>

      <div className="px-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-muted/40 border-0 rounded-lg py-2 pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-shadow"
          />
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto chat-scroll">
        {navItems.map((item) => {
          const isActive =
            item.href !== '#' &&
            (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href));
          const content = (
            <>
              <item.icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              <span>{item.label}</span>
            </>
          );
          return item.href === '#' ? (
            <button
              key={item.label}
              onClick={showComingSoon}
              className={cn(
                navLinkClass,
                'text-muted-foreground hover:text-foreground hover:bg-muted/50'
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
                navLinkClass,
                pathname === '/'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {content}
            </Link>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                navLinkClass,
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 py-3 border-t border-border/50 space-y-1">
        <div className="flex items-center justify-end px-1">
          <ThemeToggle />
        </div>
        <button className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors group text-left">
          <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center overflow-hidden flex-shrink-0">
            <User className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate">Alex Rivet</p>
            <p className="text-[11px] text-muted-foreground truncate">Pro Plan</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" />
        </button>
      </div>
    </aside>
  );
}
