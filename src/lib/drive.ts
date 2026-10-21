/* ═══════════════════════════════════════════
   GOOGLE DRIVE SYNC  (v2 of the workout-tracker technique)

   Same foundations as the workout tracker:
   - Local-first: everything is saved in localStorage; Drive is the sync layer.
   - Google Identity Services token client, Client ID entered at runtime in
     Settings (no source edit, nothing secret in the repo).
   - Token cached with its expiry, silent renewal (prompt:'') before it
     lapses, and renewal from inside a tap when the browser blocks it.
   - Background sync on an interval, on returning to the tab, and on reconnect.

   What v2 changes:
   - drive.file scope + a visible file in My Drive instead of the hidden
     appDataFolder. appDataFolder is private to one Google account, so two
     people could never share it; a normal file can be shared, and you can
     see and back it up in Drive.
   - Partner access: the owner shares the file from inside the app; the
     partner opens it once through the Google Picker, which grants this app
     access to that one file.
   - One JSON document, merged record by record (newest edit wins, deletions
     kept as tombstones) instead of whole-file "last device wins".
   - Cheap change check: compares the file's Drive `version` before
     downloading, so frequent polling costs one tiny request.
   - Edits push automatically a couple of seconds after you stop typing.
   - login_hint with the remembered account, so silent renewal picks the
     right Google account when several are signed in.
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
const FILE_NAME = 'Wedding Planner.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const POLL_MS = 60 * 1000;
const PUSH_DELAY_MS = 2000;

const K = {
  cfg: 'wp_drive_cfg',
  token: 'wp_drive_token',
  file: 'wp_drive_file',
  user: 'wp_drive_user',
  version: 'wp_drive_version',
  lastSync: 'wp_drive_last_sync',
};

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
  | 'error';

export interface DriveView {
  status: DriveStatus;
  message: string;
  lastSync: number | null;
  user: { email: string; name: string } | null;
  file: { id: string; name: string; ownedByMe: boolean } | null;
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

const tokenFresh = () => !!token && expiry - Date.now() > 2 * 60 * 1000;

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
 * Ask Google for a token. Must be called synchronously from a tap when
 * interactive: nothing may be awaited before requestAccessToken, or mobile
 * browsers block the popup. That is why GIS is preloaded at startup.
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

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(expiry - Date.now() - 5 * 60 * 1000, 10000);
  refreshTimer = setTimeout(async () => {
    if (await requestToken(false)) return;
    if (view.file) set({ status: 'expired', message: 'Google sign-in expired. Tap to reconnect.' });
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
  if (!token) throw new DriveError('Not signed in', 401);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) {
    let msg = `Drive error ${res.status}`;
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

async function upload(id: string, d: Doc): Promise<string> {
  const res = await json<{ version: string }>(`${UPLOAD}/files/${id}?uploadType=media&fields=version`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  });
  return res.version;
}

// ── sync ───────────────────────────────────
let syncing = false;
let again = false;

/** Pull → merge → push. Safe to call often; concurrent calls coalesce. */
export async function syncNow(): Promise<boolean> {
  const file = view.file;
  if (!file || !navigator.onLine) return false;
  if (syncing) {
    again = true;
    return true;
  }
  if (!tokenFresh()) {
    if (!(await requestToken(false))) {
      set({ status: 'expired', message: 'Google sign-in expired. Tap to reconnect.' });
      return false;
    }
  }
  syncing = true;
  set({ status: 'syncing', message: '' });
  try {
    const meta = await getMeta(file.id);
    if (!meta) {
      write(K.file, null);
      write(K.version, null);
      set({ file: null, status: 'needsFile', message: 'The planner file is no longer available in Drive.' });
      return false;
    }
    const known = read<string>(K.version);
    const local = getDoc();
    let needPush = isDirty();
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
    }
    const now = Date.now();
    write(K.lastSync, now);
    const editor = meta.lastModifyingUser?.me ? 'you' : meta.lastModifyingUser?.displayName || '';
    set({ status: 'synced', message: '', lastSync: now, lastEditor: editor });
    return true;
  } catch (e) {
    if (e instanceof DriveError && e.status === 401) {
      token = null;
      write(K.token, null);
      set({ status: 'expired', message: 'Google sign-in expired. Tap to reconnect.' });
    } else {
      set({ status: 'error', message: (e as Error).message || 'Sync failed. Your changes are saved on this device.' });
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

function startBackground() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && view.file && tokenFresh()) syncNow();
  }, POLL_MS);
}

