/* ═══════════════════════════════════════════
   GOOGLE DRIVE SYNC  (v3 of the workout-tracker technique)

   v1 (workout tracker) foundations, all kept:
   - Local-first: everything is saved in localStorage; Drive is the sync layer.
   - Google Identity Services token client, Client ID entered at runtime in
     Settings (no source edit, nothing secret in the repo).
   - Token cached with its expiry; silent renewal (prompt:'') 5 min before
     it lapses; the token client is preloaded so a tap can renew it.

   v1 AUTO SYNC, ported in full (v3):
   - Periodic background sync; if the token is about to lapse it is
     silently renewed first, then the sync runs (was: skipped).
   - Returning to the app (visibilitychange): renew if needed, then sync.
   - Boundary syncs: mobile browsers freeze timers and the 1-hour token is
     usually dead by the next visit, and Google only renews silently from
     inside a user tap. So natural "boundary" taps (switching tab, opening or
     closing a venue / panel) renew the token *inside the tap* and sync.
     syncAtBoundary() must be called synchronously from the click handler.
   - Automatic reconnect on load: restore a valid cached token, or try a
     silent renewal.

   Added in v2:
   - drive.file scope + a visible, shareable file in My Drive instead of the
     hidden appDataFolder (private to one Google account, so a partner could
     never share it).
   - Partner access: owner shares from the app; partner opens the file once
     via the Google Picker, which grants this app access to that file.
   - Record-level merge (newest edit wins, deletions kept as tombstones)
     instead of whole-file "last device wins".
   - Cheap change check on the Drive `version` before downloading.
   - Edits push automatically ~2 s after you stop typing.
   - login_hint with the remembered account for silent renewal.

   Added in v3:
   - Retry with backoff (15 s → 5 min) after network / server errors.
   - Flush on leave: unsynced edits are pushed with `keepalive` when the
     app is hidden or closed, so they survive the tab being killed.
   - Silent renewals outside a tap are rate-limited so a browser that
     blocks them doesn't get hammered.
═══════════════════════════════════════════ */

import { fingerprint, getDoc, isDirty, markClean, mergeDocs, normalize, onLocalChange, replaceDoc } from './store';
import type { Doc } from './types';

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'Organizzatore Matrimonio.json';
const PICKER_QUERY = 'Organizzatore Matrimonio';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const AUTO = {
  pollMs: 60 * 1000, // background sync while the app is open
  pushDelayMs: 2000, // after the last edit
  renewBeforeMs: 2 * 60 * 1000, // treat the token as stale this long before expiry
  boundaryThrottleMs: 30 * 1000, // min gap between boundary syncs when nothing changed
  silentRetryMs: 2 * 60 * 1000, // min gap between silent renewals outside a tap
  backoffMs: [15, 30, 60, 120, 300].map((s) => s * 1000),
  keepaliveMaxBytes: 60 * 1024, // fetch keepalive bodies are capped at 64 KB
};

const K = {
  cfg: 'wp_drive_cfg',
  token: 'wp_drive_token',
  file: 'wp_drive_file',
  user: 'wp_drive_user',
  version: 'wp_drive_version',
  lastSync: 'wp_drive_last_sync',
};

const MSG = {
  expired: 'Accesso a Google scaduto. Tocca per riconnetterti.',
  tapToSync: 'Tocca per sincronizzare con Google Drive.',
  pending: 'Modifiche da sincronizzare: tocca per inviarle.',
  cancelled: 'Accesso a Google annullato o bloccato. Riprova.',
  offline: 'Sei offline. Le modifiche sono salvate su questo dispositivo.',
  failed: 'Sincronizzazione non riuscita. Le modifiche sono salvate su questo dispositivo.',
  gone: 'Il file non è più disponibile su Drive.',
  noGoogle: 'Impossibile raggiungere Google. Le modifiche sono salvate su questo dispositivo.',
  needPickerKeys: 'Aggiungi chiave API e numero di progetto nella configurazione di Drive per aprire un file condiviso.',
  badPick: 'Impossibile aprire il file. Controlla che sia stato condiviso con questo account Google.',
  notSignedIn: 'Accesso non effettuato',
  createFailed: 'Impossibile creare il file su Drive. Riprova.',
  pickerFailed: 'Impossibile aprire il selettore di Google Drive.',
  shareFailed: "Condivisione non riuscita. Controlla l'indirizzo email e riprova.",
};

