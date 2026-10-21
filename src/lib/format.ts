export const LOCALE = 'it-IT';

const cache = new Map<string, Intl.NumberFormat>();

function fmt(currency: string, digits: number) {
  const key = `${currency}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    try {
      // useGrouping 'always': Italian CLDR skips the separator for 4-digit numbers
      // ("3727 €" next to "11.603 €"), which reads inconsistently in a budget
      f = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: 0, useGrouping: 'always' as unknown as boolean });
    } catch {
      f = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, useGrouping: 'always' as unknown as boolean });
    }
    cache.set(key, f);
  }
  return f;
}

export function money(n: number | null | undefined, currency: string, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return fmt(currency, digits).format(n);
}

/** Price as typed (keeps cents when there are any). */
export function price(n: number | null | undefined, currency: string) {
  if (n == null) return '—';
  return money(n, currency, Number.isInteger(n) ? 0 : 2);
}

export function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat(LOCALE, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export function shortDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function tinyDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/** Parse a typed amount: accepts "1.250,50", "1,250.50", "1250" or "". */
export function parseAmount(s: string): number | null {
  const t = s.trim().replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  let norm = t;
  if (lastComma > -1 && lastDot > -1) {
    norm = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    // Only one kind of separator. Repeated, or followed by exactly three
    // digits ("12.500", "1,250"), it groups thousands; otherwise it is the
    // decimal mark ("12.5", "1,50").
    const sep = lastComma > -1 ? ',' : lastDot > -1 ? '.' : '';
    if (sep) {
      const parts = t.split(sep);
      const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      norm = thousands ? parts.join('') : parts.join('.');
    }
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function relDays(n: number) {
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}

/** Italian singular/plural: plural(1, 'incluso', 'inclusi') → '1 incluso'. */
export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
