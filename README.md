# Il nostro matrimonio

Confronta le location voce per voce, segui quali date sono libere e tieni sotto controllo tutto il budget del matrimonio: abiti, braccialetti, trucco e parrucco e tutto il resto.

**App:** https://lrdgrizzly.github.io/wedding-planner/

## Cosa fa

- **Location**: una scheda per location. Per ogni voce della lista segni **Incluso**, **A pagamento** (prezzo, come si paga e IVA/servizio in % o importo fisso), **Non previsto** o **Da chiedere**. I prezzi vuoti restano vuoti: niente viene stimato.
- **Confronto**: tutte le location fianco a fianco, con il costo noto per il numero di invitati, i prezzi mancanti evidenziati, disponibilità e condizioni del contratto.
- **Date**: le date possibili × le location. Libera, in opzione (con la scadenza dell'opzione), occupata o prenotata. Le opzioni in scadenza compaiono nel Riepilogo.
- **Budget**: budget totale, location scelta e tutto il resto, con IVA/servizio, stato e importo già pagato.
- **Riepilogo**: "Possiamo permettercela?" — ogni location + tutto il resto rispetto al budget.

I prezzi a persona vengono moltiplicati per il numero di invitati nelle Impostazioni (65 di default).

## Dati e sincronizzazione

Tutto viene salvato prima nel browser, quindi funziona anche offline. Facoltativamente si sincronizza con un file `Organizzatore Matrimonio.json` su Google Drive, condivisibile con il partner, così modificate entrambi lo stesso file da qualsiasi dispositivo. La sincronizzazione è automatica (dopo ogni modifica, al ritorno nell'app, ogni minuto e quando cambi sezione). Dettagli in `src/lib/drive.ts`; la configurazione Google Cloud una tantum è spiegata nell'app in Impostazioni → Sincronizzazione Google Drive.

## Sviluppo

```bash
npm install
npm run dev
```

Per provare la sincronizzazione senza un account Google: in sviluppo, imposta `localStorage.wp_drive_mock = '1'` e ricarica (vedi `src/dev/driveMock.ts`; non entra mai nella build di produzione).

Ogni push su `main` pubblica su GitHub Pages tramite `.github/workflows/deploy.yml` (Settings → Pages → Source: **GitHub Actions**).

Realizzata con React, Tailwind CSS e [motion](https://motion.dev), con componenti di animazione adattati da [motion-primitives](https://github.com/ibelick/motion-primitives) (MIT).
