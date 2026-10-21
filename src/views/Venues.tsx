import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Landmark, MapPin, Plus, Star, Users, ChevronRight, Trash2, StickyNote, ExternalLink, Phone, Mail } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { AmountInput, Button, Card, Empty, Field, PageHeader, Segmented, Select, Sheet, StatusPicker, Stars, TextInput } from '@/components/ui';
import { AVAIL_LABEL, UNIT_LABEL, availId, daysUntil, getAvail, getOffer, lineCost, unitMultiplier, venueSummary } from '@/lib/calc';
import { GROUPS } from '@/lib/defaults';
import { money, price, relDays, shortDate, tinyDate } from '@/lib/format';
import { getDoc, live, patch, removeVenue, setSettings, upsert, useDoc } from '@/lib/store';
import type { AvailStatus, Doc, GroupId, Item, Offer, TaxMode, Unit, Venue } from '@/lib/types';
import { cn, uid } from '@/lib/utils';

export function newVenue(order: number): Venue {
  return {
    id: `venue-${uid()}`,
    updatedAt: 0,
    name: '',
    location: '',
    contactName: '',
    phone: '',
    email: '',
    website: '',
    capacity: null,
    rating: null,
    visitDate: '',
    pros: '',
    cons: '',
    notes: '',
    deposit: '',
    paymentTerms: '',
    cancellation: '',
    order,
  };
}

export const venueName = (v: Venue) => v.name.trim() || 'Untitled venue';

