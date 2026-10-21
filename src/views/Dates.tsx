import { useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, Trash2, Hourglass } from 'lucide-react';
import { Button, Card, Empty, PageHeader, Segmented, confirmAction } from '@/components/ui';
import { AVAIL_LABEL, AVAIL_SHORT, daysUntil, getAvail, availId } from '@/lib/calc';
import { relDays, shortDate } from '@/lib/format';
import { live, patch, remove, upsert, useDoc } from '@/lib/store';
import type { AvailStatus, Doc, WeddingDate } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import { AVAIL_STYLE, venueName } from './Venues';
import type { Tab } from '@/App';

export function upcomingHolds(doc: Doc, withinDays = 21) {
  const venues = new Map(live(doc.venues).map((v) => [v.id, v]));
  const dates = new Map(live(doc.dates).map((d) => [d.id, d]));
  return doc.availability
    .filter((a) => !a.deleted && a.status === 'held' && venues.has(a.venueId) && dates.has(a.dateId))
    .map((a) => ({ a, venue: venues.get(a.venueId)!, date: dates.get(a.dateId)!, days: daysUntil(a.holdUntil) }))
    .filter((h) => h.days == null || h.days <= withinDays)
    .sort((x, y) => (x.days ?? 999) - (y.days ?? 999));
}

export function Dates({ onTab }: { onTab: (t: Tab) => void }) {
  const doc = useDoc();
  const dates = useMemo(() => live(doc.dates).sort((a, b) => a.date.localeCompare(b.date)), [doc.dates]);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');

  const add = () => {
    if (!date) return;
    upsert('dates', { id: `date-${uid()}`, updatedAt: 0, date, label: label.trim() });
    setDate('');
    setLabel('');
  };

  const holds = upcomingHolds(doc);

  return (
    <div>
      <PageHeader title="Date" subtitle="Le date che state valutando e quali location sono libere." />

      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none" />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Etichetta (facoltativa)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="es. Prima scelta"
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none"
            />
          </label>
          <Button variant="primary" onClick={add} disabled={!date}>
            <CalendarPlus className="size-4" /> Aggiungi data
          </Button>
        </div>
      </Card>

      {holds.length > 0 && (
        <Card className="mb-6 border-held/30 bg-held-bg/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-held">
            <Hourglass className="size-4" /> Opzioni da decidere
          </div>
          <ul className="space-y-1 text-sm">
            {holds.map(({ a, venue, date, days }) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  {venueName(venue)} · {date.label || shortDate(date.date)}
                </span>
                <span className={cn('tabular-nums', days != null && days <= 7 ? 'font-medium text-na' : 'text-ink-2')}>
                  {days == null ? 'scadenza non inserita' : days < 0 ? `scaduta ${relDays(days)}` : `scade ${relDays(days)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dates.length === 0 ? (
        <Empty icon={<CalendarDays className="size-6" />} title="Ancora nessuna data" body="Aggiungi ogni data che prendereste in considerazione, poi segna quali location sono libere, ve la tengono in opzione o sono già occupate." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {dates.map((d) => (
            <DateCard key={d.id} doc={doc} date={d} onTab={onTab} />
          ))}
        </div>
      )}
    </div>
  );
}

function DateCard({ doc, date, onTab }: { doc: Doc; date: WeddingDate; onTab: (t: Tab) => void }) {
  const venues = live(doc.venues);
  const free = venues.filter((v) => ['available', 'held', 'booked'].includes(getAvail(doc, v.id, date.id)?.status ?? '')).length;
  const days = daysUntil(date.date);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0">
          <div className="font-display text-lg font-medium">{shortDate(date.date)}</div>
          <div className="mt-0.5 flex flex-col text-xs text-muted">
            <input
              defaultValue={date.label}
              placeholder="Aggiungi etichetta"
              aria-label="Etichetta della data"
              onBlur={(e) => e.target.value !== date.label && patch('dates', date.id, { label: e.target.value })}
              className="w-full bg-transparent text-ink-2 placeholder:text-muted/70 focus:text-ink focus:outline-none md:text-sm"
            />
            <span>
              {days != null && days >= 0 ? `tra ${days} giorni · ` : ''}
              {free === 1 ? `1 location possibile su ${venues.length}` : `${free} location possibili su ${venues.length}`}
            </span>
          </div>
        </div>
        <button
          aria-label="Rimuovi data"
          title="Rimuovi data"
          onClick={() => confirmAction(`Rimuovere la data ${shortDate(date.date)}?`, 'Rimuovi').then((ok) => ok && remove('dates', date.id))}
          className="inline-flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-na-bg hover:text-na"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="divide-y divide-line">
        {venues.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-muted">
            Aggiungi le location per segnare chi è libero in questa data.
            <Button size="sm" onClick={() => onTab('venues')}>
              Vai alle location
            </Button>
          </div>
        )}
        {venues.map((v) => (
          <AvailRow key={v.id} doc={doc} venueId={v.id} dateId={date.id} name={venueName(v)} />
        ))}
      </div>
    </Card>
  );
}

function AvailRow({ doc, venueId, dateId, name }: { doc: Doc; venueId: string; dateId: string; name: string }) {
  const a = getAvail(doc, venueId, dateId);
  const status = a?.status ?? 'unknown';
  const save = (changes: Partial<{ status: AvailStatus; holdUntil: string }>) =>
    upsert('availability', { id: availId(venueId, dateId), updatedAt: 0, venueId, dateId, status, holdUntil: a?.holdUntil ?? '', note: a?.note ?? '', ...changes });
  const days = status === 'held' ? daysUntil(a?.holdUntil ?? '') : null;
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{name}</span>
        {status === 'held' && days != null && <span className={cn('shrink-0 text-xs', days <= 7 ? 'font-medium text-na' : 'text-held')}>{days < 0 ? `scaduta ${relDays(days)}` : `scade ${relDays(days)}`}</span>}
      </div>
      <Segmented
        size="sm"
        value={status}
        onChange={(s) => save({ status: s })}
        className="w-full"
        options={(['available', 'held', 'unavailable', 'booked', 'unknown'] as AvailStatus[]).map((s) => ({
          value: s,
          label: AVAIL_SHORT[s],
          title: AVAIL_LABEL[s],
          activeClass: cn(AVAIL_STYLE[s].replace(/line-through|decoration-1/g, ''), 'shadow-none'),
        }))}
      />
      {status === 'held' && (
        <label className="mt-2 flex items-center justify-between gap-3 text-xs text-held">
          L'opzione scade il
          <input type="date" value={a?.holdUntil ?? ''} onChange={(e) => save({ holdUntil: e.target.value })} className="h-9 rounded-lg border border-line bg-surface px-2 text-ink focus:outline-none md:text-xs" />
        </label>
      )}
    </div>
  );
}
