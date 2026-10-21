import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { AmountInput, Button, Card, Field, PageHeader, Select, TextInput } from '@/components/ui';
import { costTotal, costsSummary, venueSummary } from '@/lib/calc';
import { COST_CATEGORIES, makeCost } from '@/lib/defaults';
import { money } from '@/lib/format';
import { getDoc, live, patch, remove, setSettings, upsert, useDoc } from '@/lib/store';
import type { Cost, CostCategory, CostStatus, Doc } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import { TaxInput, venueName } from './Venues';

const STATUS_OPTS: { value: CostStatus; label: string }[] = [
  { value: 'todo', label: 'Da trovare' },
  { value: 'quoted', label: 'Preventivo' },
  { value: 'booked', label: 'Prenotato' },
  { value: 'paid', label: 'Pagato' },
];

const STATUS_TONE: Record<CostStatus, string> = {
  todo: 'bg-unk-bg text-unk',
  quoted: 'bg-ext-bg text-ext',
  booked: 'bg-held-bg text-held',
  paid: 'bg-inc-bg text-inc',
};

export function budgetNumbers(doc: Doc) {
  const venue = doc.settings.chosenVenueId ? doc.venues.find((v) => v.id === doc.settings.chosenVenueId && !v.deleted) : undefined;
  const vs = venue ? venueSummary(doc, venue.id) : null;
  const cs = costsSummary(doc);
  const budget = doc.settings.budget;
  const committed = (vs?.known ?? 0) + cs.known;
  return { venue, vs, cs, budget, committed, remaining: budget == null ? null : budget - committed };
}

