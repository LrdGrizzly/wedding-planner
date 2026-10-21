import type { CostCategory, Doc, GroupId, Item, Unit, Cost } from './types';

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'space', label: 'Location e spazi' },
  { id: 'food', label: 'Cibo e bevande' },
  { id: 'setup', label: 'Allestimento e decorazioni' },
  { id: 'services', label: 'Personale e servizi' },
  { id: 'extras', label: 'Extra e logistica' },
];

export const COST_CATEGORIES: { id: CostCategory; label: string }[] = [
  { id: 'attire', label: 'Abiti e bellezza' },
  { id: 'vendors', label: 'Fornitori' },
  { id: 'stationery', label: 'Inviti e bomboniere' },
  { id: 'other', label: 'Altro' },
];

// Names only (Italian UI): no prices are ever pre-filled.
const ITEMS: [string, GroupId, Unit][] = [
  ['Affitto location', 'space', 'flat'],
  ['Spazio per la cerimonia', 'space', 'flat'],
  ['Esclusiva della location', 'space', 'flat'],
  ['Ore extra', 'space', 'perHour'],
  ['Suite sposa / stanza per prepararsi', 'space', 'flat'],
  ['Spazio alternativo in caso di pioggia', 'space', 'flat'],
  ['Menù / catering', 'food', 'perGuest'],
  ['Aperitivo di benvenuto', 'food', 'perGuest'],
  ['Pacchetto bevande', 'food', 'perGuest'],
  ['Torta nuziale', 'food', 'flat'],
  ['Diritto di taglio torta', 'food', 'flat'],
  ['Diritto di tappo', 'food', 'flat'],
  ['Menù bambini', 'food', 'perItem'],
  ['Pasti fornitori / staff', 'food', 'perItem'],
  ['Tavoli e sedie', 'setup', 'flat'],
  ['Tovagliato', 'setup', 'flat'],
  ['Stoviglie e bicchieri', 'setup', 'flat'],
  ['Fiori e centrotavola', 'setup', 'flat'],
  ['Illuminazione', 'setup', 'flat'],
  ['Impianto audio / video', 'setup', 'flat'],
  ['Pista da ballo', 'setup', 'flat'],
  ['Musica / DJ', 'services', 'flat'],
  ['Coordinatore / wedding planner', 'services', 'flat'],
  ['Personale di sala', 'services', 'flat'],
  ['Pulizie', 'services', 'flat'],
  ['Sicurezza', 'services', 'flat'],
  ['Camere per la notte', 'extras', 'perItem'],
  ['Parcheggio', 'extras', 'flat'],
  ['Navetta per gli ospiti', 'extras', 'flat'],
];

const COSTS: [string, CostCategory][] = [
  ['Abito della sposa', 'attire'],
  ['Abito dello sposo', 'attire'],
  ['Trucco e parrucco sposa', 'attire'],
  ['Braccialetti damigelle', 'attire'],
  ['Fedi', 'attire'],
  ['Fotografo', 'vendors'],
  ['Videomaker', 'vendors'],
  ['Celebrante', 'vendors'],
  ['Partecipazioni', 'stationery'],
  ['Bomboniere', 'stationery'],
];

export function makeItem(name: string, group: GroupId, unit: Unit, order: number, id?: string): Item {
  return { id: id ?? `item-${order}-${Math.random().toString(36).slice(2, 7)}`, updatedAt: 0, name, group, unit, order };
}

export function makeCost(name: string, category: CostCategory, order: number, id?: string): Cost {
  return {
    id: id ?? `cost-${order}-${Math.random().toString(36).slice(2, 7)}`,
    updatedAt: 0,
    name,
    category,
    amount: null,
    taxMode: 'none',
    taxValue: null,
    status: 'todo',
    paid: null,
    vendor: '',
    note: '',
    order,
  };
}

// Seed ids are stable so two devices that start fresh don't each create
// their own copy of the checklist when they first sync.
export function emptyDoc(): Doc {
  return {
    schema: 1,
    venues: [],
    items: ITEMS.map(([n, g, u], i) => makeItem(n, g, u, i, `seed-item-${i}`)),
    offers: [],
    dates: [],
    availability: [],
    costs: COSTS.map(([n, c], i) => makeCost(n, c, i, `seed-cost-${i}`)),
    settings: {
      id: 'settings',
      updatedAt: 0,
      coupleNames: '',
      guests: 65,
      currency: 'EUR',
      budget: null,
      chosenVenueId: null,
    },
  };
}
