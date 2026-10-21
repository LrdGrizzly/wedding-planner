import { daysUntil, venueSummary } from './calc';
import { live } from './store';
import type { Deadline, Doc, Payment } from './types';

/** Local today as yyyy-mm-dd (toISOString would shift the date near midnight). */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DueState = 'done' | 'overdue' | 'soon' | 'later' | 'undated';

/** Items due within this many days are flagged as coming up. */
export const SOON_DAYS = 14;

export function dueState(date: string, done: boolean): { state: DueState; days: number | null } {
  if (done) return { state: 'done', days: null };
  const days = daysUntil(date);
  if (days == null) return { state: 'undated', days: null };
  if (days < 0) return { state: 'overdue', days };
  if (days <= SOON_DAYS) return { state: 'soon', days };
  return { state: 'later', days };
}

const cents = (n: number) => Math.round(n * 100) / 100;

export interface PaymentRow {
  p: Payment;
  /** Amount owed. null while it can't be worked out yet (no value, or no total). */
  amount: number | null;
  paid: boolean;
  /** What counts as paid so far for this instalment. */
  paidAmount: number;
  state: DueState;
  days: number | null;
}

export interface ContractNumbers {
  total: number;
  tax: number;
  missing: number;
  rows: PaymentRow[];
  paid: number;
  scheduled: number; // sum of all instalments with a known amount
  toPay: number; // total − paid
  unscheduled: number; // total − scheduled (negative = scheduled more than the total)
  hasRest: boolean;
}

/**
 * Work out every instalment of the chosen venue.
 *  - 'amount'  is the value as typed
 *  - 'percent' is a share of the contract total
 *  - 'rest'    is what remains after all the other instalments
 * A paid instalment keeps the amount actually paid, so changing prices
 * later never rewrites what has already left the account.
 */
export function contractNumbers(doc: Doc, venueId: string): ContractNumbers {
  const vs = venueSummary(doc, venueId);
  const total = cents(vs.known);
  const list = live(doc.payments).filter((p) => p.venueId === venueId);

  const amount = new Map<string, number | null>();
  const effective = (p: Payment, scheduled: number | null) => (p.paidOn && p.paidAmount != null ? p.paidAmount : scheduled);

  let others = 0;
  for (const p of list) {
    if (p.mode === 'rest') continue;
    let a: number | null = null;
    if (p.mode === 'amount') a = p.value;
    else if (p.value != null && total > 0) a = cents((total * p.value) / 100);
    amount.set(p.id, a);
    others += effective(p, a) ?? 0;
  }
  const rest = total > 0 ? Math.max(cents(total - others), 0) : null;
  for (const p of list) if (p.mode === 'rest') amount.set(p.id, rest);

  const rows: PaymentRow[] = list.map((p) => {
    const a = amount.get(p.id) ?? null;
    const paid = !!p.paidOn;
    return { p, amount: a, paid, paidAmount: paid ? (effective(p, a) ?? 0) : 0, ...dueState(p.dueDate, paid) };
  });
  // Soonest first; instalments without a date go last
  rows.sort((x, y) => (x.p.dueDate || '9999').localeCompare(y.p.dueDate || '9999') || x.p.order - y.p.order);

  const paid = cents(rows.reduce((s, r) => s + r.paidAmount, 0));
  const scheduled = cents(rows.reduce((s, r) => s + (r.paid ? r.paidAmount : (r.amount ?? 0)), 0));
  return {
    total,
    tax: vs.tax,
    missing: vs.missing,
    rows,
    paid,
    scheduled,
    toPay: cents(total - paid),
    unscheduled: cents(total - scheduled),
    hasRest: list.some((p) => p.mode === 'rest'),
  };
}

export function sortedDeadlines(doc: Doc, venueId: string): Deadline[] {
  return live(doc.deadlines)
    .filter((d) => d.venueId === venueId)
    .sort((a, b) => Number(!!a.doneOn) - Number(!!b.doneOn) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.order - b.order);
}

export interface DueEvent {
  id: string;
  kind: 'pay' | 'task' | 'hold';
  title: string;
  date: string;
  amount: number | null;
  state: DueState;
  days: number | null;
}

/** Everything still open for the venue, payments, tasks and date holds, soonest first. */
export function upcomingEvents(doc: Doc, venueId: string): DueEvent[] {
  const out: DueEvent[] = [];

  for (const r of contractNumbers(doc, venueId).rows) {
    if (r.paid) continue;
    out.push({ id: r.p.id, kind: 'pay', title: r.p.name || 'Pagamento', date: r.p.dueDate, amount: r.amount, state: r.state, days: r.days });
  }
  for (const d of sortedDeadlines(doc, venueId)) {
    if (d.doneOn) continue;
    const s = dueState(d.dueDate, false);
    out.push({ id: d.id, kind: 'task', title: d.name || 'Da fare', date: d.dueDate, amount: null, state: s.state, days: s.days });
  }
  const dates = new Map(live(doc.dates).map((d) => [d.id, d]));
  for (const a of doc.availability) {
    if (a.deleted || a.venueId !== venueId || a.status !== 'held' || !a.holdUntil) continue;
    const wd = dates.get(a.dateId);
    if (!wd) continue;
    const s = dueState(a.holdUntil, false);
    out.push({ id: a.id, kind: 'hold', title: `Opzione sulla data ${wd.label || wd.date}`, date: a.holdUntil, amount: null, state: s.state, days: s.days });
  }

  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}
