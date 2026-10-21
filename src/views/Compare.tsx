import { Fragment, useMemo, useState } from 'react';
import { Columns3, Plus, Users, Star } from 'lucide-react';
import { Button, Empty, PageHeader, Segmented, STATUS_STYLE } from '@/components/ui';
import { AVAIL_LABEL, getAvail, getOffer, lineCost, venueSummary } from '@/lib/calc';
import { GROUPS } from '@/lib/defaults';
import { money, tinyDate } from '@/lib/format';
import { live, useDoc } from '@/lib/store';
import type { Item, Venue } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AVAIL_STYLE, venueName } from './Venues';
import type { Tab } from '@/App';

type Filter = 'all' | 'diff' | 'known';

export function Compare({ onOpenVenue, onTab }: { onOpenVenue: (id: string) => void; onTab: (t: Tab) => void }) {
  const doc = useDoc();
  const all = live(doc.venues);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const venues = all.filter((v) => !hidden.has(v.id));
  const cur = doc.settings.currency;
  const guests = doc.settings.guests;
  const items = live(doc.items);
  const dates = useMemo(() => live(doc.dates).sort((a, b) => a.date.localeCompare(b.date)), [doc.dates]);

  const summaries = useMemo(() => new Map(venues.map((v) => [v.id, venueSummary(doc, v.id)])), [doc, venues]);

  const keepRow = (item: Item) => {
    if (filter === 'all') return true;
    const sts = venues.map((v) => {
      const o = getOffer(doc, v.id, item);
      return o.status === 'extra' ? `extra:${lineCost(o, guests).total}` : o.status;
    });
    if (filter === 'known') return sts.some((s) => s !== 'unknown');
    return new Set(sts).size > 1;
  };

  if (all.length === 0) {
    return (
      <div>
        <PageHeader title="Compare" />
        <Empty
          icon={<Columns3 className="size-6" />}
          title="Nothing to compare yet"
          body="Add a few venues and this grid lines them up item by item."
          action={
            <Button variant="primary" onClick={() => onTab('venues')}>
              <Plus className="size-4" /> Add venues
            </Button>
          }
        />
      </div>
    );
  }

  const known = venues.map((v) => summaries.get(v.id)!.known);
  const lowest = venues.length > 1 ? Math.min(...known) : null;

  return (
    <div>
      <PageHeader title="Compare" subtitle={`Side by side, worked out for ${guests} guests. Tap a venue name to edit it.`} />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {all.map((v) => {
            const on = !hidden.has(v.id);
            return (
              <button
                key={v.id}
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(v.id)) n.delete(v.id);
                    else n.add(v.id);
                    return n;
                  })
                }
                aria-pressed={on}
                className={cn(
                  'h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition',
                  on ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted line-through decoration-1 hover:text-ink-2',
                )}
              >
                {venueName(v)}
              </button>
            );
          })}
        </div>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All items' },
            { value: 'known', label: 'Answered' },
            { value: 'diff', label: 'Differences' },
          ]}
        />
      </div>

      {venues.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Tap a venue above to show it.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto md:mx-0 md:rounded-2xl md:border md:border-line md:bg-surface md:shadow-card">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 w-36 min-w-36 border-b border-line bg-bg px-4 py-3 text-left align-bottom text-xs font-medium text-muted md:w-56 md:min-w-56 md:bg-surface">
                  Item
                </th>
                {venues.map((v) => (
                  <VenueHead key={v.id} venue={v} chosen={doc.settings.chosenVenueId === v.id} onOpen={() => onOpenVenue(v.id)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Totals */}
              <tr>
                <RowHead className="bg-surface-2 font-semibold">Known cost</RowHead>
                {venues.map((v) => {
                  const s = summaries.get(v.id)!;
                  return (
                    <td key={v.id} className="border-b border-line bg-surface-2 px-3 py-3 align-top">
                      <div className={cn('font-display text-lg leading-tight font-medium tabular-nums', lowest != null && s.known === lowest && s.known > 0 && 'text-accent')}>
                        {money(s.known, cur)}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-muted">
                        {s.tax > 0 && <div>incl. {money(s.tax, cur)} tax</div>}
                        {s.missing > 0 ? <div className="font-medium text-ext">{s.missing} price{s.missing === 1 ? '' : 's'} missing</div> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <RowHead>Offer</RowHead>
                {venues.map((v) => {
                  const c = summaries.get(v.id)!.counts;
                  return (
                    <td key={v.id} className="border-b border-line px-3 py-2.5 text-[11px] leading-relaxed text-ink-2">
                      <span className="text-inc">{c.included} incl.</span> · <span className="text-ext">{c.extra} extra</span> · <span className="text-na">{c.unavailable} n/a</span>
                      {c.unknown > 0 && <span className="text-muted"> · {c.unknown} ?</span>}
                    </td>
                  );
                })}
              </tr>

              {GROUPS.map((g) => {
                const rows = items.filter((i) => i.group === g.id && keepRow(i));
                if (!rows.length) return null;
                return (
                  <Fragment key={g.id}>
                    <tr>
                      <th colSpan={venues.length + 1} className="sticky left-0 border-b border-line bg-bg px-4 pt-5 pb-2 text-left text-[11px] font-semibold tracking-wider text-muted uppercase md:bg-surface">
                        {g.label}
                      </th>
                    </tr>
                    {rows.map((item) => (
                      <tr key={item.id} className="group">
                        <RowHead>{item.name}</RowHead>
                        {venues.map((v) => (
                          <OfferCell key={v.id} venue={v} item={item} />
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}

              {dates.length > 0 && (
                <>
                  <tr>
                    <th colSpan={venues.length + 1} className="sticky left-0 border-b border-line bg-bg px-4 pt-5 pb-2 text-left text-[11px] font-semibold tracking-wider text-muted uppercase md:bg-surface">
                      Availability
                    </th>
                  </tr>
                  {dates.map((d) => (
                    <tr key={d.id}>
                      <RowHead>{d.label ? `${d.label} · ${tinyDate(d.date)}` : tinyDate(d.date)}</RowHead>
                      {venues.map((v) => {
                        const st = getAvail(doc, v.id, d.id)?.status ?? 'unknown';
                        return (
                          <td key={v.id} className="border-b border-line px-3 py-2.5">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', AVAIL_STYLE[st])}>{AVAIL_LABEL[st]}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              )}

              <tr>
                <th colSpan={venues.length + 1} className="sticky left-0 border-b border-line bg-bg px-4 pt-5 pb-2 text-left text-[11px] font-semibold tracking-wider text-muted uppercase md:bg-surface">
                  Terms
                </th>
              </tr>
              {(
                [
                  ['Deposit', 'deposit'],
                  ['Payment schedule', 'paymentTerms'],
                  ['Cancellation', 'cancellation'],
                ] as const
              ).map(([label, key]) => (
                <tr key={key}>
                  <RowHead>{label}</RowHead>
                  {venues.map((v) => (
                    <td key={v.id} className="max-w-48 border-b border-line px-3 py-2.5 text-xs text-ink-2">
                      {v[key] || <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        {(['included', 'extra', 'unavailable', 'unknown'] as const).map((s) => {
          const st = STATUS_STYLE[s];
          const Icon = st.icon;
          return (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cn('inline-flex size-5 items-center justify-center rounded-full', st.bg, st.fg)}>
                <Icon className="size-3" strokeWidth={2.5} />
              </span>
              {st.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function RowHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="row" className={cn('sticky left-0 z-10 w-36 min-w-36 border-b border-line bg-bg px-4 py-2.5 text-left text-[13px] leading-snug font-normal text-ink-2 md:w-56 md:min-w-56 md:bg-surface', className)}>
      {children}
    </th>
  );
}

function VenueHead({ venue, chosen, onOpen }: { venue: Venue; chosen: boolean; onOpen: () => void }) {
  return (
    <th className="sticky top-0 z-10 min-w-36 border-b border-line bg-bg px-3 py-3 text-left align-bottom font-normal md:min-w-40 md:bg-surface">
      <button onClick={onOpen} className="group text-left">
        {chosen && <span className="mb-1 inline-block rounded-full bg-gold-soft px-1.5 py-px text-[10px] font-semibold text-gold">Our pick</span>}
        <div className="font-display text-[15px] leading-tight font-medium text-ink group-hover:underline">{venueName(venue)}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
          {venue.capacity != null && (
            <span className="inline-flex items-center gap-0.5">
              <Users className="size-3" />
              {venue.capacity}
            </span>
          )}
          {venue.rating != null && (
            <span className="inline-flex items-center gap-0.5 text-gold">
              <Star className="size-3 fill-current" />
              {venue.rating}
            </span>
          )}
        </div>
      </button>
    </th>
  );
}

function OfferCell({ venue, item }: { venue: Venue; item: Item }) {
  const doc = useDoc();
  const o = getOffer(doc, venue.id, item);
  const line = lineCost(o, doc.settings.guests);
  const st = STATUS_STYLE[o.status];
  const Icon = st.icon;
  return (
    <td className={cn('border-b border-line px-3 py-2.5 align-top', o.status === 'unavailable' && 'hatch')} title={o.note || st.label}>
      <div className="flex items-center gap-1.5">
        <span className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-full', st.bg, st.fg)}>
          <Icon className="size-3" strokeWidth={2.5} />
        </span>
        {o.status === 'extra' ? (
          line.total != null ? (
            <span className="font-medium tabular-nums">{money(line.total, doc.settings.currency)}</span>
          ) : (
            <span className="text-xs text-ext">{line.missing === 'price' ? 'price?' : line.missing === 'qty' ? 'qty?' : 'tax?'}</span>
          )
        ) : (
          <span className={cn('text-xs', st.fg)}>{o.status === 'unknown' ? '' : st.label}</span>
        )}
      </div>
      {o.status === 'extra' && line.tax ? <div className="mt-0.5 pl-6 text-[11px] text-muted">incl. tax</div> : null}
      {o.note && <div className="mt-0.5 line-clamp-2 max-w-40 pl-6 text-[11px] text-muted">{o.note}</div>}
    </td>
  );
}
