import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Banknote, Check, ChevronDown, FileSignature, Hourglass, ListChecks, MapPin, Phone, Mail, Plus, Trash2, Users } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { AmountInput, Button, Card, Empty, Field, PageHeader, Select, TextInput, confirmAction } from '@/components/ui';
import { UNIT_LABEL, getOffer, lineCost } from '@/lib/calc';
import { contractNumbers, dueState, sortedDeadlines, todayISO, upcomingEvents, type DueEvent, type DueState, type PaymentRow } from '@/lib/contract';
import { money, price, relDays, tinyDate } from '@/lib/format';
import { live, patch, remove, setSettings, upsert, useDoc } from '@/lib/store';
import type { Deadline, Doc, Offer, PayMode, Venue } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import { venueName } from './Venues';
import type { Tab } from '@/App';

const dateInput = 'h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none';

const MODE_OPTIONS: { value: PayMode; label: string }[] = [
  { value: 'amount', label: 'Importo fisso' },
  { value: 'percent', label: 'Percentuale del totale' },
  { value: 'rest', label: 'Tutto il resto (saldo)' },
];

const TASK_SUGGESTIONS = ['Firma del contratto', 'Conferma del numero di invitati', 'Scelta del menù', 'Prova del menù', 'Consegna della lista fornitori', 'Scelta di fiori e allestimento', 'Programma e orari della giornata'];

export function Contract({ onOpenVenue, onTab }: { onOpenVenue: (id: string) => void; onTab: (t: Tab) => void }) {
  const doc = useDoc();
  const venues = live(doc.venues);
  const venue = venues.find((v) => v.id === doc.settings.chosenVenueId);

  if (!venue) return <ChooseVenue doc={doc} onTab={onTab} />;

  return (
    <div>
      <PageHeader
        title={venueName(venue)}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-medium text-gold">La nostra location</span>
            {venue.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {venue.location}
              </span>
            )}
            {venue.capacity != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                fino a {venue.capacity}
              </span>
            )}
          </span>
        }
        action={
          <Select
            ariaLabel="Cambia location"
            value={venue.id}
            onChange={(id) => setSettings({ chosenVenueId: id })}
            className="w-52"
            options={venues.map((v) => ({ value: v.id, label: venueName(v) }))}
          />
        }
      />

      <div className="space-y-10">
        <Summary doc={doc} venue={venue} />
        <PaymentPlan doc={doc} venue={venue} />
        <Deadlines doc={doc} venue={venue} />
        <Costs doc={doc} venue={venue} onOpenVenue={onOpenVenue} />
        <Terms venue={venue} />
      </div>
    </div>
  );
}

