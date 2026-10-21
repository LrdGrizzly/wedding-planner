/* Dev-only fake of Google Identity Services + the Drive REST endpoints the
   sync uses, so auto-sync can be exercised without a Google account.
   Enabled only in `npm run dev` when localStorage.wp_drive_mock is set.
   The "remote" file lives in localStorage.mock_remote; test knobs:
     mock_token_ttl  seconds a token lives (default 3600)
     mock_fail       'net' | '500' to make the next Drive calls fail
     mock_silent     'block' to make non-interactive token requests fail
   Every Drive call is appended to window.__driveLog. */

type Log = { t: number; method: string; path: string; status: number };
const log: Log[] = [];
(window as unknown as { __driveLog: Log[] }).__driveLog = log;

const ls = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
};

function remote() {
  const raw = ls.get('mock_remote');
  return raw ? (JSON.parse(raw) as { id: string; name: string; version: number; body: string; editor: string }) : null;
}
function saveRemote(r: NonNullable<ReturnType<typeof remote>>) {
  ls.set('mock_remote', JSON.stringify(r));
}

let interactiveCalls = 0;

window.google = {
  accounts: {
    oauth2: {
      initTokenClient(cfg: { callback: (r: unknown) => void; error_callback?: (e: unknown) => void }) {
        return {
          requestAccessToken({ prompt }: { prompt?: string } = {}) {
            const silent = prompt === '';
            // A real tap carries user activation; outside one, browsers block the popup
            const inTap = navigator.userActivation?.isActive ?? false;
            if (silent && !inTap && ls.get('mock_silent') === 'block') {
              setTimeout(() => cfg.error_callback?.({ type: 'popup_failed_to_open' }), 10);
              return;
            }
            if (!silent) interactiveCalls++;
            const ttl = Number(ls.get('mock_token_ttl') || 3600);
            setTimeout(() => cfg.callback({ access_token: `tok-${Date.now()}`, expires_in: ttl }), 10);
          },
        };
      },
      revoke(_t: string, done: () => void) {
        done();
      },
    },
  },
};
(window as unknown as { __interactiveCalls: () => number }).__interactiveCalls = () => interactiveCalls;

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!url.hostname.endsWith('googleapis.com')) return realFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const path = url.pathname;
  const reply = (status: number, body: unknown) => {
    log.push({ t: Date.now(), method, path, status });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const fail = ls.get('mock_fail');
  if (fail === 'net') {
    log.push({ t: Date.now(), method, path, status: 0 });
    throw new TypeError('Failed to fetch');
  }
  if (fail === '500') return reply(500, { error: { message: 'Backend Error' } });

  const r = remote();
  const meta = (x: NonNullable<typeof r>) => ({
    id: x.id,
    name: x.name,
    version: String(x.version),
    ownedByMe: true,
    trashed: false,
    lastModifyingUser: { displayName: x.editor, me: x.editor === 'Test User' },
  });

  if (path.endsWith('/about')) return reply(200, { user: { emailAddress: 'test@example.com', displayName: 'Test User' } });
  if (path === '/drive/v3/files' && method === 'GET') return reply(200, { files: r ? [meta(r)] : [] });
  if (path === '/upload/drive/v3/files' && method === 'POST') {
    const form = init.body as FormData;
    const body = await (form.get('file') as Blob).text();
    const created = { id: 'file-1', name: 'Organizzatore Matrimonio.json', version: 1, body, editor: 'Test User' };
    saveRemote(created);
    return reply(200, meta(created));
  }
  const m = path.match(/files\/([^/]+)$/);
  if (m && r && m[1] === r.id) {
    if (method === 'PATCH') {
      r.body = String(init.body);
      r.version++;
      r.editor = 'Test User';
      saveRemote(r);
      return reply(200, { version: String(r.version) });
    }
    if (url.searchParams.get('alt') === 'media') {
      log.push({ t: Date.now(), method, path: path + '?alt=media', status: 200 });
      return new Response(r.body, { status: 200 });
    }
    return reply(200, meta(r));
  }
  return reply(404, { error: { message: 'Not found' } });
};

export {};
