import { useSyncExternalStore } from 'react';
import { emptyDoc } from './defaults';
import { SAMPLE_ENABLED } from './flags';
import { sampleDoc } from './sample';
import type { CollectionKey, Doc, Rec, Settings } from './types';

const DOC_KEY = 'wp_doc';
const DIRTY_KEY = 'wp_dirty';

type Listener = () => void;

function load(): Doc {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  // First visit to the test build: show example locations (cleared from the banner)
  return SAMPLE_ENABLED ? sampleDoc() : emptyDoc();
}

/** Fill in anything a doc from an older build (or a hand-edited file) lacks. */
export function normalize(input: Partial<Doc> | null | undefined): Doc {
  const base = emptyDoc();
  if (!input || typeof input !== 'object') return base;
  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  return {
    schema: 1,
    venues: arr(input.venues, []),
    items: arr(input.items, base.items),
    offers: arr(input.offers, []),
    dates: arr(input.dates, []),
    availability: arr(input.availability, []),
    costs: arr(input.costs, base.costs),
    payments: arr(input.payments, []),
    deadlines: arr(input.deadlines, []),
    settings: { ...base.settings, ...(input.settings || {}), id: 'settings' },
  };
}

let doc: Doc = load();
let dirty = (() => {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<Listener>();
const changeHooks = new Set<Listener>();

function persist() {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    localStorage.setItem(DIRTY_KEY, dirty ? '1' : '0');
  } catch {
    /* storage full or blocked: the in-memory copy still works */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getDoc() {
  return doc;
}

export function isDirty() {
  return dirty;
}

export function markClean() {
  dirty = false;
  persist();
}

/** Called after every local edit (the Drive sync debounces a push off this). */
export function onLocalChange(fn: Listener) {
  changeHooks.add(fn);
  return () => changeHooks.delete(fn);
}

function commit(next: Doc) {
  doc = next;
  dirty = true;
  persist();
  emit();
  changeHooks.forEach((h) => h());
}

/** Replace the whole doc with one that came from Drive or an import. Not a local edit. */
export function replaceDoc(next: Doc, stillDirty = false) {
  doc = next;
  dirty = stillDirty;
  persist();
  emit();
}

export function useDoc(): Doc {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => doc,
  );
}

/** Live (non-deleted) records of a collection, sorted by `order` when present. */
export function live<T extends Rec>(list: T[]): T[] {
  const out = list.filter((r) => !r.deleted);
  if (out.length && 'order' in out[0]) {
    out.sort((a, b) => ((a as unknown as { order: number }).order ?? 0) - ((b as unknown as { order: number }).order ?? 0));
  }
  return out;
}

export function upsert<K extends CollectionKey>(key: K, record: Doc[K][number]) {
  const list = doc[key] as Rec[];
  const stamped = { ...record, updatedAt: Date.now() } as Rec;
  const i = list.findIndex((r) => r.id === record.id);
  const nextList = i >= 0 ? list.map((r, j) => (j === i ? stamped : r)) : [...list, stamped];
  commit({ ...doc, [key]: nextList });
}

export function patch<K extends CollectionKey>(key: K, id: string, changes: Partial<Doc[K][number]>) {
  const list = doc[key] as Rec[];
  const current = list.find((r) => r.id === id);
  if (!current) return;
  upsert(key, { ...current, ...changes } as Doc[K][number]);
}

export function remove(key: CollectionKey, id: string) {
  patch(key, id, { deleted: true } as never);
}

export function setSettings(changes: Partial<Settings>) {
  commit({ ...doc, settings: { ...doc.settings, ...changes, id: 'settings', updatedAt: Date.now() } });
}

/** Remove a venue together with its offers, availability, payments and deadlines. */
export function removeVenue(venueId: string) {
  const now = Date.now();
  const kill = <T extends Rec & { venueId: string }>(list: T[]) =>
    list.map((r) => (r.venueId === venueId && !r.deleted ? { ...r, deleted: true, updatedAt: now } : r));
  commit({
    ...doc,
    venues: doc.venues.map((v) => (v.id === venueId ? { ...v, deleted: true, updatedAt: now } : v)),
    offers: kill(doc.offers),
    availability: kill(doc.availability),
    payments: kill(doc.payments),
    deadlines: kill(doc.deadlines),
    settings:
      doc.settings.chosenVenueId === venueId
        ? { ...doc.settings, chosenVenueId: null, updatedAt: now }
        : doc.settings,
  });
}

// ── MERGE ──────────────────────────────────
// Record-level last-write-wins. Two people editing different venues (or
// different items of the same venue) never overwrite each other.
function mergeList<T extends Rec>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of a) map.set(r.id, r);
  for (const r of b) {
    const cur = map.get(r.id);
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) map.set(r.id, r);
  }
  return [...map.values()];
}

export function mergeDocs(local: Doc, remote: Doc): Doc {
  const l = normalize(local);
  const r = normalize(remote);
  return {
    schema: 1,
    venues: mergeList(l.venues, r.venues),
    items: mergeList(l.items, r.items),
    offers: mergeList(l.offers, r.offers),
    dates: mergeList(l.dates, r.dates),
    availability: mergeList(l.availability, r.availability),
    costs: mergeList(l.costs, r.costs),
    payments: mergeList(l.payments, r.payments),
    deadlines: mergeList(l.deadlines, r.deadlines),
    settings: (r.settings.updatedAt || 0) > (l.settings.updatedAt || 0) ? r.settings : l.settings,
  };
}

/** Stable fingerprint used to tell whether a merge changed anything. */
export function fingerprint(d: Doc) {
  const sig = (list: Rec[]) =>
    list
      .map((r) => `${r.id}:${r.updatedAt}:${r.deleted ? 1 : 0}`)
      .sort()
      .join('|');
  return [
    sig(d.venues),
    sig(d.items),
    sig(d.offers),
    sig(d.dates),
    sig(d.availability),
    sig(d.costs),
    sig(d.payments),
    sig(d.deadlines),
    d.settings.updatedAt,
  ].join('#');
}