// ── Nothing chosen yet ─────────────────────
function ChooseVenue({ doc, onTab }: { doc: Doc; onTab: (t: Tab) => void }) {
  const venues = live(doc.venues);
  const cur = doc.settings.currency;
  if (venues.length === 0) {
    return (
      <div>
        <PageHeader title="Contratto" />
        <Empty
          icon={<FileSignature className="size-6" />}
          title="Prima aggiungi le location"
          body="Quando avrete scelto, qui terrete sotto controllo costi, scadenze e pagamenti della location."
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
      <PageHeader title="Contratto" subtitle="Scegli la location: poi gestisci qui costi, scadenze e pagamenti." />
      <Card className="divide-y divide-line">
        {venues.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <div className="truncate font-medium">{venueName(v)}</div>
              <div className="text-xs text-muted">{v.location || 'Luogo non indicato'}</div>
            </div>
            <Button variant="primary" size="sm" onClick={() => setSettings({ chosenVenueId: v.id })}>
              <Check className="size-3.5" /> Scegli
            </Button>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-muted">Costi noti: {venues.map((v) => `${venueName(v)} ${money(contractNumbers(doc, v.id).total, cur)}`).join(' · ')}</p>
    </div>
  );
}

// ── Due-date chips ─────────────────────────
const CHIP: Record<DueState, string> = {
  done: 'bg-inc-bg text-inc',
  overdue: 'bg-na-bg text-na',
  soon: 'bg-ext-bg text-ext',
  later: 'bg-unk-bg text-ink-2',
  undated: 'bg-unk-bg text-muted',
};

function dueText(state: DueState, days: number | null, date: string, doneLabel = 'Fatto') {
  switch (state) {
    case 'done':
      return doneLabel;
    case 'overdue':
      return `Scaduto ${relDays(days ?? 0)}`;
    case 'soon':
      return days === 0 ? 'Scade oggi' : `Scade ${relDays(days ?? 0)}`;
    case 'later':
      return tinyDate(date);
    default:
      return 'Senza data';
  }
}

function DueChip({ state, days, date, doneLabel }: { state: DueState; days: number | null; date: string; doneLabel?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', CHIP[state])}>{dueText(state, days, date, doneLabel)}</span>;
}

// ── Summary ────────────────────────────────
function Summary({ doc, venue }: { doc: Doc; venue: Venue }) {
  const cur = doc.settings.currency;
  const n = contractNumbers(doc, venue.id);
  const events = upcomingEvents(doc, venue.id);
  const overdue = events.filter((e) => e.state === 'overdue').length;
  const pct = (x: number) => (n.total > 0 ? Math.min(Math.max((x / n.total) * 100, 0), 100) : 0);
  const scheduledUnpaid = Math.max(n.scheduled - n.paid, 0);

  return (
    <Card className="p-5 md:p-6">
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:gap-10">
        <div>
          <div className="text-xs text-muted">Totale con la location</div>
          <AnimatedNumber value={n.total} format={(x) => money(x, cur)} className="font-display text-4xl font-medium tracking-tight md:text-5xl" />
          <div className="mt-1 text-xs text-muted">
            {n.tax > 0 && <>di cui {money(n.tax, cur)} di IVA/servizio</>}
            {n.missing > 0 && <span className="font-medium text-ext">{n.tax > 0 ? ' · ' : ''}{n.missing === 1 ? '1 prezzo ancora mancante' : `${n.missing} prezzi ancora mancanti`}</span>}
          </div>

          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Pagato ${money(n.paid, cur)} su ${money(n.total, cur)}`}>
            <motion.div className="h-full bg-accent" animate={{ width: `${pct(n.paid)}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
            <motion.div className="h-full bg-gold/60" animate={{ width: `${pct(scheduledUnpaid)}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <Stat dot="bg-accent" label="Pagato" value={money(n.paid, cur)} />
            <Stat dot="bg-gold/60" label="Previsto" value={money(scheduledUnpaid, cur)} />
            <Stat dot="bg-line-strong" label="Da pianificare" value={n.unscheduled > 0 ? money(n.unscheduled, cur) : '—'} />
          </dl>
        </div>

        <div className="min-w-0 md:border-l md:border-line md:pl-8">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Prossime scadenze</div>
            {overdue > 0 && <span className="rounded-full bg-na-bg px-2 py-0.5 text-xs font-medium text-na">{overdue === 1 ? '1 scaduta' : `${overdue} scadute`}</span>}
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted">Nessuna scadenza aperta. Aggiungi le date ai pagamenti e alle cose da fare.</p>
          ) : (
            <ul className="space-y-2">
              {events.slice(0, 4).map((e) => (
                <EventRow key={e.id} e={e} cur={cur} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <span className={cn('size-2 shrink-0 rounded-full', dot)} />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

const KIND_ICON = { pay: Banknote, task: ListChecks, hold: Hourglass } as const;

function EventRow({ e, cur }: { e: DueEvent; cur: string }) {
  const Icon = KIND_ICON[e.kind];
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug">{e.title}</span>
        {e.kind === 'pay' && <span className="block text-xs text-muted tabular-nums">{e.amount != null ? price(e.amount, cur) : 'importo da definire'}</span>}
      </span>
      <DueChip state={e.state} days={e.days} date={e.date} />
    </li>
  );
}

// ── Payment plan ───────────────────────────
function PaymentPlan({ doc, venue }: { doc: Doc; venue: Venue }) {
  const cur = doc.settings.currency;
  const n = contractNumbers(doc, venue.id);
  const count = n.rows.length;

  const add = (name: string, mode: PayMode) => {
    const all = doc.payments.filter((p) => p.venueId === venue.id);
    upsert('payments', { id: `pay-${uid()}`, updatedAt: 0, venueId: venue.id, name, mode, value: null, dueDate: '', paidOn: '', paidAmount: null, note: '', order: all.length });
  };

  return (
    <section>
      <SectionHead title="Piano dei pagamenti" meta={count ? `${n.rows.filter((r) => r.paid).length} di ${count} pagati` : undefined} />

      {n.missing > 0 && n.total > 0 && (
        <Note tone="ext">Il totale ha ancora {n.missing === 1 ? '1 prezzo mancante' : `${n.missing} prezzi mancanti`}: gli importi in percentuale e il saldo cambieranno quando li inserirai.</Note>
      )}
      {count > 0 && n.unscheduled < -0.5 && <Note tone="na">Hai pianificato {money(-n.unscheduled, cur)} in più del totale.</Note>}
      {count > 0 && n.unscheduled > 0.5 && !n.hasRest && <Note tone="ext">Mancano {money(n.unscheduled, cur)} da pianificare. Aggiungi un saldo e verrà calcolato da solo.</Note>}

      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {n.rows.length === 0 && <p className="px-4 py-5 text-sm text-muted">Nessun pagamento ancora. Aggiungi la caparra, gli acconti e il saldo così come da contratto.</p>}
        {n.rows.map((r) => (
          <PaymentItem key={r.p.id} r={r} cur={cur} />
        ))}
        <div className="flex flex-wrap gap-2 bg-surface-2/40 px-4 py-3">
          <Button size="sm" onClick={() => add('Caparra', 'percent')}>
            <Plus className="size-3.5" /> Caparra
          </Button>
          <Button size="sm" onClick={() => add('Acconto', 'percent')}>
            <Plus className="size-3.5" /> Acconto
          </Button>
          {!n.hasRest && (
            <Button size="sm" onClick={() => add('Saldo', 'rest')}>
              <Plus className="size-3.5" /> Saldo
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => add('', 'amount')}>
            <Plus className="size-3.5" /> Altro
          </Button>
        </div>
      </div>
    </section>
  );
}

function PaymentItem({ r, cur }: { r: PaymentRow; cur: string }) {
  const { p } = r;
  const [open, setOpen] = useState(!p.name && !p.value);
  const set = (changes: Partial<typeof p>) => patch('payments', p.id, changes);
  const shown = r.paid ? r.paidAmount : r.amount;

  const markPaid = () => set({ paidOn: todayISO(), paidAmount: r.amount });
  const undo = () => set({ paidOn: '', paidAmount: null });

  return (
    <div className={cn(r.state === 'overdue' && 'bg-na-bg/25')}>
      <div className="flex items-center gap-2 px-3 py-2.5 md:px-4">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
          <span className="min-w-0">
            <span className={cn('block truncate text-[15px]', !p.name && 'text-muted italic', r.paid && 'text-ink-2')}>{p.name || 'Nuovo pagamento'}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <DueChip state={r.state} days={r.days} date={p.dueDate} doneLabel={p.paidOn ? `Pagato il ${tinyDate(p.paidOn)}` : 'Pagato'} />
              {p.mode === 'percent' && p.value != null && <span className="text-xs text-muted">{p.value}% del totale</span>}
              {p.mode === 'rest' && <span className="text-xs text-muted">il resto</span>}
            </span>
          </span>
        </button>
        <span className={cn('shrink-0 text-right font-medium tabular-nums', shown == null && 'text-muted', r.paid && 'text-inc')}>{shown == null ? '—' : price(shown, cur)}</span>
        {r.paid ? (
          <Button size="sm" variant="ghost" onClick={undo} aria-label={`Segna come non pagato: ${p.name || 'pagamento'}`} className="shrink-0 px-2">
            <Check className="size-4 text-inc" strokeWidth={3} />
          </Button>
        ) : (
          <Button size="sm" variant={r.state === 'overdue' || r.state === 'soon' ? 'primary' : 'secondary'} onClick={markPaid} disabled={r.amount == null} title={r.amount == null ? 'Inserisci prima l’importo' : undefined} className="shrink-0">
            Pagato
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-3 border-t border-line/60 bg-surface-2/40 px-4 pt-3 pb-4 sm:grid-cols-4">
              <Field label="Nome" className="col-span-2 sm:col-span-2">
                <TextInput value={p.name} onCommit={(name) => set({ name })} placeholder="es. Primo acconto" autoFocus={!p.name} />
              </Field>
              <Field label="Come si calcola" className="col-span-2 sm:col-span-2">
                <Select value={p.mode} onChange={(mode) => set({ mode, value: mode === p.mode ? p.value : null })} options={MODE_OPTIONS} />
              </Field>
              {p.mode !== 'rest' && (
                <Field label={p.mode === 'percent' ? 'Percentuale' : 'Importo'} className="col-span-1">
                  <AmountInput value={p.value} onCommit={(value) => set({ value })} suffix={p.mode === 'percent' ? '%' : undefined} currency={p.mode === 'amount' ? cur : undefined} placeholder={p.mode === 'percent' ? 'es. 30' : 'importo'} />
                </Field>
              )}
              <Field label="Da pagare entro" className="col-span-1">
                <input type="date" value={p.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className={dateInput} />
              </Field>
              <Field label="Pagato il" className="col-span-1">
                <input
                  type="date"
                  value={p.paidOn}
                  onChange={(e) => set(e.target.value ? { paidOn: e.target.value, paidAmount: p.paidAmount ?? r.amount } : { paidOn: '', paidAmount: null })}
                  className={dateInput}
                />
              </Field>
              {p.paidOn && (
                <Field label="Importo pagato" className="col-span-1">
                  <AmountInput value={p.paidAmount} currency={cur} onCommit={(paidAmount) => set({ paidAmount })} />
                </Field>
              )}
              <Field label="Note" className="col-span-2 sm:col-span-3">
                <TextInput value={p.note} onCommit={(note) => set({ note })} placeholder="es. bonifico, IBAN, numero ricevuta" />
              </Field>
              <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => confirmAction(`Eliminare il pagamento${p.name ? ` “${p.name}”` : ''}?`).then((ok) => ok && remove('payments', p.id))}
                >
                  <Trash2 className="size-4" /> Elimina
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Deadlines ──────────────────────────────
function Deadlines({ doc, venue }: { doc: Doc; venue: Venue }) {
  const list = sortedDeadlines(doc, venue.id);
  const holds = upcomingEvents(doc, venue.id).filter((e) => e.kind === 'hold');
  const used = new Set(list.map((d) => d.name));
  const suggestions = TASK_SUGGESTIONS.filter((s) => !used.has(s));
  const open = list.filter((d) => !d.doneOn).length;

  const add = (name: string) =>
    upsert('deadlines', { id: `dl-${uid()}`, updatedAt: 0, venueId: venue.id, name, dueDate: '', doneOn: '', note: '', order: list.length });

  return (
    <section>
      <SectionHead title="Scadenze e cose da fare" meta={list.length ? `${open} da fare` : undefined} />
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {list.length === 0 && holds.length === 0 && <p className="px-4 py-5 text-sm text-muted">Nulla in programma. Scegli dai suggerimenti qui sotto o scrivi la tua scadenza.</p>}
        {holds.map((h) => (
          <div key={h.id} className="flex items-center gap-3 px-3 py-2.5 md:px-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-held-bg text-held">
              <Hourglass className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px]">{h.title}</span>
            <DueChip state={h.state} days={h.days} date={h.date} />
          </div>
        ))}
        {list.map((d) => (
          <DeadlineItem key={d.id} d={d} />
        ))}
        <div className="space-y-2.5 bg-surface-2/40 px-4 py-3">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} onClick={() => add(s)} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] text-ink-2 transition hover:border-accent hover:text-ink">
                  <Plus className="size-3.5" /> {s}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => add('')}>
            <Plus className="size-3.5" /> Altra scadenza
          </Button>
        </div>
      </div>
    </section>
  );
}

function DeadlineItem({ d }: { d: Deadline }) {
  const [open, setOpen] = useState(!d.name);
  const done = !!d.doneOn;
  const { state, days } = dueState(d.dueDate, done);
  const set = (changes: Partial<Deadline>) => patch('deadlines', d.id, changes);

  return (
    <div className={cn(state === 'overdue' && 'bg-na-bg/25')}>
      <div className="flex items-center gap-2 px-3 py-2.5 md:px-4">
        <button
          onClick={() => set({ doneOn: done ? '' : todayISO() })}
          aria-pressed={done}
          aria-label={`${done ? 'Segna come da fare' : 'Segna come fatto'}: ${d.name || 'scadenza'}`}
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-full border transition active:scale-95', done ? 'border-inc bg-inc text-white' : 'border-line-strong text-transparent hover:border-accent hover:text-accent')}
        >
          <Check className="size-4" strokeWidth={3} />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className={cn('min-w-0 flex-1 truncate text-[15px]', !d.name && 'text-muted italic', done && 'text-muted line-through')}>{d.name || 'Nuova scadenza'}</span>
          <DueChip state={state} days={days} date={d.dueDate} doneLabel={d.doneOn ? `Fatto il ${tinyDate(d.doneOn)}` : 'Fatto'} />
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-3 border-t border-line/60 bg-surface-2/40 px-4 pt-3 pb-4 sm:grid-cols-4">
              <Field label="Cosa" className="col-span-2">
                <TextInput value={d.name} onCommit={(name) => set({ name })} placeholder="es. Conferma del numero di invitati" autoFocus={!d.name} />
              </Field>
              <Field label="Entro il" className="col-span-1">
                <input type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className={dateInput} />
              </Field>
              <Field label="Fatto il" className="col-span-1">
                <input type="date" value={d.doneOn} onChange={(e) => set({ doneOn: e.target.value })} className={dateInput} />
              </Field>
              <Field label="Note" className="col-span-2 sm:col-span-3">
                <TextInput value={d.note} onCommit={(note) => set({ note })} />
              </Field>
              <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                <Button variant="danger" size="sm" onClick={() => confirmAction(`Eliminare la scadenza${d.name ? ` “${d.name}”` : ''}?`).then((ok) => ok && remove('deadlines', d.id))}>
                  <Trash2 className="size-4" /> Elimina
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Costs ──────────────────────────────────
function costDetail(o: Offer, guests: number, cur: string, tax: number | null) {
  const parts: string[] = [];
  if (o.price != null) {
    if (o.unit === 'perGuest') parts.push(`${price(o.price, cur)} × ${guests} invitati`);
    else if (o.unit === 'perHour') parts.push(`${price(o.price, cur)} × ${o.qty ?? '?'} ore`);
    else if (o.unit === 'perItem') parts.push(`${price(o.price, cur)} × ${o.qty ?? '?'}`);
    else parts.push(price(o.price, cur));
  }
  if (tax) parts.push(o.taxMode === 'percent' && o.taxValue != null ? `IVA/servizio ${o.taxValue}% (${money(tax, cur, 2)})` : `IVA/servizio ${money(tax, cur, 2)}`);
  return parts.join(' + ');
}

function Costs({ doc, venue, onOpenVenue }: { doc: Doc; venue: Venue; onOpenVenue: (id: string) => void }) {
  const cur = doc.settings.currency;
  const guests = doc.settings.guests;
  const n = contractNumbers(doc, venue.id);
  const [showIncluded, setShowIncluded] = useState(false);

  const lines = live(doc.items).map((item) => {
    const offer = getOffer(doc, venue.id, item);
    return { item, offer, line: lineCost(offer, guests) };
  });
  const extras = lines.filter((l) => l.offer.status === 'extra');
  const included = lines.filter((l) => l.offer.status === 'included');
  const unknown = lines.filter((l) => l.offer.status === 'unknown').length;

  return (
    <section>
      <SectionHead
        title="Cosa paghiamo"
        action={
          <Button size="sm" onClick={() => onOpenVenue(venue.id)}>
            Modifica prezzi
          </Button>
        }
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {extras.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted">Nessuna voce a pagamento. Segna cosa costa extra nella scheda della location.</p>
        ) : (
          <ul className="divide-y divide-line">
            {extras.map(({ item, offer, line }) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[15px]">{item.name}</div>
                  <div className="mt-0.5 text-xs text-muted tabular-nums">{costDetail(offer, guests, cur, line.tax) || UNIT_LABEL[offer.unit]}</div>
                  {offer.note && <div className="mt-0.5 text-xs text-muted">{offer.note}</div>}
                </div>
                {line.total != null ? (
                  <span className="shrink-0 font-medium tabular-nums">{money(line.total, cur)}</span>
                ) : (
                  <span className="shrink-0 text-xs font-medium text-ext">{line.missing === 'price' ? 'Prezzo?' : line.missing === 'qty' ? 'Quantità?' : 'Aliquota?'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-4 py-3">
          <span className="text-sm font-medium">Totale</span>
          <span className="font-display text-xl font-medium tabular-nums">{money(n.total, cur)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {included.length > 0 && (
          <button onClick={() => setShowIncluded((s) => !s)} className="underline underline-offset-2 hover:text-ink" aria-expanded={showIncluded}>
            {included.length === 1 ? '1 voce inclusa' : `${included.length} voci incluse`} nel prezzo
          </button>
        )}
        {unknown > 0 && <span>{unknown === 1 ? '1 voce ancora da chiedere' : `${unknown} voci ancora da chiedere`}</span>}
      </div>
      <AnimatePresence initial={false}>
        {showIncluded && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-wrap gap-1.5 overflow-hidden pt-2">
            {included.map(({ item }) => (
              <li key={item.id} className="rounded-full bg-inc-bg px-2.5 py-1 text-xs text-inc">
                {item.name}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Contract terms & contact ───────────────
function Terms({ venue }: { venue: Venue }) {
  const p = (changes: Partial<Venue>) => patch('venues', venue.id, changes);
  const link = (href: string | false, Icon: typeof Phone, label: string) =>
    href && (
      <a href={href} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2 hover:text-ink" aria-label={label}>
        <Icon className="size-4" />
      </a>
    );
  return (
    <section>
      <SectionHead title="Condizioni e contatti" />
      <Card className="space-y-5 p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Caparra">
            <TextInput value={venue.deposit} onCommit={(deposit) => p({ deposit })} placeholder="es. 25% alla prenotazione" />
          </Field>
          <Field label="Pagamenti">
            <TextInput value={venue.paymentTerms} onCommit={(paymentTerms) => p({ paymentTerms })} placeholder="es. saldo 20 giorni prima" />
          </Field>
          <Field label="Disdetta">
            <TextInput value={venue.cancellation} onCommit={(cancellation) => p({ cancellation })} placeholder="es. rimborso 70% fino a 90 giorni prima" />
          </Field>
        </div>
        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <Field label="Referente">
            <TextInput value={venue.contactName} onCommit={(contactName) => p({ contactName })} />
          </Field>
          <Field label="Telefono">
            <div className="flex gap-1.5">
              <TextInput value={venue.phone} onCommit={(phone) => p({ phone })} inputMode="tel" />
              {link(!!venue.phone && `tel:${venue.phone.replace(/\s/g, '')}`, Phone, 'Chiama')}
            </div>
          </Field>
          <Field label="Email">
            <div className="flex gap-1.5">
              <TextInput value={venue.email} onCommit={(email) => p({ email })} inputMode="email" />
              {link(!!venue.email && `mailto:${venue.email}`, Mail, "Scrivi un'email")}
            </div>
          </Field>
        </div>
      </Card>
    </section>
  );
}

// ── Shared bits ────────────────────────────
function SectionHead({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h2 className="font-display text-xl font-medium tracking-tight">{title}</h2>
        {meta && <span className="text-sm text-muted">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

function Note({ tone, children }: { tone: 'ext' | 'na'; children: React.ReactNode }) {
  return <p className={cn('mb-3 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed', tone === 'ext' ? 'bg-ext-bg text-ext' : 'bg-na-bg text-na')}>{children}</p>;
}

