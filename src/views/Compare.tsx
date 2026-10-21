import { Fragment, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Columns3, MapPin, Plus, RotateCcw, Star, Users } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { Button, Empty, PageHeader, Segmented, STATUS_STYLE } from '@/components/ui';
import { AVAIL_LABEL, getAvail, getOffer, lineCost, venueSummary } from '@/lib/calc';
import { GROUPS } from '@/lib/defaults';
import { money, tinyDate } from '@/lib/format';
import { live, useDoc } from '@/lib/store';
import type { Doc, Item, Venue } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AVAIL_STYLE, venueName } from './Venues';
import type { Tab } from '@/App';

type Filter = 'all' | 'diff' | 'known';

// The selection survives switching tabs (this view unmounts), but not a reload.
let remembered: string[] = [];

const SPRING = { type: 'spring', bounce: 0.05, duration: 0.55 } as const;

export function Compare({ onOpenVenue, onTab }: { onOpenVenue: (id: string) => void; onTab: (t: Tab) => void }) {
  const doc = useDoc();
  const all = live(doc.venues);
  const [picked, setPicked] = useState<string[]>(remembered);
  const [filter, setFilter] = useState<Filter>('all');

  // Ignore venues that were deleted since they were picked
  const selected = picked.filter((id) => all.some((v) => v.id === id));
  const comparing = selected.length >= 2;

  useEffect(() => {
    remembered = selected;
  });

  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const venues = selected.map((id) => all.find((v) => v.id === id)!);

  if (all.length < 2) {
    return (
      <div>
        <PageHeader title="Confronto" />
        <Empty
          icon={<Columns3 className="size-6" />}
          title={all.length === 0 ? 'Ancora niente da confrontare' : 'Serve almeno un’altra location'}
          body="Aggiungi almeno due location e qui potrai metterle a confronto voce per voce."
          action={
            <Button variant="primary" onClick={() => onTab('venues')}>
              <Plus className="size-4" /> Aggiungi location
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Confronto"
        subtitle={comparing ? `${selected.length} location a confronto, costi calcolati per ${doc.settings.guests} invitati.` : 'Tocca il + sulle location che vuoi mettere a confronto.'}
        action={
          selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
              <RotateCcw className="size-3.5" /> Ricomincia
            </Button>
          )
        }
      />

      {/* One list of cards: a roomy grid while choosing, a slim strip once comparing */}
      <motion.div layout transition={SPRING} className={cn(comparing ? 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
        {all.map((v) => (
          <PickCard key={v.id} doc={doc} venue={v} selected={selected.includes(v.id)} compact={comparing} onToggle={() => toggle(v.id)} />
        ))}
      </motion.div>

      <AnimatePresence initial={false}>
        {!comparing && (
          <motion.p
            key="hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.1 } }}
            className="overflow-hidden pt-4 text-center text-sm text-muted"
            aria-live="polite"
          >
            {selected.length === 0 ? 'Scegline almeno due.' : 'Ne manca ancora una.'}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {comparing && (
          <motion.div
            key="table"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ ...SPRING, delay: 0.08 }}
            className="mt-6"
          >
            <ComparisonTable doc={doc} venues={venues} filter={filter} setFilter={setFilter} onOpenVenue={onOpenVenue} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PickCard({ doc, venue, selected, compact, onToggle }: { doc: Doc; venue: Venue; selected: boolean; compact: boolean; onToggle: () => void }) {
  const s = venueSummary(doc, venue.id);
  const cur = doc.settings.currency;
  return (
    <motion.button
      layout
      transition={SPRING}
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${selected ? 'Togli dal confronto' : 'Aggiungi al confronto'}: ${venueName(venue)}`}
      className={cn(
        'group relative shrink-0 rounded-2xl border bg-surface text-left shadow-card transition-colors',
        compact ? 'flex min-w-44 items-center gap-3 py-2 pr-2 pl-3.5' : 'flex flex-col gap-3 p-4 md:p-5',
        selected ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
        compact && !selected && 'opacity-70 hover:opacity-100',
      )}
    >
      <div className={cn('min-w-0', compact ? 'flex-1' : 'pr-12')}>
        <motion.div layout="position" transition={SPRING} className={cn('truncate font-display font-medium', compact ? 'text-[15px]' : 'text-lg')}>
          {venueName(venue)}
        </motion.div>
        {!compact && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
              {venue.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {venue.location}
                </span>
              )}
              {venue.capacity != null && (
                <span className={cn('inline-flex items-center gap-1', venue.capacity < doc.settings.guests && 'text-na')}>
                  <Users className="size-3.5" />
                  fino a {venue.capacity}
                </span>
              )}
              {venue.rating != null && (
                <span className="inline-flex items-center gap-1 text-gold">
                  <Star className="size-3.5 fill-current" />
                  {venue.rating}/5
                </span>
              )}
            </div>
            <div className="pt-1">
              <div className="text-xs text-muted">Costo noto</div>
              <AnimatedNumber value={s.known} format={(n) => money(n, cur)} className="font-display text-2xl leading-none font-medium tracking-tight" />
            </div>
          </motion.div>
        )}
      </div>

      <motion.span
        layout="position"
        transition={SPRING}
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition-colors',
          compact ? 'size-8' : 'absolute top-3.5 right-3.5 size-10',
          selected ? 'bg-accent text-accent-ink' : 'border border-line-strong text-ink-2 group-hover:border-accent group-hover:text-accent',
        )}
      >
        <motion.span animate={{ rotate: selected ? 0 : 90 }} transition={{ duration: 0.25 }} className="flex">
          {selected ? <Check className={compact ? 'size-4' : 'size-5'} strokeWidth={2.5} /> : <Plus className={compact ? 'size-4' : 'size-5'} strokeWidth={2.25} />}
        </motion.span>
      </motion.span>
    </motion.button>
  );
}

function ComparisonTable({ doc, venues, filter, setFilter, onOpenVenue }: { doc: Doc; venues: Venue[]; filter: Filter; setFilter: (f: Filter) => void; onOpenVenue: (id: string) => void }) {
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

  const known = venues.map((v) => summaries.get(v.id)!.known);
  const lowest = Math.min(...known);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tutte le voci' },
            { value: 'known', label: 'Con risposta' },
            { value: 'diff', label: 'Differenze' },
          ]}
        />
      </div>

      <div className="-mx-4 overflow-x-auto md:mx-0 md:rounded-2xl md:border md:border-line md:bg-surface md:shadow-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 w-36 min-w-36 border-b border-line bg-bg px-4 py-3 text-left align-bottom text-xs font-medium text-muted md:w-56 md:min-w-56 md:bg-surface">
                Voce
              </th>
              {venues.map((v) => (
                <VenueHead key={v.id} venue={v} chosen={doc.settings.chosenVenueId === v.id} onOpen={() => onOpenVenue(v.id)} />
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <RowHead className="bg-surface-2 font-semibold">Costo noto</RowHead>
              {venues.map((v) => {
                const s = summaries.get(v.id)!;
                return (
                  <td key={v.id} className="border-b border-line bg-surface-2 px-3 py-3 align-top">
                    <div className={cn('font-display text-lg leading-tight font-medium tabular-nums', s.known === lowest && s.known > 0 && 'text-accent')}>{money(s.known, cur)}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted">
                      {s.tax > 0 && <div>di cui {money(s.tax, cur)} IVA/servizio</div>}
                      {s.missing > 0 ? <div className="font-medium text-ext">{s.missing === 1 ? '1 prezzo mancante' : `${s.missing} prezzi mancanti`}</div> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <RowHead>Offerta</RowHead>
              {venues.map((v) => {
                const c = summaries.get(v.id)!.counts;
                return (
                  <td key={v.id} className="border-b border-line px-3 py-2.5 text-[11px] leading-relaxed text-ink-2">
                    <span className="text-inc">{c.included === 1 ? '1 incluso' : `${c.included} inclusi`}</span> · <span className="text-ext">{c.extra} extra</span> · <span className="text-na">{c.unavailable} no</span>
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
                        <OfferCell key={v.id} doc={doc} venue={v} item={item} />
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
                    Disponibilità
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
                Condizioni
              </th>
            </tr>
            {(
              [
                ['Caparra', 'deposit'],
                ['Pagamenti', 'paymentTerms'],
                ['Disdetta', 'cancellation'],
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
        {chosen && <span className="mb-1 inline-block rounded-full bg-gold-soft px-1.5 py-px text-[10px] font-semibold text-gold">La nostra scelta</span>}
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

function OfferCell({ doc, venue, item }: { doc: Doc; venue: Venue; item: Item }) {
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
            <span className="text-xs text-ext">{line.missing === 'price' ? 'prezzo?' : line.missing === 'qty' ? 'quantità?' : 'aliquota?'}</span>
          )
        ) : (
          <span className={cn('text-xs', st.fg)}>{o.status === 'unknown' ? '' : st.label}</span>
        )}
      </div>
      {o.status === 'extra' && line.tax ? <div className="mt-0.5 pl-6 text-[11px] text-muted">IVA/serv. incl.</div> : null}
      {o.note && <div className="mt-0.5 line-clamp-2 max-w-40 pl-6 text-[11px] text-muted">{o.note}</div>}
    </td>
  );
}