/** Google's error texts are English: log the detail, show Italian. */
function fail(e: unknown, message: string, status: DriveStatus | null = 'error') {
  console.warn('[Drive]', (e as Error)?.message || e);
  set(status ? { status, message } : { message });
}

export interface DriveConfig {
  clientId: string;
  apiKey: string; // only needed to open a file someone shared with you
  projectNumber: string; // ditto (the Picker's app id)
}

export type DriveStatus =
  | 'unconfigured' // no Client ID yet
  | 'disconnected' // configured, never connected / signed out
  | 'connecting'
  | 'needsFile' // signed in, no planner file chosen yet
  | 'syncing'
  | 'synced'
  | 'expired' // token lapsed and needs a tap to renew
  | 'offline'
  | 'error';

export interface DriveView {
  status: DriveStatus;
  message: string;
  lastSync: number | null;
  user: { email: string; name: string } | null;
  file: { id: string; name: string; ownedByMe: boolean } | null;
  /** '' unknown, 'me' this account, otherwise the other person's name */
  lastEditor: string;
}

// ── small storage helpers ──────────────────
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ── observable state ───────────────────────
const listeners = new Set<() => void>();
let view: DriveView = {
  status: 'unconfigured',
  message: '',
  lastSync: read<number>(K.lastSync),
  user: read(K.user),
  file: read(K.file),
  lastEditor: '',
};

function set(changes: Partial<DriveView>) {
  view = { ...view, ...changes };
  listeners.forEach((l) => l());
}

export function subscribeDrive(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function getDriveView() {
  return view;
}

export function getConfig(): DriveConfig {
  return { clientId: '', apiKey: '', projectNumber: '', ...(read<DriveConfig>(K.cfg) || {}) };
}

// ── token handling ─────────────────────────
let token: string | null = null;
let expiry = 0;
let tokenClient: any = null;
let tokenClientHint = '';
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let lastSilentAttempt = 0;
let lastBoundarySync = 0;

const tokenFresh = () => !!token && expiry - Date.now() > AUTO.renewBeforeMs;

function loadScript(src: string, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

const loadGIS = () => loadScript('https://accounts.google.com/gsi/client', () => !!window.google?.accounts?.oauth2);

function loadPicker(): Promise<void> {
  return loadScript('https://apis.google.com/js/api.js', () => !!window.gapi).then(
    () =>
      new Promise<void>((resolve, reject) => {
        if (window.google?.picker) return resolve();
        window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Picker failed to load')) });
      }),
  );
}

type Pending = { resolve: (ok: boolean) => void; done: boolean };
let pending: Pending | null = null;

function ensureTokenClient(): boolean {
  const cfg = getConfig();
  if (!cfg.clientId || !window.google?.accounts?.oauth2) return false;
  const hint = view.user?.email || '';
  if (tokenClient && tokenClientHint === hint) return true;
  tokenClientHint = hint;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: cfg.clientId,
    scope: SCOPE,
    login_hint: hint || undefined,
    callback: (resp: any) => {
      const p = pending;
      pending = null;
      if (!p || p.done) return;
      p.done = true;
      if (resp.error) return p.resolve(false);
      token = resp.access_token;
      expiry = Date.now() + Number(resp.expires_in || 3600) * 1000;
      write(K.token, { token, expiry });
      scheduleRefresh();
      p.resolve(true);
    },
    error_callback: () => {
      // popup closed / blocked: GIS reports it here, not in `callback`
      const p = pending;
      pending = null;
      if (p && !p.done) {
        p.done = true;
        p.resolve(false);
      }
    },
  });
  return true;
}

/**
 * Ask Google for a token. When called from a tap, nothing may be awaited
 * before this runs, or mobile browsers block it. That is why GIS is
 * preloaded at startup. `interactive` allows the account/consent popup.
 */
