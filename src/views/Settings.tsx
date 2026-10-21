import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cloud, Download, FileJson, Plus, RefreshCw, Share2, Trash2, Upload, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AmountInput, Button, Field, Select, Sheet, TextInput } from '@/components/ui';
import { UNIT_LABEL } from '@/lib/calc';
import { GROUPS } from '@/lib/defaults';
import { connect, createFile, disconnect, getConfig, listSharedWith, pickSharedFile, saveConfig, shareWith, tapSync } from '@/lib/drive';
import { getDoc, live, mergeDocs, normalize, patch, remove, replaceDoc, setSettings, upsert, useDoc } from '@/lib/store';
import type { GroupId, Unit } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import { useDrive } from '@/App';

const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'AUD', 'CAD', 'SEK', 'DKK', 'NOK', 'PLN'];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDoc();
  const s = doc.settings;
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-9">
        <section className="space-y-3">
          <H>Your wedding</H>
          <Field label="Names">
            <TextInput value={s.coupleNames} onCommit={(coupleNames) => setSettings({ coupleNames })} placeholder="e.g. Ale & Je" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Guests" hint="Per-guest prices are multiplied by this">
              <AmountInput value={s.guests} onCommit={(g) => setSettings({ guests: Math.max(0, Math.round(g ?? 0)) })} />
            </Field>
            <Field label="Currency">
              <Select value={s.currency} onChange={(currency) => setSettings({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
          </div>
          <Field label="Total budget">
            <AmountInput value={s.budget} currency={s.currency} onCommit={(budget) => setSettings({ budget })} placeholder="Enter your budget" />
          </Field>
        </section>

        <DriveSection />

        <ChecklistEditor />

        <BackupSection />

        <p className="text-center text-xs text-muted">Wedding Planner · saved on this device{getConfig().clientId ? ' and in Google Drive' : ''}</p>
      </div>
    </Sheet>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-lg font-medium">{children}</h3>;
}

// ── Google Drive ───────────────────────────
function DriveSection() {
  const d = useDrive();
  const [editing, setEditing] = useState(false);
  const configured = !!getConfig().clientId;
  const showSetup = !configured || editing;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <H>Google Drive sync</H>
        {configured && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
            Edit setup
          </button>
        )}
      </div>
      <p className="text-sm text-ink-2">
        Saves everything to a file in your Google Drive so you can both use it from any phone or computer. It keeps working offline and syncs when you're back.
      </p>

      {showSetup ? (
        <DriveSetup onDone={() => setEditing(false)} canCancel={configured} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4">
          {d.user && (
            <div className="mb-3 flex items-center gap-2.5 text-sm">
              <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{d.user.name}</div>
                <div className="truncate text-xs text-muted">{d.user.email}</div>
              </div>
            </div>
          )}

          {(d.status === 'disconnected' || (d.status === 'expired' && !d.file)) && (
            <Button variant="primary" className="w-full" onClick={() => connect()}>
              <Cloud className="size-4" /> Connect Google Drive
            </Button>
          )}

          {d.status === 'connecting' && <p className="flex items-center gap-2 text-sm text-muted"><RefreshCw className="size-4 animate-spin" /> Connecting…</p>}

          {d.status === 'needsFile' && (
            <div className="space-y-2">
              <p className="text-sm text-ink-2">Connected. Where should the planner live?</p>
              <Button variant="primary" className="w-full" onClick={() => createFile()}>
                <FileJson className="size-4" /> Create the planner in my Drive
              </Button>
              <Button className="w-full" onClick={() => pickSharedFile()}>
                <Share2 className="size-4" /> Open a planner shared with me
              </Button>
              <p className="text-xs text-muted">Your partner creates it once and shares it with you; you then choose “Open a planner shared with me”.</p>
            </div>
          )}

          {d.file && d.status !== 'needsFile' && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">File</dt>
                <dd className="truncate">{d.file.name}{!d.file.ownedByMe && <span className="text-muted"> (shared with you)</span>}</dd>
                <dt className="text-muted">Status</dt>
                <dd className={cn(d.status === 'synced' && 'text-inc', d.status === 'expired' && 'text-ext', d.status === 'error' && 'text-na')}>
                  {d.status === 'synced' ? 'Up to date' : d.status === 'syncing' ? 'Syncing…' : d.status === 'expired' ? 'Needs a tap to reconnect' : d.status === 'error' ? 'Problem syncing' : d.status}
                </dd>
                {d.lastSync && (
                  <>
                    <dt className="text-muted">Last sync</dt>
                    <dd>
                      {new Date(d.lastSync).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      {d.lastEditor && <span className="text-muted"> · last edit by {d.lastEditor}</span>}
                    </dd>
                  </>
                )}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => tapSync()}>
                  <RefreshCw className="size-3.5" /> Sync now
                </Button>
                <Button size="sm" onClick={() => pickSharedFile()}>
                  Switch file
                </Button>
                <Button size="sm" variant="danger" onClick={() => window.confirm('Disconnect Google Drive on this device? Your data stays here and in Drive.') && disconnect()}>
                  Disconnect
                </Button>
              </div>
              {d.file.ownedByMe && <ShareBox />}
            </div>
          )}

          {d.message && <p className={cn('mt-3 text-xs', d.status === 'error' ? 'text-na' : 'text-ext')}>{d.message}</p>}
        </div>
      )}
    </section>
  );
}

