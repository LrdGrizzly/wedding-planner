import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cloud, Download, FileJson, Plus, RefreshCw, Share2, Trash2, Upload, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AmountInput, Button, Field, Select, Sheet, TextInput, confirmAction } from '@/components/ui';
import { UNIT_LABEL } from '@/lib/calc';
import { GROUPS } from '@/lib/defaults';
import { LOCALE } from '@/lib/format';
import { connect, createFile, disconnect, getConfig, listSharedWith, pickSharedFile, saveConfig, shareWith, tapSync, type DriveStatus } from '@/lib/drive';
import { getDoc, live, mergeDocs, normalize, patch, remove, replaceDoc, setSettings, upsert, useDoc } from '@/lib/store';
import type { GroupId, Unit } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import { useDrive } from '@/App';
import { SYNC_ENABLED } from '@/lib/flags';

const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'AUD', 'CAD', 'SEK', 'DKK', 'NOK', 'PLN'];

const STATUS_TEXT: Partial<Record<DriveStatus, string>> = {
  synced: 'Aggiornato',
  syncing: 'Sincronizzo…',
  expired: 'Serve un tocco per riconnettersi',
  offline: 'Offline: sincronizzerà appena torni online',
  error: 'Problema di sincronizzazione, riprovo da solo',
};

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useDoc();
  const s = doc.settings;
  return (
    <Sheet open={open} onClose={onClose} title="Impostazioni">
      <div className="space-y-9">
        <section className="space-y-3">
          <H>Il vostro matrimonio</H>
          <Field label="Nomi">
            <TextInput value={s.coupleNames} onCommit={(coupleNames) => setSettings({ coupleNames })} placeholder="es. Ale e Je" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invitati" hint="I prezzi a persona vengono moltiplicati per questo numero">
              <AmountInput value={s.guests} onCommit={(g) => setSettings({ guests: Math.max(0, Math.round(g ?? 0)) })} />
            </Field>
            <Field label="Valuta">
              <Select value={s.currency} onChange={(currency) => setSettings({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
          </div>
          <Field label="Budget totale">
            <AmountInput value={s.budget} currency={s.currency} onCommit={(budget) => setSettings({ budget })} placeholder="Inserisci il budget" />
          </Field>
        </section>

        {SYNC_ENABLED && <DriveSection />}

        <ChecklistEditor />

        <BackupSection />

        <p className="text-center text-xs text-muted">
          Salvato su questo dispositivo{SYNC_ENABLED && getConfig().clientId ? ' e su Google Drive' : ''}
          {!SYNC_ENABLED && ' · versione di prova senza sincronizzazione'}
        </p>
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
  const editor = d.lastEditor === 'me' ? 'te' : d.lastEditor;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <H>Sincronizzazione Google Drive</H>
        {configured && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
            Modifica configurazione
          </button>
        )}
      </div>
      <p className="text-sm text-ink-2">
        Salva tutto in un file sul vostro Google Drive, così potete usarlo entrambi da qualsiasi telefono o computer. Funziona anche offline e si sincronizza da solo: mentre modificate, quando tornate nell'app, ogni minuto in
        background e quando cambiate sezione.
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
              <Cloud className="size-4" /> Collega Google Drive
            </Button>
          )}

          {d.status === 'connecting' && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <RefreshCw className="size-4 animate-spin" /> Collegamento…
            </p>
          )}

          {d.status === 'needsFile' && (
            <div className="space-y-2">
              <p className="text-sm text-ink-2">Collegato. Dove salviamo i dati?</p>
              <Button variant="primary" className="w-full" onClick={() => createFile()}>
                <FileJson className="size-4" /> Crea il file nel mio Drive
              </Button>
              <Button className="w-full" onClick={() => pickSharedFile()}>
                <Share2 className="size-4" /> Apri un file condiviso con me
              </Button>
              <p className="text-xs text-muted">Uno di voi crea il file e lo condivide con l'altro, che poi sceglie “Apri un file condiviso con me”.</p>
            </div>
          )}

          {d.file && d.status !== 'needsFile' && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">File</dt>
                <dd className="truncate">
                  {d.file.name}
                  {!d.file.ownedByMe && <span className="text-muted"> (condiviso con te)</span>}
                </dd>
                <dt className="text-muted">Stato</dt>
                <dd className={cn(d.status === 'synced' && 'text-inc', (d.status === 'expired' || d.status === 'offline') && 'text-ext', d.status === 'error' && 'text-na')}>
                  {STATUS_TEXT[d.status] ?? d.status}
                </dd>
                {d.lastSync && (
                  <>
                    <dt className="text-muted">Ultima sincr.</dt>
                    <dd>
                      {new Date(d.lastSync).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}
                      {editor && <span className="text-muted"> · ultima modifica di {editor}</span>}
                    </dd>
                  </>
                )}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => tapSync()}>
                  <RefreshCw className="size-3.5" /> Sincronizza ora
                </Button>
                <Button size="sm" onClick={() => pickSharedFile()}>
                  Cambia file
                </Button>
                <Button size="sm" variant="danger" onClick={() => confirmAction('Scollegare Google Drive su questo dispositivo? I dati restano qui e su Drive.', 'Scollega').then((ok) => ok && disconnect())}>
                  Scollega
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
      <div className="mb-2 text-[13px] font-medium text-ink-2">Condividi con il tuo partner</div>
      {shared.length > 0 && <p className="mb-2 text-xs text-muted">Condiviso con {shared.join(', ')}</p>}
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="la sua email Google"
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
          {busy ? 'Condivido…' : 'Condividi'}
        </Button>
      </div>
      {done && <p className="mt-2 text-xs text-inc">Condiviso con {done}. Google invierà un'email con il link.</p>}
      <p className="mt-2 text-xs text-muted">Potrà modificare tutto. Sul suo telefono: apri l'app → Impostazioni → Collega Google Drive → “Apri un file condiviso con me”.</p>
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
        Come configurarlo (una volta sola, ~10 min)
        <ChevronDown className={cn('size-4 text-muted transition-transform', guide && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {guide && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="list-decimal space-y-1.5 overflow-hidden pl-5 text-[13px] leading-relaxed text-ink-2"
          >
            <li>
              Apri <span className="font-mono text-xs">console.cloud.google.com</span>. Puoi riusare il progetto del workout tracker.
            </li>
            <li>
              Abilita la <b>Google Drive API</b> e la <b>Google Picker API</b>.
            </li>
            <li>
              Crea (o riusa) un <b>ID client OAuth</b> di tipo Applicazione web. In Origini JavaScript autorizzate aggiungi <span className="font-mono text-xs break-all">{origin}</span>.
            </li>
            <li>
              Nella schermata di consenso aggiungi l'ambito <span className="font-mono text-xs">drive.file</span>. Se l'app è in Test, aggiungi entrambi i vostri account Google come utenti di test.
            </li>
            <li>
              Perché il partner possa aprire il file condiviso: crea una <b>chiave API</b> limitata alla Picker API, con restrizioni ai siti web <span className="font-mono text-xs break-all">{origin}/*</span> e{' '}
              <span className="font-mono text-xs">https://docs.google.com/*</span>. Copia il <b>numero del progetto</b> dalle impostazioni del progetto.
            </li>
            <li>Incollali qui sotto. Restano solo in questo browser, quindi ripeti su ogni dispositivo.</li>
          </motion.ol>
        )}
      </AnimatePresence>
      <Field label="ID client OAuth" hint={valid ? undefined : 'Deve finire con .apps.googleusercontent.com'}>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxx.apps.googleusercontent.com"
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono focus:border-accent focus:outline-none md:text-xs"
        />
      </Field>
      <p className="text-xs text-muted">I due campi seguenti servono solo per aprire un file che qualcuno ha condiviso con te.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Chiave API">
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono focus:border-accent focus:outline-none md:text-xs" />
        </Field>
        <Field label="Numero progetto">
          <input
            value={projectNumber}
            inputMode="numeric"
            onChange={(e) => setProjectNumber(e.target.value)}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono focus:border-accent focus:outline-none md:text-xs"
          />
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
          Salva
        </Button>
        {canCancel && (
          <Button variant="ghost" onClick={onDone}>
            Annulla
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
        <H>Voci da confrontare</H>
        <span className="flex items-center gap-1 text-sm text-muted">
          {items.length} voci <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      <p className="text-sm text-ink-2">Le voci su cui viene confrontata ogni location. Rinominale, spostale di gruppo o eliminale in base a ciò che conta per voi.</p>
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
                            ariaLabel="Di solito si paga"
                            onChange={(unit: Unit) => patch('items', i.id, { unit })}
                            className="h-9 w-28 shrink-0 md:text-xs"
                            options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
                          />
                          <Select
                            value={i.group}
                            ariaLabel="Gruppo"
                            onChange={(group: GroupId) => patch('items', i.id, { group })}
                            className="hidden h-9 w-32 shrink-0 sm:block md:text-xs"
                            options={GROUPS.map((x) => ({ value: x.id, label: x.label }))}
                          />
                          <button
                            aria-label={`Elimina ${i.name}`}
                            onClick={() => confirmAction(`Eliminare "${i.name}" dalla lista? Anche quanto inserito per ogni location verrà nascosto.`).then((ok) => ok && remove('items', i.id))}
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-na-bg hover:text-na"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    <button
                      onClick={() => upsert('items', { id: `item-${uid()}`, updatedAt: 0, name: 'Nuova voce', group: g.id, unit: 'flat', order: items.length })}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted hover:text-ink"
                    >
                      <Plus className="size-4" /> Aggiungi
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
    if (!SYNC_ENABLED) {
      // The test build runs where downloads are blocked: copy instead
      const text = JSON.stringify(getDoc(), null, 2);
      navigator.clipboard
        .writeText(text)
        .then(() => setMsg('Backup copiato negli appunti. Incollalo in un file di testo per conservarlo.'))
        .catch(() => setMsg('Impossibile copiare negli appunti su questo dispositivo.'));
      return;
    }
    const blob = new Blob([JSON.stringify(getDoc(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `matrimonio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    try {
      const incoming = normalize(JSON.parse(await f.text()));
      replaceDoc(mergeDocs(getDoc(), incoming), true);
      setMsg('Importato e unito ai dati già presenti.');
      tapSync();
    } catch {
      setMsg('Impossibile leggere il file.');
    }
  };
  return (
    <section className="space-y-3">
      <H>Backup</H>
      <p className="text-sm text-ink-2">Scarica una copia di tutto o ripristinane una. L'importazione si unisce a ciò che c'è già.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={exportJson}>
          <Download className="size-3.5" /> {SYNC_ENABLED ? 'Scarica backup' : 'Copia backup'}
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" /> Importa backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </section>
  );
}