function requestToken(interactive: boolean): Promise<boolean> {
  if (!ensureTokenClient()) return Promise.resolve(false);
  if (pending && !pending.done) {
    pending.done = true;
    pending.resolve(false);
  }
  const p = new Promise<boolean>((resolve) => {
    pending = { resolve, done: false };
  });
  tokenClient.requestAccessToken({ prompt: interactive && !view.user ? 'consent' : '' });
  // GIS never calls back if the browser silently swallows the request
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), interactive ? 120000 : 15000));
  return Promise.race([p, timeout]);
}

/** Silent renewal outside a tap: rate-limited, since browsers may block it. */
function silentRenew(): Promise<boolean> {
  if (tokenFresh()) return Promise.resolve(true);
  if (Date.now() - lastSilentAttempt < AUTO.silentRetryMs) return Promise.resolve(false);
  lastSilentAttempt = Date.now();
  return requestToken(false);
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(expiry - Date.now() - 5 * 60 * 1000, 10000);
  refreshTimer = setTimeout(async () => {
    lastSilentAttempt = 0; // this one is planned, always allowed
    if (await silentRenew()) return;
    if (view.file) set({ status: 'expired', message: MSG.expired });
  }, delay);
}

// ── Drive REST ─────────────────────────────
class DriveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!token) throw new DriveError(MSG.notSignedIn, 401);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) {
    let msg = `Errore Drive ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || msg;
    } catch {
      /* not json */
    }
    throw new DriveError(msg, res.status);
  }
  return res;
}

const json = async <T,>(url: string, init?: RequestInit) => (await api(url, init)).json() as Promise<T>;

interface FileMeta {
  id: string;
  name: string;
  version: string;
  ownedByMe?: boolean;
  trashed?: boolean;
  lastModifyingUser?: { displayName?: string; me?: boolean };
}

const META_FIELDS = 'id,name,version,ownedByMe,trashed,lastModifyingUser(displayName,me)';

async function fetchUser() {
  const about = await json<{ user: { emailAddress: string; displayName: string } }>(`${API}/about?fields=user(emailAddress,displayName)`);
  const user = { email: about.user.emailAddress, name: about.user.displayName };
  write(K.user, user);
  set({ user });
}

async function findOwnFile(): Promise<FileMeta | null> {
  // With drive.file this only sees files this app created or was given via the Picker
  const q = `name='${FILE_NAME}' and trashed=false`;
  const res = await json<{ files: FileMeta[] }>(`${API}/files?q=${encodeURIComponent(q)}&fields=files(${META_FIELDS})&orderBy=modifiedTime desc&pageSize=10`);
  return res.files?.[0] ?? null;
}

async function getMeta(id: string): Promise<FileMeta | null> {
  try {
    const m = await json<FileMeta>(`${API}/files/${id}?fields=${META_FIELDS}`);
    return m.trashed ? null : m;
  } catch (e) {
    if (e instanceof DriveError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

function useFile(meta: FileMeta) {
  const file = { id: meta.id, name: meta.name, ownedByMe: meta.ownedByMe !== false };
  write(K.file, file);
  set({ file });
}

async function download(id: string): Promise<Doc> {
  const res = await api(`${API}/files/${id}?alt=media`);
  return normalize(await res.json());
}

async function upload(id: string, d: Doc, keepalive = false): Promise<string> {
  const res = await json<{ version: string }>(`${UPLOAD}/files/${id}?uploadType=media&fields=version`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
    keepalive,
  });
  return res.version;
}

// ── sync ───────────────────────────────────
let syncing = false;
let again = false;

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  const delay = AUTO.backoffMs[Math.min(retryStep, AUTO.backoffMs.length - 1)];
  retryStep++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    autoSync();
  }, delay);
}

function resetRetry() {
  retryStep = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Pull → merge → push. Needs a fresh token; concurrent calls coalesce. */
export async function syncNow(): Promise<boolean> {
  const file = view.file;
  if (!file) return false;
  if (!navigator.onLine) {
    set({ status: 'offline', message: MSG.offline });
    return false;
  }
  if (syncing) {
    again = true;
    return true;
  }
  if (!tokenFresh() && !(await silentRenew())) {
    set({ status: 'expired', message: isDirty() ? MSG.pending : MSG.expired });
    return false;
  }
  syncing = true;
  set({ status: 'syncing', message: '' });
  try {
    const meta = await getMeta(file.id);
    if (!meta) {
      write(K.file, null);
      write(K.version, null);
      set({ file: null, status: 'needsFile', message: MSG.gone });
      return false;
    }
    const known = read<string>(K.version);
    const local = getDoc();
    let needPush = isDirty();
    let editor = meta.lastModifyingUser?.me ? 'me' : meta.lastModifyingUser?.displayName || '';
    if (meta.version !== known) {
      const remote = await download(file.id);
      const merged = mergeDocs(local, remote);
      const fpMerged = fingerprint(merged);
      needPush = fpMerged !== fingerprint(remote);
      // An edit made while we were downloading must not be lost
      if (getDoc() === local) {
        if (fpMerged !== fingerprint(local)) replaceDoc(merged, needPush);
      } else {
        replaceDoc(mergeDocs(getDoc(), merged), true);
        needPush = true;
      }
      write(K.version, meta.version);
    }
    if (needPush) {
      const before = getDoc();
      const version = await upload(file.id, before);
      write(K.version, version);
      if (getDoc() === before) markClean();
      editor = 'me';
    }
    const now = Date.now();
    write(K.lastSync, now);
    resetRetry();
    set({ status: 'synced', message: '', lastSync: now, lastEditor: editor });
    return true;
  } catch (e) {
    if (e instanceof DriveError && e.status === 401) {
      token = null;
      write(K.token, null);
      set({ status: 'expired', message: MSG.expired });
    } else {
      // Network hiccup, quota, 5xx: keep the data local and try again later
      fail(e, MSG.failed);
      scheduleRetry();
    }
    return false;
  } finally {
    syncing = false;
    if (again) {
      again = false;
      setTimeout(syncNow, 200);
    }
  }
}

/** Background sync: renews the token silently if needed, never prompts. */
async function autoSync() {
  if (!view.file || syncing) return;
  if (!navigator.onLine) {
    set({ status: 'offline', message: MSG.offline });
    return;
  }
  if (!tokenFresh() && !(await silentRenew())) {
    if (view.status !== 'expired') set({ status: 'expired', message: isDirty() ? MSG.pending : MSG.tapToSync });
    return;
  }
  await syncNow();
}

/**
 * Boundary sync, ported from the workout tracker's session-boundary sync.
 * Call it SYNCHRONOUSLY at the top of a click handler for a natural pause
 * point (tab switch, opening/closing a venue or panel): if the token has
 * lapsed it is renewed inside the tap, where browsers allow it, then synced.
 */
export function syncAtBoundary() {
  if (!view.file || !getConfig().clientId || !navigator.onLine) return;
  if (!isDirty() && Date.now() - lastBoundarySync < AUTO.boundaryThrottleMs) return;
  lastBoundarySync = Date.now();
  if (tokenFresh()) {
    syncNow();
    return;
  }
  if (!ensureTokenClient()) return;
  // No await before this: it must run inside the user's tap
  requestToken(false).then((ok) => {
    if (ok) {
      startBackground();
      syncNow();
    } else if (view.status !== 'expired') {
      set({ status: 'expired', message: isDirty() ? MSG.pending : MSG.tapToSync });
    }
  });
}

/** Leaving the app: push unsynced edits with keepalive so they survive the tab closing. */
function flushOnLeave() {
  const file = view.file;
  if (!file || !isDirty() || !tokenFresh() || syncing) return;
  const d = getDoc();
  const body = JSON.stringify(d);
  if (body.length > AUTO.keepaliveMaxBytes) {
    syncNow();
    return;
  }
  upload(file.id, d, true)
    .then((version) => {
      write(K.version, version);
      if (getDoc() === d) markClean();
    })
    .catch(() => {});
}

function startBackground() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') autoSync();
  }, AUTO.pollMs);
}

function stopBackground() {
  for (const t of [refreshTimer, pushTimer, retryTimer]) if (t) clearTimeout(t);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = refreshTimer = pushTimer = retryTimer = null;
}

/** After a token is in hand: who am I, which file, then sync. */
async function afterSignIn() {
  set({ status: 'connecting', message: '' });
  try {
    if (!view.user) await fetchUser();
    let meta: FileMeta | null = null;
    if (view.file) meta = await getMeta(view.file.id);
    if (!meta) meta = await findOwnFile();
    if (!meta) {
      write(K.file, null);
      set({ file: null, status: 'needsFile', message: '' });
      return;
    }
    useFile(meta);
    startBackground();
    await syncNow();
  } catch (e) {
    fail(e, MSG.failed);
    scheduleRetry();
  }
}

// ── public actions (call these from taps) ──

/** Sign in. Call directly from a click handler. */
export function connect(): Promise<void> {
  if (!getConfig().clientId) {
    set({ status: 'unconfigured' });
    return Promise.resolve();
  }
  const go = async (ok: boolean) => {
    if (!ok) {
      set({ status: view.file ? 'expired' : 'disconnected', message: MSG.cancelled });
      return;
    }
    await afterSignIn();
  };
  set({ status: 'connecting', message: '' });
  // GIS should already be loaded (preloaded in initDrive) so this stays inside the tap
  if (ensureTokenClient()) return requestToken(true).then(go);
  return loadGIS().then(() => requestToken(true).then(go));
}

/** "Sincronizza ora" / tapping the status chip: renews the token inside the tap if needed. */
export function tapSync(): Promise<boolean> {
  lastBoundarySync = Date.now();
  if (tokenFresh()) return syncNow();
  if (!ensureTokenClient()) return Promise.resolve(false);
  return requestToken(true).then(async (ok) => {
    if (!ok) {
      set({ status: 'expired', message: MSG.cancelled });
      return false;
    }
    if (!view.file) {
      await afterSignIn();
      return true;
    }
    startBackground();
    return syncNow();
  });
}

/** Create the planner file in My Drive from what's on this device. */
export async function createFile(): Promise<void> {
  set({ status: 'syncing', message: '' });
  try {
    const metadata = {
      name: FILE_NAME,
      mimeType: 'application/json',
      description: "Dati dell'app Organizzatore Matrimonio. Modificalo dall'app, non a mano.",
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(getDoc())], { type: 'application/json' }));
    const meta = await json<FileMeta>(`${UPLOAD}/files?uploadType=multipart&fields=${META_FIELDS}`, { method: 'POST', body: form });
    useFile(meta);
    write(K.version, meta.version);
    markClean();
    startBackground();
    const now = Date.now();
    write(K.lastSync, now);
    set({ status: 'synced', lastSync: now, lastEditor: 'me' });
  } catch (e) {
    fail(e, MSG.createFailed);
  }
}

/** Open a planner file someone shared with you (needs API key + project number). */
export async function pickSharedFile(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.projectNumber) {
    set({ message: MSG.needPickerKeys });
    return;
  }
  if (!tokenFresh() && !(await requestToken(true))) return;
  try {
    await loadPicker();
  } catch (e) {
    fail(e, MSG.pickerFailed, null);
    return;
  }
  const g = window.google;
  const shared = new g.picker.DocsView(g.picker.ViewId.DOCS).setMimeTypes('application/json').setOwnedByMe(false).setQuery(PICKER_QUERY);
  const mine = new g.picker.DocsView(g.picker.ViewId.DOCS).setMimeTypes('application/json').setQuery(PICKER_QUERY);
  await new Promise<void>((resolve) => {
    const picker = new g.picker.PickerBuilder()
      .setLocale('it')
      .setTitle('Scegli il file Organizzatore Matrimonio')
      .setOAuthToken(token)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.projectNumber)
      .setOrigin(window.location.origin)
      .addView(shared)
      .addView(mine)
      .setCallback(async (data: any) => {
        if (data.action === g.picker.Action.CANCEL) return resolve();
        if (data.action !== g.picker.Action.PICKED) return;
        const id = data.docs?.[0]?.id;
        resolve();
        if (!id) return;
        const meta = await getMeta(id).catch(() => null);
        if (!meta) {
          set({ status: 'error', message: MSG.badPick });
          return;
        }
        write(K.version, null); // force a full download + merge
        useFile(meta);
        startBackground();
        await syncNow();
      })
      .build();
    picker.setVisible(true);
  });
}

/** Give a partner edit access to the planner file (Google emails them). */
export async function shareWith(email: string): Promise<boolean> {
  const file = view.file;
  if (!file) return false;
  try {
    if (!tokenFresh() && !(await requestToken(true))) return false;
    const note = 'Il nostro organizzatore del matrimonio. Apri l\'app, collega Google Drive e scegli "Apri un file condiviso con me".';
    await api(`${API}/files/${file.id}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(note)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email.trim() }),
    });
    return true;
  } catch (e) {
    fail(e, MSG.shareFailed, null);
    return false;
  }
}

