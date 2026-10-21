import { live } from './store';
import type { AvailStatus, Cost, Doc, Item, ItemStatus, Offer, TaxMode, Unit } from './types';

export const offerId = (venueId: string, itemId: string) => `${venueId}__${itemId}`;
export const availId = (venueId: string, dateId: string) => `${venueId}__${dateId}`;

export function getOffer(doc: Doc, venueId: string, item: Item): Offer {
  const id = offerId(venueId, item.id);
  const found = doc.offers.find((o) => o.id === id && !o.deleted);
  return (
    found ?? {
      id,
      updatedAt: 0,
      venueId,
      itemId: item.id,
      status: 'unknown',
      price: null,
      unit: item.unit,
      qty: null,
      taxMode: 'none',
      taxValue: null,
      note: '',
    }
  );
}

export function taxOn(base: number, mode: TaxMode, value: number | null): number | null {
  if (mode === 'none') return 0;
  if (value == null) return null; // tax applies but the rate is not known yet
  return mode === 'percent' ? (base * value) / 100 : value;
}

export interface Line {
  status: ItemStatus;
  base: number | null;
  tax: number | null;
  total: number | null;
  /** Why the total is unknown, when it is. */
  missing: null | 'price' | 'qty' | 'tax';
}

export function unitMultiplier(unit: Unit, guests: number, qty: number | null): number | null {
  if (unit === 'flat') return 1;
  if (unit === 'perGuest') return guests;
  return qty; // hours or items: unknown until entered, never guessed
}

/** What one offer adds to a venue's cost. Only "extra" items cost anything. */
export function lineCost(offer: Offer, guests: number): Line {
  if (offer.status !== 'extra') {
    return { status: offer.status, base: offer.status === 'included' ? 0 : null, tax: 0, total: offer.status === 'included' ? 0 : null, missing: null };
  }
  if (offer.price == null) return { status: 'extra', base: null, tax: null, total: null, missing: 'price' };
  const mult = unitMultiplier(offer.unit, guests, offer.qty);
  if (mult == null) return { status: 'extra', base: null, tax: null, total: null, missing: 'qty' };
  const base = offer.price * mult;
  const tax = taxOn(base, offer.taxMode, offer.taxValue);
  if (tax == null) return { status: 'extra', base, tax: null, total: null, missing: 'tax' };
  return { status: 'extra', base, tax, total: base + tax, missing: null };
}

export interface VenueSummary {
  known: number; // sum of every priced extra, tax included
  tax: number;
  counts: Record<ItemStatus, number>;
  missing: number; // extras whose total can't be worked out yet
}

export function venueSummary(doc: Doc, venueId: string): VenueSummary {
  const guests = doc.settings.guests || 0;
  const s: VenueSummary = { known: 0, tax: 0, counts: { unknown: 0, included: 0, extra: 0, unavailable: 0 }, missing: 0 };
  for (const item of live(doc.items)) {
    const line = lineCost(getOffer(doc, venueId, item), guests);
    s.counts[line.status]++;
    if (line.missing) s.missing++;
    if (line.total != null) s.known += line.total;
    if (line.tax != null) s.tax += line.tax;
  }
  return s;
}

export function costTotal(c: Cost): number | null {
  if (c.amount == null) return null;
  const tax = taxOn(c.amount, c.taxMode, c.taxValue);
  return tax == null ? null : c.amount + tax;
}

export function costsSummary(doc: Doc) {
  let known = 0;
  let missing = 0;
  let paid = 0;
  for (const c of live(doc.costs)) {
    const t = costTotal(c);
    if (t == null) missing++;
    else known += t;
    paid += c.paid ?? 0;
  }
  return { known, missing, paid };
}

export function getAvail(doc: Doc, venueId: string, dateId: string) {
  return doc.availability.find((a) => a.id === availId(venueId, dateId) && !a.deleted);
}

export const AVAIL_LABEL: Record<AvailStatus, string> = {
  unknown: 'Not asked',
  available: 'Available',
  held: 'On hold',
  unavailable: 'Unavailable',
  booked: 'Booked',
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  unknown: 'Not asked',
  included: 'Included',
  extra: 'Extra cost',
  unavailable: 'Not offered',
};

export const UNIT_LABEL: Record<Unit, string> = {
  flat: 'flat',
  perGuest: 'per guest',
  perHour: 'per hour',
  perItem: 'per item',
};

/** Days from today until a yyyy-mm-dd date (negative = past). */
export function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