export function Venues({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const doc = useDoc();
  const venues = live(doc.venues);
  const cur = doc.settings.currency;

  const add = () => {
    const v = newVenue(venues.length);
    upsert('venues', v);
    setOpenId(v.id);
  };

  return (
    <div>
      <PageHeader
        title="Venues"
        subtitle={venues.length ? `${venues.length} venue${venues.length === 1 ? '' : 's'} · costs worked out for ${doc.settings.guests} guests` : undefined}
        action={
          venues.length > 0 && (
            <Button variant="primary" onClick={add}>
              <Plus className="size-4" /> Add venue
            </Button>
          )
        }
      />

      {venues.length === 0 ? (
        <Empty
          icon={<Landmark className="size-6" />}
          title="Add the venues you've seen"
          body="For each one, go through the checklist: what's included, what costs extra (and whether service tax applies), and what they don't offer at all."
          action={
            <Button variant="primary" onClick={add}>
              <Plus className="size-4" /> Add your first venue
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {venues.map((v, i) => (
            <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}>
              <VenueCard doc={doc} venue={v} currency={cur} onOpen={() => setOpenId(v.id)} />
            </motion.div>
          ))}
        </div>
      )}

      <VenueSheet venueId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function VenueCard({ doc, venue, currency, onOpen }: { doc: Doc; venue: Venue; currency: string; onOpen: () => void }) {
  const s = venueSummary(doc, venue.id);
  const chosen = doc.settings.chosenVenueId === venue.id;
  const dates = live(doc.dates);
  const total = s.counts.included + s.counts.extra + s.counts.unavailable + s.counts.unknown || 1;
  return (
    <Card className={cn('group cursor-pointer p-4 transition hover:border-line-strong md:p-5', chosen && 'ring-2 ring-gold/60')} onClick={onOpen}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={cn('truncate font-display text-lg font-medium', !venue.name.trim() && 'text-muted italic')}>{venueName(venue)}</h3>
            {chosen && <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold text-gold">Our pick</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
            {venue.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {venue.location}
              </span>
            )}
            {venue.capacity != null && (
              <span className={cn('inline-flex items-center gap-1', venue.capacity < doc.settings.guests && 'text-na')}>
                <Users className="size-3.5" />
                up to {venue.capacity}
              </span>
            )}
            {venue.rating != null && (
              <span className="inline-flex items-center gap-1 text-gold">
                <Star className="size-3.5 fill-current" />
                {venue.rating}/5
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted transition group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Known cost</div>
          <AnimatedNumber value={s.known} format={(n) => money(n, currency)} className="font-display text-[26px] leading-none font-medium tracking-tight" />
        </div>
        {s.missing > 0 ? (
          <span className="rounded-full bg-ext-bg px-2.5 py-1 text-xs font-medium text-ext">
            {s.missing} price{s.missing === 1 ? '' : 's'} missing
          </span>
        ) : s.counts.unknown > 0 ? (
          <span className="rounded-full bg-unk-bg px-2.5 py-1 text-xs font-medium text-unk">{s.counts.unknown} still to ask</span>
        ) : (
          <span className="rounded-full bg-inc-bg px-2.5 py-1 text-xs font-medium text-inc">Complete</span>
        )}
      </div>

      {/* Offer mix bar */}
      <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-unk-bg">
        {(['included', 'extra', 'unavailable'] as const).map((k) => (
          <div key={k} className={cn('h-full', k === 'included' ? 'bg-inc' : k === 'extra' ? 'bg-ext' : 'bg-na')} style={{ width: `${(s.counts[k] / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        <Legend dot="bg-inc" n={s.counts.included} label="included" />
        <Legend dot="bg-ext" n={s.counts.extra} label="extra" />
        <Legend dot="bg-na" n={s.counts.unavailable} label="not offered" />
        <Legend dot="bg-unk" n={s.counts.unknown} label="not asked" />
      </div>

      {dates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {dates.map((d) => {
            const a = getAvail(doc, venue.id, d.id);
            return <AvailChip key={d.id} status={a?.status ?? 'unknown'} label={d.label || tinyDate(d.date)} />;
          })}
        </div>
      )}
    </Card>
  );
}

function Legend({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', dot)} />
      <span className="font-medium tabular-nums">{n}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

export const AVAIL_STYLE: Record<AvailStatus, string> = {
  unknown: 'bg-unk-bg text-unk',
  available: 'bg-inc-bg text-inc',
  held: 'bg-held-bg text-held',
  unavailable: 'bg-na-bg text-na line-through decoration-1',
  booked: 'bg-gold-soft text-gold',
};

export function AvailChip({ status, label }: { status: AvailStatus; label: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', AVAIL_STYLE[status])} title={AVAIL_LABEL[status]}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════
// Venue sheet
// ═══════════════════════════════════════════
type Pane = 'offer' | 'details' | 'dates';

function VenueSheet({ venueId, onClose }: { venueId: string | null; onClose: () => void }) {
  const doc = useDoc();
  const venue = venueId ? doc.venues.find((v) => v.id === venueId && !v.deleted) : undefined;
  const [pane, setPane] = useState<Pane>('offer');

  return (
    <Sheet
      open={!!venue}
      onClose={onClose}
      wide
      title={
        venue && (
          <input
            key={venue.id}
            defaultValue={venue.name}
            autoFocus={!venue.name}
            placeholder="Venue name"
            aria-label="Venue name"
            onBlur={(e) => e.target.value !== venue.name && patch('venues', venue.id, { name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent font-display text-2xl font-medium tracking-tight placeholder:text-muted/60 focus:outline-none md:text-2xl"
          />
        )
      }
      subtitle={venue && <VenueTotals doc={doc} venue={venue} />}
    >
      {venue && (
        <>
          <Segmented
            value={pane}
            onChange={setPane}
            className="mb-5 w-full"
            options={[
              { value: 'offer', label: 'What they offer' },
              { value: 'dates', label: 'Dates' },
              { value: 'details', label: 'Details' },
            ]}
          />
          {pane === 'offer' && <OfferList doc={doc} venue={venue} />}
          {pane === 'dates' && <VenueDates doc={doc} venue={venue} />}
          {pane === 'details' && <VenueDetails doc={doc} venue={venue} onDeleted={onClose} />}
        </>
      )}
    </Sheet>
  );
}

function VenueTotals({ doc, venue }: { doc: Doc; venue: Venue }) {
  const s = venueSummary(doc, venue.id);
  const cur = doc.settings.currency;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-medium text-ink tabular-nums">{money(s.known, cur)}</span>
      <span>known for {doc.settings.guests} guests</span>
      {s.tax > 0 && <span>· incl. {money(s.tax, cur)} tax</span>}
      {s.missing > 0 && <span className="text-ext">· {s.missing} missing</span>}
    </span>
  );
}

function OfferList({ doc, venue }: { doc: Doc; venue: Venue }) {
  const items = live(doc.items);
  const [adding, setAdding] = useState<GroupId | null>(null);
  return (
    <div className="space-y-6">
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.id);
        return (
          <section key={g.id}>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{g.label}</h3>
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {list.map((item) => (
                <OfferRow key={item.id} doc={doc} venue={venue} item={item} />
              ))}
              {adding === g.id ? (
                <NewItemRow
                  group={g.id}
                  onDone={() => setAdding(null)}
                  order={items.length}
                />
              ) : (
                <button onClick={() => setAdding(g.id)} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">
                  <Plus className="size-4" /> Add item to the checklist
                </button>
              )}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted">Items you add appear for every venue, so they stay comparable.</p>
    </div>
  );
}

function NewItemRow({ group, order, onDone }: { group: GroupId; order: number; onDone: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('flat');
  const save = () => {
    if (name.trim()) upsert('items', { id: `item-${uid()}`, updatedAt: 0, name: name.trim(), group, unit, order });
    onDone();
  };
  return (
    <div className="flex flex-col gap-2 bg-surface-2/50 p-3 sm:flex-row">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onDone();
        }}
        placeholder="e.g. Photo booth"
        className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none"
      />
      <div className="flex gap-2">
        <Select value={unit} onChange={setUnit} ariaLabel="Priced" className="w-36" options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
        <Button variant="primary" onClick={save}>
          Add
        </Button>
      </div>
    </div>
  );
}

function OfferRow({ doc, venue, item }: { doc: Doc; venue: Venue; item: Item }) {
  const offer = getOffer(doc, venue.id, item);
  const guests = doc.settings.guests;
  const cur = doc.settings.currency;
  const line = lineCost(offer, guests);
  const [noteOpen, setNoteOpen] = useState(!!offer.note);

  const save = (changes: Partial<Offer>) => upsert('offers', { ...getOffer(getDoc(), venue.id, item), ...changes });
  const needsQty = offer.unit === 'perHour' || offer.unit === 'perItem';
  const mult = unitMultiplier(offer.unit, guests, offer.qty);

  return (
    <div className={cn('px-4 py-3', offer.status === 'unavailable' && 'hatch')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn('text-[15px] font-medium', offer.status === 'unavailable' && 'text-ink-2 line-through decoration-na/50')}>{item.name}</div>
          {offer.status === 'extra' && line.total != null && (
            <div className="mt-0.5 text-xs text-muted tabular-nums">
              {price(offer.price, cur)} {offer.unit !== 'flat' && `× ${mult} ${offer.unit === 'perGuest' ? 'guests' : offer.unit === 'perHour' ? 'h' : ''}`}
              {line.tax ? ` + ${money(line.tax, cur, 2)} tax` : ''}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {offer.status === 'extra' ? (
            line.total != null ? (
              <span className="font-medium tabular-nums">{money(line.total, cur)}</span>
            ) : (
              <span className="text-xs font-medium text-ext">{line.missing === 'price' ? 'Price?' : line.missing === 'qty' ? (offer.unit === 'perHour' ? 'Hours?' : 'How many?') : 'Tax rate?'}</span>
            )
          ) : offer.status === 'included' ? (
            <span className="text-xs font-medium text-inc">Included</span>
          ) : offer.status === 'unavailable' ? (
            <span className="text-xs font-medium text-na">Not offered</span>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <StatusPicker value={offer.status} onChange={(status) => save({ status })} />
        <button
          onClick={() => setNoteOpen((o) => !o)}
          className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs transition hover:bg-surface-2', offer.note ? 'text-ink-2' : 'text-muted')}
          aria-expanded={noteOpen}
          aria-label="Note"
        >
          <StickyNote className={cn('size-4', offer.note && 'fill-gold-soft')} /> <span className="hidden sm:inline">Note</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {offer.status === 'extra' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4">
              <Field label="Price" className="col-span-1">
                <AmountInput value={offer.price} currency={cur} onCommit={(price) => save({ price })} ariaLabel={`${item.name} price`} />
              </Field>
              <Field label="Charged" className="col-span-1">
                <Select value={offer.unit} onChange={(unit) => save({ unit })} options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
              </Field>
              {needsQty && (
                <Field label={offer.unit === 'perHour' ? 'Hours' : 'How many'} className="col-span-1">
                  <AmountInput value={offer.qty} onCommit={(qty) => save({ qty })} />
                </Field>
              )}
              <Field label="Service tax" className={cn(needsQty ? 'col-span-1' : 'col-span-2')}>
                <TaxInput mode={offer.taxMode} value={offer.taxValue} currency={cur} onChange={(taxMode, taxValue) => save({ taxMode, taxValue })} />
              </Field>
            </div>
          </motion.div>
        )}
        {noteOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="pt-3">
              <TextInput value={offer.note} onCommit={(note) => save({ note })} placeholder="e.g. only white linens, min. 4 hours" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TaxInput({ mode, value, currency, onChange }: { mode: TaxMode; value: number | null; currency: string; onChange: (m: TaxMode, v: number | null) => void }) {
  return (
    <div className="flex gap-1.5">
      <Select
        value={mode}
        onChange={(m) => onChange(m, m === mode ? value : null)}
        ariaLabel="Service tax"
        className={cn(mode === 'none' ? 'w-full' : 'w-[5.5rem] shrink-0 px-2.5')}
        options={[
          { value: 'none', label: mode === 'none' ? 'No tax' : 'None' },
          { value: 'percent', label: '%' },
          { value: 'amount', label: 'Fixed' },
        ]}
      />
      {mode !== 'none' && (
        <AmountInput
          className="min-w-0 flex-1"
          value={value}
          onCommit={(v) => onChange(mode, v)}
          suffix={mode === 'percent' ? '%' : undefined}
          currency={mode === 'amount' ? currency : undefined}
          placeholder={mode === 'percent' ? 'rate' : 'amount'}
          ariaLabel={mode === 'percent' ? 'Tax rate' : 'Tax amount'}
        />
      )}
    </div>
  );
}

function VenueDates({ doc, venue }: { doc: Doc; venue: Venue }) {
  const dates = useMemo(() => live(doc.dates).sort((a, b) => a.date.localeCompare(b.date)), [doc.dates]);
  if (!dates.length) {
    return <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">Add the dates you're considering in the Dates tab, then mark each venue's availability here.</p>;
  }
  return (
    <div className="space-y-3">
      {dates.map((d) => (
        <AvailEditor key={d.id} doc={doc} venueId={venue.id} dateId={d.id} title={d.label ? `${d.label} · ${shortDate(d.date)}` : shortDate(d.date)} />
      ))}
    </div>
  );
}

export function AvailEditor({ doc, venueId, dateId, title }: { doc: Doc; venueId: string; dateId: string; title: string }) {
  const a = getAvail(doc, venueId, dateId);
  const status = a?.status ?? 'unknown';
  const save = (changes: Partial<{ status: AvailStatus; holdUntil: string; note: string }>) =>
    upsert('availability', {
      id: availId(venueId, dateId),
      updatedAt: 0,
      venueId,
      dateId,
      status,
      holdUntil: a?.holdUntil ?? '',
      note: a?.note ?? '',
      ...changes,
    });
  const days = status === 'held' ? daysUntil(a?.holdUntil ?? '') : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {days != null && <span className={cn('text-xs font-medium', days <= 7 ? 'text-na' : 'text-held')}>Hold ends {relDays(days)}</span>}
      </div>
      <Segmented
        size="sm"
        value={status}
        onChange={(s) => save({ status: s })}
        className="w-full"
        options={(['available', 'held', 'unavailable', 'booked', 'unknown'] as AvailStatus[]).map((s) => ({
          value: s,
          label: s === 'unknown' ? '?' : AVAIL_LABEL[s],
          title: AVAIL_LABEL[s],
          activeClass: cn(AVAIL_STYLE[s].replace(/line-through|decoration-1/g, ''), 'shadow-none'),
        }))}
      />
      {status === 'held' && (
        <div className="mt-3">
          <Field label="Hold expires on">
            <input type="date" value={a?.holdUntil ?? ''} onChange={(e) => save({ holdUntil: e.target.value })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none" />
          </Field>
        </div>
      )}
    </div>
  );
}

function VenueDetails({ doc, venue, onDeleted }: { doc: Doc; venue: Venue; onDeleted: () => void }) {
  const p = (changes: Partial<Venue>) => patch('venues', venue.id, changes);
  const chosen = doc.settings.chosenVenueId === venue.id;
  const link = venue.website && (/^https?:\/\//.test(venue.website) ? venue.website : `https://${venue.website}`);
  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-medium">Our pick</div>
          <div className="text-xs text-muted">Used for the budget on the Overview and Budget tabs.</div>
        </div>
        <Button variant={chosen ? 'primary' : 'secondary'} size="sm" onClick={() => setSettings({ chosenVenueId: chosen ? null : venue.id })}>
          {chosen ? 'Chosen ✓' : 'Choose'}
        </Button>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-2">Our rating</span>
          <Stars value={venue.rating} onChange={(rating) => p({ rating })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location">
            <TextInput value={venue.location} onCommit={(location) => p({ location })} placeholder="Town or address" />
          </Field>
          <Field label="Max guests" hint={venue.capacity != null && venue.capacity < doc.settings.guests ? `Below your ${doc.settings.guests} guests` : undefined}>
            <AmountInput value={venue.capacity} onCommit={(capacity) => p({ capacity })} />
          </Field>
          <Field label="Visited on">
            <input type="date" value={venue.visitDate} onChange={(e) => p({ visitDate: e.target.value })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none" />
          </Field>
          <Field label="Website">
            <div className="flex gap-1.5">
              <TextInput value={venue.website} onCommit={(website) => p({ website })} placeholder="venue.com" />
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2 hover:text-ink" aria-label="Open website">
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">Contact</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            <TextInput value={venue.contactName} onCommit={(contactName) => p({ contactName })} />
          </Field>
          <Field label="Phone">
            <div className="flex gap-1.5">
              <TextInput value={venue.phone} onCommit={(phone) => p({ phone })} inputMode="tel" />
              {venue.phone && (
                <a href={`tel:${venue.phone.replace(/\s/g, '')}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2" aria-label="Call">
                  <Phone className="size-4" />
                </a>
              )}
            </div>
          </Field>
          <Field label="Email">
            <div className="flex gap-1.5">
              <TextInput value={venue.email} onCommit={(email) => p({ email })} inputMode="email" />
              {venue.email && (
                <a href={`mailto:${venue.email}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2" aria-label="Email">
                  <Mail className="size-4" />
                </a>
              )}
            </div>
          </Field>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="What we loved">
          <TextInput multiline value={venue.pros} onCommit={(pros) => p({ pros })} placeholder="The terrace at sunset…" />
        </Field>
        <Field label="Concerns">
          <TextInput multiline value={venue.cons} onCommit={(cons) => p({ cons })} placeholder="Music must stop at 23:00…" />
        </Field>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">Contract terms</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Deposit">
            <TextInput value={venue.deposit} onCommit={(deposit) => p({ deposit })} placeholder="e.g. 30% on booking" />
          </Field>
          <Field label="Payment schedule">
            <TextInput value={venue.paymentTerms} onCommit={(paymentTerms) => p({ paymentTerms })} />
          </Field>
          <Field label="Cancellation">
            <TextInput value={venue.cancellation} onCommit={(cancellation) => p({ cancellation })} />
          </Field>
        </div>
      </section>

      <Field label="Other notes">
        <TextInput multiline value={venue.notes} onCommit={(notes) => p({ notes })} />
      </Field>

      <div className="border-t border-line pt-4">
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(`Delete ${venueName(venue)} and everything entered for it?`)) {
              removeVenue(venue.id);
              onDeleted();
            }
          }}
        >
          <Trash2 className="size-4" /> Delete venue
        </Button>
      </div>
    </div>
  );
}