export async function listSharedWith(): Promise<string[]> {
  const file = view.file;
  if (!file || !tokenFresh()) return [];
  try {
    const res = await json<{ permissions: { emailAddress?: string; role: string }[] }>(
      `${API}/files/${file.id}/permissions?fields=permissions(emailAddress,role)`,
    );
    return (res.permissions || []).filter((p) => p.emailAddress && p.emailAddress !== view.user?.email).map((p) => p.emailAddress!);
  } catch {
    return [];
  }
}

export function disconnect() {
  stopBackground();
  resetRetry();
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
  token = null;
  expiry = 0;
  tokenClient = null;
  write(K.token, null);
  write(K.user, null);
  write(K.file, null);
  write(K.version, null);
  set({ status: getConfig().clientId ? 'disconnected' : 'unconfigured', user: null, file: null, message: '', lastEditor: '' });
}

export function saveConfig(cfg: DriveConfig) {
  const clean = { clientId: cfg.clientId.trim(), apiKey: cfg.apiKey.trim(), projectNumber: cfg.projectNumber.trim() };
  const changedClient = clean.clientId !== getConfig().clientId;
  write(K.cfg, clean);
  if (changedClient) {
    tokenClient = null;
    token = null;
    write(K.token, null);
  }
  if (clean.clientId) {
    loadGIS()
      .then(() => ensureTokenClient())
      .catch(() => {});
    if (view.status === 'unconfigured') set({ status: 'disconnected' });
  } else {
    disconnect();
  }
}

