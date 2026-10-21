import { motion } from 'motion/react';
import { ArrowRight, CalendarDays, Hourglass, Landmark, Users, Wallet } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { Card, SectionTitle } from '@/components/ui';
import { costsSummary, venueSummary } from '@/lib/calc';
import { money, relDays, shortDate } from '@/lib/format';
import { live, useDoc } from '@/lib/store';
import { cn } from '@/lib/utils';
import { venueName } from './Venues';
import { upcomingHolds } from './Dates';
import { budgetNumbers } from './Budget';
import type { Tab } from '@/App';

export function Overview({ onOpenVenue, onTab, onSettings }: { onOpenVenue: (id: string) => void; onTab: (t: Tab) => void; onSettings: () => void }) {
  const doc = useDoc();
  const cur = doc.settings.currency;
  const venues = live(doc.venues);
  const cs = costsSummary(doc);
  const budget = doc.settings.budget;
  const { remaining, committed } = budgetNumbers(doc);
  const holds = upcomingHolds(doc, 14);

  const rows = venues
    .map((v) => {
      const s = venueSummary(doc, v.id);
      const total = s.known + cs.known;
      return { v, s, total, left: budget == null ? null : budget - total };
    })
    .sort((a, b) => a.s.known - b.s.known);
  const maxTotal = Math.max(budget ?? 0, ...rows.map((r) => r.total), 1);

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <p className="text-sm text-muted">{doc.settings.coupleNames ? `${doc.settings.coupleNames}'s wedding` : 'Your wedding'}</p>
        <h1 className="mt-1 font-display text-[32px] leading-tight font-medium tracking-tight md:text-5xl">
          {budget == null ? (
            'Let’s find your venue.'
          ) : !doc.settings.chosenVenueId ? (
            <>
              <AnimatedNumber value={budget} format={(n) => money(n, cur)} /> <span className="text-muted">to spend</span>
            </>
          ) : remaining != null && remaining >= 0 ? (
            <>
              <AnimatedNumber value={remaining} format={(n) => money(n, cur)} /> <span className="text-muted">left</span>
            </>
          ) : (
            <>
              <AnimatedNumber value={Math.abs(remaining ?? 0)} format={(n) => money(n, cur)} className="text-na" /> <span className="text-muted">over</span>
            </>
          )}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
          <Chip icon={<Users className="size-3.5" />} onClick={onSettings}>
            {doc.settings.guests} guests
          </Chip>
          <Chip icon={<Wallet className="size-3.5" />} onClick={() => onTab('budget')}>
            {budget == null ? 'Set budget' : `Budget ${money(budget, cur)}`}
          </Chip>
          {budget != null && (
            <Chip icon={<Wallet className="size-3.5" />} onClick={() => onTab('budget')}>
              Committed {money(committed, cur)}
            </Chip>
          )}
        </div>
      </div>

      {holds.length > 0 && (
        <Card className="mb-6 flex items-start gap-3 border-held/30 bg-held-bg/40 p-4">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-held" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium text-held">Holds expiring soon</div>
            <ul className="mt-1 space-y-0.5">
              {holds.map(({ a, venue, date, days }) => (
                <li key={a.id} className="text-ink-2">
                  <button className="hover:underline" onClick={() => onOpenVenue(venue.id)}>
                    {venueName(venue)}
                  </button>{' '}
                  · {date.label || shortDate(date.date)} ·{' '}
                  <span className={cn(days != null && days <= 7 && 'font-medium text-na')}>{days == null ? 'no expiry entered' : days < 0 ? `lapsed ${relDays(days)}` : `ends ${relDays(days)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <section className="mb-10">
        <SectionTitle
          action={
            venues.length > 0 && (
              <button onClick={() => onTab('compare')} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                Compare <ArrowRight className="size-4" />
              </button>
            )
          }
        >
          Can we afford it?
        </SectionTitle>
        {venues.length === 0 ? (
          <GettingStarted onTab={onTab} hasBudget={budget != null} />
        ) : (
          <Card className="divide-y divide-line">
            {rows.map(({ v, s, total, left }, i) => (
              <motion.button
                key={v.id}
                onClick={() => onOpenVenue(v.id)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className="block w-full px-4 py-4 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60 md:px-5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{venueName(v)}</span>
                      {doc.settings.chosenVenueId === v.id && <span className="shrink-0 rounded-full bg-gold-soft px-1.5 py-px text-[10px] font-semibold text-gold">Our pick</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      Venue {money(s.known, cur)} + everything else {money(cs.known, cur)}
                      {s.missing + cs.missing > 0 && <span className="text-ext"> · {s.missing + cs.missing} prices missing</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium tabular-nums">{money(total, cur)}</div>
                    {left != null && <div className={cn('text-xs font-medium tabular-nums', left >= 0 ? 'text-inc' : 'text-na')}>{left >= 0 ? `${money(left, cur)} left` : `${money(-left, cur)} over`}</div>}
                  </div>
                </div>
                <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="absolute inset-y-0 left-0 bg-accent" initial={false} animate={{ width: `${(s.known / maxTotal) * 100}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
                  <motion.div
                    className="absolute inset-y-0 bg-gold"
                    initial={false}
                    animate={{ left: `${(s.known / maxTotal) * 100}%`, width: `${(cs.known / maxTotal) * 100}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
                  />
                  {budget != null && <div className="absolute inset-y-[-2px] w-0.5 bg-ink" style={{ left: `calc(${Math.min((budget / maxTotal) * 100, 100)}% - 1px)` }} title="Budget" />}
                </div>
              </motion.button>
            ))}
          </Card>
        )}
        {venues.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" /> Venue
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-gold" /> Everything else
            </span>
            {budget != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-ink" /> Budget
              </span>
            )}
            <span>Known prices only. Blanks are never guessed.</span>
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Landmark className="size-5" />} label="Venues" value={String(venues.length)} onClick={() => onTab('venues')} />
        <Stat icon={<CalendarDays className="size-5" />} label="Dates considered" value={String(live(doc.dates).length)} onClick={() => onTab('dates')} />
        <Stat icon={<Wallet className="size-5" />} label="Everything else" value={money(cs.known, cur)} sub={cs.missing ? `${cs.missing} without price` : undefined} onClick={() => onTab('budget')} />
      </div>
    </div>
  );
}

function Chip({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-ink-2 transition hover:border-line-strong hover:text-ink">
      {icon}
      {children}
    </button>
  );
}

function Stat({ icon, label, value, sub, onClick }: { icon: React.ReactNode; label: string; value: string; sub?: string; onClick: () => void }) {
  return (
    <Card className="flex cursor-pointer items-center gap-3 p-4 transition hover:border-line-strong" onClick={onClick}>
      <div className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="font-display text-xl font-medium tabular-nums">{value}</div>
        {sub && <div className="text-xs text-ext">{sub}</div>}
      </div>
    </Card>
  );
}

function GettingStarted({ onTab, hasBudget }: { onTab: (t: Tab) => void; hasBudget: boolean }) {
  const steps: { title: string; body: string; tab: Tab; done?: boolean }[] = [
    { title: 'Set your budget', body: 'Total amount for the whole wedding.', tab: 'budget', done: hasBudget },
    { title: 'Add the venues you visited', body: 'Mark each checklist item as included, extra (with price and service tax) or not offered.', tab: 'venues' },
    { title: 'Add your candidate dates', body: 'Then track which venues are free, holding a date, or taken.', tab: 'dates' },
    { title: 'Fill in everything else', body: 'Dress, suit, bracelets, hair & makeup, photographer…', tab: 'budget' },
  ];
  return (
    <Card className="divide-y divide-line">
      {steps.map((s, i) => (
        <button key={s.title} onClick={() => onTab(s.tab)} className="flex w-full items-start gap-4 px-4 py-4 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60 md:px-5">
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium', s.done ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2')}>{s.done ? '✓' : i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className={cn('block font-medium', s.done && 'text-muted line-through')}>{s.title}</span>
            <span className="mt-0.5 block text-sm text-muted">{s.body}</span>
          </span>
          <ArrowRight className="mt-1 size-4 shrink-0 text-muted" />
        </button>
      ))}
    </Card>
  );
}