export function Budget({ onSettings }: { onSettings: () => void }) {
  const doc = useDoc();
  const cur = doc.settings.currency;
  const venues = live(doc.venues);
  const { venue, vs, cs, budget, committed, remaining } = budgetNumbers(doc);
  const costs = live(doc.costs);

  const pct = (n: number) => (budget && budget > 0 ? Math.min((n / budget) * 100, 100) : 0);

  const addCost = (category: CostCategory) => {
    const c = makeCost('', category, costs.length, `cost-${uid()}`);
    upsert('costs', c);
    return c.id;
  };

  return (
    <div>
      <PageHeader title="Budget" subtitle="Tutto il matrimonio: la location scelta più tutto il resto." />

      <Card className="mb-8 p-5 md:p-6">
        <div className="grid gap-5 md:grid-cols-[1fr_1.4fr] md:gap-8">
          <div className="space-y-4">
            <Field label="Budget totale">
              <AmountInput value={budget} currency={cur} onCommit={(b) => setSettings({ budget: b })} placeholder="Inserisci il budget" />
            </Field>
            <Field label="Location" hint={venues.length === 0 ? 'Prima aggiungi le location' : vs && vs.missing > 0 ? (vs.missing === 1 ? 'Manca ancora 1 prezzo della location' : `Mancano ancora ${vs.missing} prezzi della location`) : undefined}>
              <Select
                value={doc.settings.chosenVenueId ?? ''}
                onChange={(id) => setSettings({ chosenVenueId: id || null })}
                options={[{ value: '', label: 'Non ancora scelta' }, ...venues.map((v) => ({ value: v.id, label: venueName(v) }))]}
              />
            </Field>
          </div>

          <div>
            <div className="text-xs text-muted">{remaining == null ? 'Costi noti finora' : remaining < 0 ? 'Fuori budget di' : venue ? 'Ancora da spendere' : 'Rimasti per la location'}</div>
            <AnimatedNumber
              value={remaining == null ? committed : Math.abs(remaining)}
              format={(n) => money(n, cur)}
              className={cn('font-display text-4xl font-medium tracking-tight md:text-5xl', remaining != null && remaining < 0 && 'text-na')}
            />
            {budget != null && budget > 0 && (
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full bg-accent" animate={{ width: `${pct(vs?.known ?? 0)}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
                <motion.div className="h-full bg-gold" animate={{ width: `${pct(cs.known)}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
              </div>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="size-2 rounded-full bg-accent" />
                  Location
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums">{venue ? money(vs!.known, cur) : '—'}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="size-2 rounded-full bg-gold" />
                  Tutto il resto
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums">{money(cs.known, cur)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Già pagato</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{money(cs.paid, cur)}</dd>
              </div>
            </dl>
            {cs.missing > 0 && <p className="mt-3 text-xs text-ext">{cs.missing === 1 ? '1 voce qui sotto non ha ancora un prezzo' : `${cs.missing} voci qui sotto non hanno ancora un prezzo`}: il totale reale sarà più alto.</p>}
          </div>
        </div>
      </Card>

      <div className="space-y-8">
        {COST_CATEGORIES.map((cat) => {
          const list = costs.filter((c) => c.category === cat.id);
          const sub = list.reduce((s, c) => s + (costTotal(c) ?? 0), 0);
          return (
            <section key={cat.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-medium">{cat.label}</h2>
                <span className="text-sm text-muted tabular-nums">{money(sub, cur)}</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {list.map((c) => (
                  <CostRow key={c.id} cost={c} currency={cur} />
                ))}
                <AddCostButton onAdd={() => addCost(cat.id)} />
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        Invitati, valuta e lista delle voci delle location sono nelle{' '}
        <button onClick={onSettings} className="underline underline-offset-2 hover:text-ink">
          Impostazioni
        </button>
        .
      </p>
    </div>
  );
}

function AddCostButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button onClick={onAdd} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">
      <Plus className="size-4" /> Aggiungi voce
    </button>
  );
}

function CostRow({ cost, currency }: { cost: Cost; currency: string }) {
  const [open, setOpen] = useState(!cost.name);
  const total = costTotal(cost);
  const p = (changes: Partial<Cost>) => patch('costs', cost.id, changes);
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
          <span className={cn('truncate text-[15px]', !cost.name && 'text-muted italic')}>{cost.name || 'Nuova voce'}</span>
        </button>
        <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline', STATUS_TONE[cost.status])}>{STATUS_OPTS.find((s) => s.value === cost.status)!.label}</span>
        <span className={cn('w-24 shrink-0 text-right tabular-nums', total == null ? 'text-muted' : 'font-medium')}>{total == null ? '—' : money(total, currency)}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-3 border-t border-line/60 bg-surface-2/40 px-4 pt-3 pb-4 sm:grid-cols-4">
              <Field label="Cosa" className="col-span-2">
                <TextInput value={cost.name} onCommit={(name) => p({ name })} placeholder="es. Scarpe della sposa" autoFocus={!cost.name} />
              </Field>
              <Field label="Prezzo" className="col-span-1">
                <AmountInput value={cost.amount} currency={currency} onCommit={(amount) => p({ amount })} />
              </Field>
              <Field label="Stato" className="col-span-1">
                <Select value={cost.status} onChange={(status) => p({ status })} options={STATUS_OPTS} />
              </Field>
              <Field label="IVA / servizio" className="col-span-2">
                <TaxInput mode={cost.taxMode} value={cost.taxValue} currency={currency} onChange={(taxMode, taxValue) => p({ taxMode, taxValue })} />
              </Field>
              <Field label="Già pagato" className="col-span-1">
                <AmountInput value={cost.paid} currency={currency} onCommit={(paid) => p({ paid })} />
              </Field>
              <Field label="Fornitore" className="col-span-1">
                <TextInput value={cost.vendor} onCommit={(vendor) => p({ vendor })} />
              </Field>
              <Field label="Note" className="col-span-2 sm:col-span-3">
                <TextInput value={cost.note} onCommit={(note) => p({ note })} />
              </Field>
              <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-1">
                <Select
                  ariaLabel="Categoria"
                  value={cost.category}
                  onChange={(category) => p({ category })}
                  options={COST_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
                />
                <Button
                  variant="danger"
                  size="sm"
                  className="size-10 shrink-0 px-0"
                  aria-label="Elimina voce"
                  onClick={() => {
                    const name = getDoc().costs.find((c) => c.id === cost.id)?.name;
                    if (!name || window.confirm(`Eliminare ${name}?`)) remove('costs', cost.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