// ── startup ────────────────────────────────
let listenersWired = false;

export function initDrive() {
  const cfg = getConfig();
  if (!cfg.clientId) {
    set({ status: 'unconfigured' });
  } else {
    // Preload GIS so a later tap can request a token without awaiting anything
    loadGIS()
      .then(() => {
        ensureTokenClient();
        if (cfg.apiKey) loadPicker().catch(() => {});
      })
      .catch(() => set({ status: 'error', message: MSG.noGoogle }));

    // Automatic reconnect on load
    const saved = read<{ token: string; expiry: number }>(K.token);
    if (saved && saved.expiry - Date.now() > AUTO.renewBeforeMs) {
      token = saved.token;
      expiry = saved.expiry;
      scheduleRefresh();
      afterSignIn();
    } else if (view.file) {
      set({ status: 'expired', message: MSG.tapToSync });
      loadGIS()
        .then(() => silentRenew())
        .then((ok) => {
          if (ok) afterSignIn();
        })
        .catch(() => {});
    } else {
      set({ status: 'disconnected' });
    }
  }

  if (listenersWired) return;
  listenersWired = true;

  // Edits push automatically shortly after you stop
  onLocalChange(() => {
    if (!view.file) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(autoSync, AUTO.pushDelayMs);
  });

  document.addEventListener('visibilitychange', () => {
    if (!view.file) return;
    if (document.visibilityState === 'visible') autoSync();
    else flushOnLeave();
  });
  window.addEventListener('pagehide', flushOnLeave);
  window.addEventListener('online', () => {
    resetRetry();
    autoSync();
  });
  window.addEventListener('offline', () => {
    if (view.file) set({ status: 'offline', message: MSG.offline });
  });
}
