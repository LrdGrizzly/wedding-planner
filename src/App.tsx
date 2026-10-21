import { useEffect, useState, useSyncExternalStore } from 'react';
import { CalendarDays, Columns3, Home, Landmark, Settings as Gear, Wallet, Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { TransitionPanel } from '@/components/motion-primitives/transition-panel';
import { cn } from '@/lib/utils';
import { getDriveView, subscribeDrive, syncAtBoundary, tapSync } from '@/lib/drive';
import { Overview } from '@/views/Overview';
import { Venues } from '@/views/Venues';
import { Compare } from '@/views/Compare';
import { Dates } from '@/views/Dates';
import { Budget } from '@/views/Budget';
import { SettingsSheet } from '@/views/Settings';

export type Tab = 'overview' | 'venues' | 'compare' | 'dates' | 'budget';

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Riepilogo', icon: Home },
  { id: 'venues', label: 'Location', icon: Landmark },
  { id: 'compare', label: 'Confronto', icon: Columns3 },
  { id: 'dates', label: 'Date', icon: CalendarDays },
  { id: 'budget', label: 'Budget', icon: Wallet },
];

function readTab(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'overview';
}

export function useDrive() {
  return useSyncExternalStore(subscribeDrive, getDriveView);
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(readTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openVenue, setOpenVenue] = useState<string | null>(null);

  const setTab = (t: Tab) => {
    // Switching section is a natural pause: renew Google access inside this tap and sync
    syncAtBoundary();
    setTabState(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const on = () => setTabState(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const index = TABS.findIndex((t) => t.id === tab);
  const goVenue = (id: string) => {
    setTab('venues');
    setOpenVenue(id);
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:px-6">
          <div className="flex items-center gap-2.5">
            <img src="./icon.svg" alt="" className="size-7 md:size-8" />
            <span className="font-display text-lg font-medium tracking-tight md:text-xl">Il nostro matrimonio</span>
          </div>
          <nav className="mx-auto hidden md:block" aria-label="Sezioni">
            <div className="flex rounded-full bg-surface-2 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={cn('relative h-9 rounded-full px-4 text-sm font-medium transition-colors', tab === t.id ? 'text-ink' : 'text-muted hover:text-ink-2')}
                >
                  {tab === t.id && <motion.span layoutId="nav-desktop" className="absolute inset-0 rounded-full bg-surface shadow-card" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
                  <span className="relative z-10">{t.label}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <SyncChip onSetup={() => setSettingsOpen(true)} />
            <button
              aria-label="Impostazioni"
              title="Impostazioni"
              onClick={() => {
                syncAtBoundary();
                setSettingsOpen(true);
              }}
              className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              <Gear className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 md:px-6 md:pt-8 md:pb-16">
        <TransitionPanel
          activeIndex={index}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          variants={{
            enter: { opacity: 0, y: 8, filter: 'blur(3px)' },
            center: { opacity: 1, y: 0, filter: 'blur(0px)' },
            exit: { opacity: 0, y: -6, filter: 'blur(3px)' },
          }}
        >
          {[
            <Overview key="o" onOpenVenue={goVenue} onTab={setTab} onSettings={() => setSettingsOpen(true)} />,
            <Venues key="v" openId={openVenue} setOpenId={setOpenVenue} />,
            <Compare key="c" onOpenVenue={goVenue} onTab={setTab} />,
            <Dates key="d" onTab={setTab} />,
            <Budget key="b" onSettings={() => setSettingsOpen(true)} />,
          ]}
        </TransitionPanel>
      </main>

      {/* Phone tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 backdrop-blur-md md:hidden" aria-label="Sezioni">
        <div className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5 pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5"
              >
                {active && <motion.span layoutId="nav-mobile" className="absolute inset-x-2 inset-y-0 rounded-2xl bg-accent-soft" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                <Icon className={cn('relative z-10 size-[22px] transition-colors', active ? 'text-accent' : 'text-muted')} strokeWidth={active ? 2.2 : 1.8} />
                <span className={cn('relative z-10 text-[11px] font-medium transition-colors', active ? 'text-ink' : 'text-muted')}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function SyncChip({ onSetup }: { onSetup: () => void }) {
  const d = useDrive();
  let icon = <CloudOff className="size-4" />;
  let label = 'Solo sul dispositivo';
  let tone = 'text-muted';
  let action: () => void = onSetup;

  switch (d.status) {
    case 'synced':
      icon = <Cloud className="size-4" />;
      label = 'Sincronizzato';
      tone = 'text-inc';
      action = () => tapSync();
      break;
    case 'syncing':
    case 'connecting':
      icon = <RefreshCw className="size-4 animate-spin" />;
      label = 'Sincronizzo…';
      tone = 'text-ink-2';
      action = () => {};
      break;
    case 'expired':
      icon = <RefreshCw className="size-4" />;
      label = 'Tocca per sincronizzare';
      tone = 'text-ext';
      action = () => tapSync();
      break;
    case 'error':
      icon = <AlertCircle className="size-4" />;
      label = 'Errore di sync';
      tone = 'text-na';
      break;
    case 'offline':
      icon = <CloudOff className="size-4" />;
      label = 'Offline';
      tone = 'text-muted';
      action = () => tapSync();
      break;
    case 'needsFile':
      icon = <AlertCircle className="size-4" />;
      label = 'Scegli il file';
      tone = 'text-ext';
      break;
  }

  return (
    <button
      onClick={action}
      title={d.message || label}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition hover:bg-surface-2', tone)}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