function stopBackground() {
  if (pollTimer) clearInterval(pollTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (pushTimer) clearTimeout(pushTimer);
  pollTimer = refreshTimer = pushTimer = null;
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
    set({ status: 'error', message: (e as Error).message });
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
      set({ status: view.file ? 'expired' : 'disconnected', message: 'Google sign-in was cancelled or blocked. Try again.' });
      return;
    }
    await afterSignIn();
  };
  set({ status: 'connecting', message: '' });
  // GIS should already be loaded (preloaded in initDrive) so this stays inside the tap
  if (ensureTokenClient()) return requestToken(true).then(go);
  return loadGIS().then(() => requestToken(true).then(go));
}

/** "Sync now" / tapping the status chip: renews the token inside the tap if needed. */
export function tapSync(): Promise<boolean> {
  if (tokenFresh()) return syncNow();
  if (!ensureTokenClient()) return Promise.resolve(false);
  return requestToken(true).then(async (ok) => {
    if (!ok) {
      set({ status: 'expired', message: 'Google sign-in was cancelled. Tap to try again.' });
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
      description: 'Data for the Wedding Planner app. Edit it from the app, not by hand.',
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
    set({ status: 'synced', lastSync: now, lastEditor: 'you' });
  } catch (e) {
    set({ status: 'error', message: (e as Error).message });
  }
}

/** Open a planner file someone shared with you (needs API key + project number). */
export async function pickSharedFile(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.projectNumber) {
    set({ message: 'Add the API key and project number in Drive setup to open a shared file.' });
    return;
  }
  if (!tokenFresh() && !(await requestToken(true))) return;
  try {
    await loadPicker();
  } catch (e) {
    set({ status: 'error', message: (e as Error).message });
    return;
  }
  const g = window.google;
  const shared = new g.picker.DocsView(g.picker.ViewId.DOCS).setMimeTypes('application/json').setOwnedByMe(false).setQuery('Wedding Planner');
  const mine = new g.picker.DocsView(g.picker.ViewId.DOCS).setMimeTypes('application/json').setQuery('Wedding Planner');
  await new Promise<void>((resolve) => {
    const picker = new g.picker.PickerBuilder()
      .setTitle('Choose the Wedding Planner file')
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
          set({ status: 'error', message: 'Could not open that file. Check it was shared with this Google account.' });
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
    await api(`${API}/files/${file.id}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent('Our wedding planner. Open the app, connect Google Drive and choose "Open shared planner".')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email.trim() }),
    });
    return true;
  } catch (e) {
    set({ message: (e as Error).message });
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
    loadGIS().catch(() => {});
    if (view.status === 'unconfigured') set({ status: 'disconnected' });
  } else {
    disconnect();
  }
}

// ── startup ────────────────────────────────
export function initDrive() {
  const cfg = getConfig();
  if (!cfg.clientId) {
    set({ status: 'unconfigured' });
    return;
  }
  // Preload GIS so a later tap can request a token without awaiting anything
  loadGIS()
    .then(() => {
      ensureTokenClient();
      if (cfg.apiKey) loadPicker().catch(() => {});
    })
    .catch(() => set({ status: 'error', message: 'Could not reach Google. Your changes are saved on this device.' }));

  const saved = read<{ token: string; expiry: number }>(K.token);
  if (saved && saved.expiry - Date.now() > 60000) {
    token = saved.token;
    expiry = saved.expiry;
    scheduleRefresh();
    afterSignIn();
  } else if (view.file) {
    // Was connected before: try a silent renewal; if the browser needs a tap, say so
    set({ status: 'expired', message: 'Tap to sync with Google Drive.' });
    loadGIS()
      .then(() => requestToken(false))
      .then((ok) => {
        if (ok) afterSignIn();
      })
      .catch(() => {});
  } else {
    set({ status: 'disconnected' });
  }

  onLocalChange(() => {
    if (!view.file) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (tokenFresh()) syncNow();
      else if (view.status !== 'expired') set({ status: 'expired', message: 'Tap to sync your latest changes.' });
    }, PUSH_DELAY_MS);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && view.file && tokenFresh()) syncNow();
    // Leaving the app with unsynced edits: push them now
    if (document.visibilityState === 'hidden' && view.file && tokenFresh() && isDirty()) syncNow();
  });
  window.addEventListener('online', () => {
    if (view.file && tokenFresh()) syncNow();
  });
}
