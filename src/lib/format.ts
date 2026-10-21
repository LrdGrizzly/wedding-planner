const cache = new Map<string, Intl.NumberFormat>();

function fmt(currency: string, digits: number) {
  const key = `${currency}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: 0 });
    } catch {
      f = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits });
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
      new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
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
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function tinyDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