function ShareBox() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [shared, setShared] = useState<string[]>([]);
  useEffect(() => {
    listSharedWith().then(setShared);
  }, [done]);
  return (
    <div className="rounded-xl bg-surface-2/60 p-3">
      <div className="mb-2 text-[13px] font-medium text-ink-2">Share with your partner</div>
      {shared.length > 0 && <p className="mb-2 text-xs text-muted">Shared with {shared.join(', ')}</p>}
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their Google email"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 focus:border-accent focus:outline-none"
        />
        <Button
          disabled={!/.+@.+\..+/.test(email) || busy}
          onClick={async () => {
            setBusy(true);
            const ok = await shareWith(email);
            setBusy(false);
            if (ok) {
              setDone(email);
              setEmail('');
            }
          }}
        >
          {busy ? 'Sharing…' : 'Share'}
        </Button>
      </div>
      {done && <p className="mt-2 text-xs text-inc">Shared with {done}. Google will email them a link.</p>}
      <p className="mt-2 text-xs text-muted">They can edit everything. On their phone: open this app → Settings → Connect Google Drive → “Open a planner shared with me”.</p>
    </div>
  );
}

function DriveSetup({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const cfg = getConfig();
  const [clientId, setClientId] = useState(cfg.clientId);
  const [apiKey, setApiKey] = useState(cfg.apiKey);
  const [projectNumber, setProjectNumber] = useState(cfg.projectNumber);
  const [guide, setGuide] = useState(!cfg.clientId);
  const valid = !clientId || clientId.trim().endsWith('.apps.googleusercontent.com');
  const origin = window.location.origin;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <button onClick={() => setGuide((g) => !g)} className="flex w-full items-center justify-between text-left text-sm font-medium" aria-expanded={guide}>
        How to set it up (one time, ~10 min)
        <ChevronDown className={cn('size-4 text-muted transition-transform', guide && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {guide && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="list-decimal space-y-1.5 overflow-hidden pl-5 text-[13px] leading-relaxed text-ink-2">
            <li>
              Open <span className="font-mono text-xs">console.cloud.google.com</span>. You can reuse the project from your workout tracker.
            </li>
            <li>Enable the <b>Google Drive API</b> and the <b>Google Picker API</b>.</li>
            <li>
              Create (or reuse) an <b>OAuth client ID</b> of type Web application. Under Authorised JavaScript origins add <span className="font-mono text-xs break-all">{origin}</span>.
            </li>
            <li>On the consent screen, add the <span className="font-mono text-xs">drive.file</span> scope. If the app is in Testing, add both your Google accounts as test users.</li>
            <li>
              For your partner to open the shared file: create an <b>API key</b> restricted to the Picker API, with website restrictions <span className="font-mono text-xs break-all">{origin}/*</span> and{' '}
              <span className="font-mono text-xs">https://docs.google.com/*</span>. Copy the <b>project number</b> from the project's settings page.
            </li>
            <li>Paste them below. They're stored only in this browser, so do this on each device.</li>
          </motion.ol>
        )}
      </AnimatePresence>
      <Field label="OAuth Client ID" hint={valid ? undefined : 'Should end in .apps.googleusercontent.com'}>
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono focus:border-accent focus:outline-none md:text-xs" />
      </Field>
      <p className="text-xs text-muted">The next two are only needed to open a planner someone shared with you.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="API key">
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono focus:border-accent focus:outline-none md:text-xs" />
        </Field>
        <Field label="Project number">
          <input value={projectNumber} inputMode="numeric" onChange={(e) => setProjectNumber(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono focus:border-accent focus:outline-none md:text-xs" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() => {
            saveConfig({ clientId, apiKey, projectNumber });
            onDone();
          }}
        >
          Save
        </Button>
        {canCancel && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Checklist ──────────────────────────────
function ChecklistEditor() {
  const doc = useDoc();
  const items = live(doc.items);
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <H>Venue checklist</H>
        <span className="flex items-center gap-1 text-sm text-muted">
          {items.length} items <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      <p className="text-sm text-ink-2">The items every venue is compared on. Rename, regroup or remove them to fit what you care about.</p>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-5">
              {GROUPS.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">{g.label}</div>
                  <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
                    {items
                      .filter((i) => i.group === g.id)
                      .map((i) => (
                        <div key={i.id} className="flex items-center gap-2 px-3 py-2">
                          <TextInput value={i.name} onCommit={(name) => name.trim() && patch('items', i.id, { name: name.trim() })} className="h-9 border-transparent bg-transparent px-1.5 hover:border-line" />
                          <Select
                            value={i.unit}
                            ariaLabel="Usually priced"
                            onChange={(unit: Unit) => patch('items', i.id, { unit })}
                            className="h-9 w-28 shrink-0 md:text-xs"
                            options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
                          />
                          <Select
                            value={i.group}
                            ariaLabel="Group"
                            onChange={(group: GroupId) => patch('items', i.id, { group })}
                            className="hidden h-9 w-32 shrink-0 sm:block md:text-xs"
                            options={GROUPS.map((x) => ({ value: x.id, label: x.label }))}
                          />
                          <button
                            aria-label={`Remove ${i.name}`}
                            onClick={() => window.confirm(`Remove "${i.name}" from the checklist? Anything entered for it at each venue is hidden too.`) && remove('items', i.id)}
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-na-bg hover:text-na"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    <button
                      onClick={() => upsert('items', { id: `item-${uid()}`, updatedAt: 0, name: 'New item', group: g.id, unit: 'flat', order: items.length })}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted hover:text-ink"
                    >
                      <Plus className="size-4" /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Backup ─────────────────────────────────
function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getDoc(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wedding-planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    try {
      const incoming = normalize(JSON.parse(await f.text()));
      replaceDoc(mergeDocs(getDoc(), incoming), true);
      setMsg('Imported and merged with what was here.');
      tapSync();
    } catch {
      setMsg('That file could not be read.');
    }
  };
  return (
    <section className="space-y-3">
      <H>Backup</H>
      <p className="text-sm text-ink-2">Download a copy of everything, or bring one back in. Importing merges with what's already here.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={exportJson}>
          <Download className="size-3.5" /> Download backup
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" /> Import backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </section>
  );
}
