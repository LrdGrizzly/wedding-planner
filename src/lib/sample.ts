import { emptyDoc } from './defaults';
import type { Availability, AvailStatus, Cost, Doc, ItemStatus, Offer, TaxMode, Unit, Venue } from './types';

/* Example data for the test build: four invented locations, priced for 65
   guests, that differ in what they include so the comparison has something
   to show. Names, contacts and prices are made up. Item numbers follow the
   order of the default checklist in defaults.ts (0 = Affitto location …). */

type Row = [item: number, status: ItemStatus, price?: number | null, unit?: Unit, tax?: [TaxMode, number?], qty?: number, note?: string];

const pct = (n: number): [TaxMode, number] => ['percent', n];
const IVA22 = pct(22);
const IVA10 = pct(10);

const ex = (item: number, price: number | null, unit: Unit, tax: [TaxMode, number?], qty?: number, note?: string): Row => [item, 'extra', price, unit, tax, qty, note];
const inc = (item: number, note?: string): Row => [item, 'included', null, undefined, undefined, undefined, note];
const no = (item: number, note?: string): Row => [item, 'unavailable', null, undefined, undefined, undefined, note];

const VENUES: { v: Omit<Venue, 'id' | 'updatedAt' | 'order'>; rows: Row[]; avail: [dateIdx: number, status: AvailStatus, holdUntil?: string][] }[] = [
  {
    v: {
      name: 'Villa Aurora',
      location: 'Lago di Como',
      contactName: 'Giulia Ferri',
      phone: '+39 031 555 0142',
      email: 'eventi@villaaurora.example',
      website: 'villaaurora.example',
      capacity: 120,
      rating: 5,
      visitDate: '2026-09-14',
      pros: 'Terrazza sul lago al tramonto. Quasi tutto è nello stesso posto.',
      cons: 'Musica solo con il DJ della villa. Lontana per chi arriva in treno.',
      notes: '',
      deposit: '30% alla prenotazione',
      paymentTerms: 'Saldo 30 giorni prima',
      cancellation: 'Caparra non rimborsabile',
    },
    rows: [
      ex(0, 9000, 'flat', IVA22),
      inc(1),
      inc(2),
      ex(3, 400, 'perHour', IVA22),
      inc(4),
      inc(5, 'Salone interno per 120 persone'),
      ex(6, 135, 'perGuest', IVA10),
      ex(7, 25, 'perGuest', IVA10),
      ex(8, 40, 'perGuest', IVA10),
      ex(9, 450, 'flat', IVA10, undefined, 'Torta della pasticceria della villa'),
      inc(10),
      no(11, 'Solo vini della villa'),
      ex(12, 55, 'perItem', IVA10, 6),
      inc(14),
      inc(15),
      inc(16),
      ex(17, 2500, 'flat', IVA22),
      ex(18, 800, 'flat', IVA22),
      ex(19, 600, 'flat', IVA22),
      ex(20, 500, 'flat', IVA22),
      ex(21, 1800, 'flat', IVA22, undefined, 'Solo il DJ della villa'),
      ex(22, 1500, 'flat', IVA22),
      inc(23, 'Incluso nel menù'),
      inc(24),
      ex(26, 280, 'perItem', IVA10, 6, '8 camere disponibili'),
      inc(27),
      no(28),
    ],
    avail: [
      [0, 'unavailable'],
      [1, 'available'],
      [2, 'held', '2026-12-01'],
    ],
  },
  {
    v: {
      name: 'Cascina dei Fiori',
      location: 'Bergamo',
      contactName: 'Marco Beltrami',
      phone: '+39 035 555 0178',
      email: 'info@cascinadeifiori.example',
      website: 'cascinadeifiori.example',
      capacity: 80,
      rating: 4,
      visitDate: '2026-09-21',
      pros: 'Giardino bellissimo e molta libertà sul programma.',
      cons: 'Niente stanza per prepararsi. Fioristi solo della cascina.',
      notes: '',
      deposit: '2.000 € alla prenotazione',
      paymentTerms: 'Metà a 60 giorni, saldo il giorno prima',
      cancellation: 'Rimborso del 50% fino a 6 mesi prima',
    },
    rows: [
      ex(0, 4500, 'flat', IVA22),
      ex(1, 600, 'flat', IVA22),
      inc(2),
      ex(3, 250, 'perHour', IVA22, 3, 'Dopo la mezzanotte'),
      no(4),
      ex(5, 900, 'flat', IVA22, undefined, 'Tensostruttura nel giardino'),
      ex(6, 95, 'perGuest', IVA10),
      inc(7),
      ex(8, 28, 'perGuest', IVA10, undefined, 'Vino e birra, cocktail esclusi'),
      ex(10, 150, 'flat', IVA22),
      ex(11, 200, 'flat', IVA22),
      ex(12, 40, 'perItem', IVA10, 6),
      inc(13),
      ex(14, 700, 'flat', IVA22),
      ex(15, 450, 'flat', IVA22, undefined, 'Solo tovagliato bianco'),
      inc(16),
      no(17, 'Solo fioristi della cascina'),
      inc(18),
      ex(19, 350, 'flat', IVA22),
      no(20),
      ex(21, null, 'flat', IVA22, undefined, 'Preventivo in arrivo'),
      inc(22),
      ex(23, 1200, 'flat', IVA22),
      inc(24),
      no(26),
      inc(27),
      ex(28, 300, 'flat', IVA22),
    ],
    avail: [
      [0, 'held', '2026-10-28'],
      [1, 'available'],
      [2, 'unavailable'],
    ],
  },
  {
    v: {
      name: 'Palazzo Rosa',
      location: 'Milano',
      contactName: 'Chiara Longo',
      phone: '+39 02 555 0116',
      email: 'eventi@palazzorosa.example',
      website: 'palazzorosa.example',
      capacity: 60,
      rating: 3,
      visitDate: '2026-10-03',
      pros: 'Sala storica, comodissima per gli ospiti. Fiori di base inclusi.',
      cons: 'La capienza è sotto il numero dei nostri invitati. Si finisce all’una.',
      notes: '',
      deposit: '40% alla firma',
      paymentTerms: 'Saldo 15 giorni prima',
      cancellation: 'Nessun rimborso',
    },
    rows: [
      ex(0, 6000, 'flat', ['amount', 500], undefined, 'Servizio fisso di 500 €'),
      inc(1),
      ex(2, 1500, 'flat', IVA22, undefined, 'Altrimenti sala condivisa'),
      ex(3, 300, 'perHour', IVA22, 2),
      inc(4),
      no(5),
      ex(6, 110, 'perGuest', IVA10),
      ex(7, 30, 'perGuest', IVA10),
      ex(8, 45, 'perGuest', IVA10),
      ex(9, 380, 'flat', IVA10),
      inc(10),
      ex(11, 15, 'perGuest', IVA22),
      ex(12, 50, 'perItem', IVA10, 6),
      ex(13, 30, 'perItem', IVA10, 8),
      inc(14),
      inc(15),
      inc(16),
      inc(17, 'Allestimento floreale base incluso'),
      inc(18),
      ex(19, 500, 'flat', IVA22),
      no(20),
      ex(22, null, 'flat', IVA22, undefined, 'Da chiedere il listino'),
      inc(23),
      ex(24, 400, 'flat', IVA22),
      inc(25),
      no(26),
      no(27, 'Parcheggio pubblico a 300 m'),
      no(28),
    ],
    avail: [
      [0, 'available'],
      [1, 'unavailable'],
    ],
  },
  {
    v: {
      name: 'Masseria del Sole',
      location: 'Puglia',
      contactName: 'Antonio Greco',
      phone: '+39 080 555 0190',
      email: 'prenotazioni@masseriadelsole.example',
      website: 'masseriadelsole.example',
      capacity: 90,
      rating: 4,
      visitDate: '2026-10-10',
      pros: 'Pacchetto chiaro, navetta e camere sul posto.',
      cons: 'Il viaggio è lungo per molti ospiti.',
      notes: '',
      deposit: '25% alla prenotazione',
      paymentTerms: 'Tre rate, saldo 20 giorni prima',
      cancellation: 'Rimborso del 70% fino a 90 giorni prima',
    },
    rows: [
      ex(0, 5200, 'flat', IVA22),
      inc(1),
      inc(2),
      ex(3, 350, 'perHour', IVA22, 2),
      inc(4),
      inc(5, 'Sala interna in masseria'),
      ex(6, 110, 'perGuest', IVA10, undefined, 'Menù di cinque portate'),
      inc(7),
      inc(8),
      ex(9, 300, 'flat', IVA10),
      inc(10),
      inc(11),
      ex(12, 45, 'perItem', IVA10, 6),
      inc(13),
      inc(14),
      ex(15, 500, 'flat', IVA22),
      inc(16),
      ex(17, 1800, 'flat', IVA22),
      ex(18, 700, 'flat', IVA22),
      inc(19),
      inc(20),
      ex(21, 1200, 'flat', IVA22),
      inc(23),
      inc(24),
      ex(25, 600, 'flat', IVA22),
      ex(26, 150, 'perItem', IVA10, undefined, '10 camere in masseria'),
      inc(27),
      inc(28),
    ],
    avail: [
      [0, 'available'],
      [1, 'held', '2026-11-15'],
      [2, 'available'],
    ],
  },
];

const DATES: { date: string; label: string }[] = [
  { date: '2027-06-12', label: 'Prima scelta' },
  { date: '2027-06-19', label: 'Seconda scelta' },
  { date: '2027-09-11', label: 'Settembre' },
];

// [item index, price, status, tax %, paid]
const COSTS: [number, number | null, Cost['status'], number | null, number | null][] = [
  [0, 2200, 'booked', null, 700], // Abito della sposa
  [1, 850, 'quoted', null, null], // Abito dello sposo
  [2, 320, 'quoted', 22, null], // Trucco e parrucco sposa
  [3, 90, 'quoted', null, null], // Braccialetti damigelle
  [5, 1800, 'quoted', 22, null], // Fotografo
];

export function sampleDoc(): Doc {
  const doc = emptyDoc();
  const now = Date.now();

  doc.dates = DATES.map((d, i) => ({ id: `sample-d${i}`, updatedAt: now, date: d.date, label: d.label }));

  VENUES.forEach(({ v, rows, avail }, vi) => {
    const venueId = `sample-v${vi}`;
    doc.venues.push({ ...v, id: venueId, updatedAt: now, order: vi });

    for (const [item, status, price, unit, tax, qty, note] of rows) {
      const itemId = `seed-item-${item}`;
      const base = doc.items.find((i) => i.id === itemId)!;
      const offer: Offer = {
        id: `${venueId}__${itemId}`,
        updatedAt: now,
        venueId,
        itemId,
        status,
        price: price ?? null,
        unit: unit ?? base.unit,
        qty: qty ?? null,
        taxMode: tax?.[0] ?? 'none',
        taxValue: tax?.[1] ?? null,
        note: note ?? '',
      };
      doc.offers.push(offer);
    }

    for (const [di, status, holdUntil] of avail) {
      const dateId = `sample-d${di}`;
      const a: Availability = { id: `${venueId}__${dateId}`, updatedAt: now, venueId, dateId, status, holdUntil: holdUntil ?? '', note: '' };
      doc.availability.push(a);
    }
  });

  for (const [i, amount, status, tax, paid] of COSTS) {
    const c = doc.costs.find((x) => x.id === `seed-cost-${i}`)!;
    Object.assign(c, { amount, status, taxMode: tax ? 'percent' : 'none', taxValue: tax, paid, updatedAt: now });
  }

  doc.settings = { ...doc.settings, coupleNames: 'Ale e Je', budget: 32000, chosenVenueId: null, isSample: true, updatedAt: now };
  return doc;
}
