import type { CostCategory, Doc, GroupId, Item, Unit, Cost } from './types';

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'space', label: 'Venue & space' },
  { id: 'food', label: 'Food & drink' },
  { id: 'setup', label: 'Setup & decor' },
  { id: 'services', label: 'Staff & services' },
  { id: 'extras', label: 'Extras & logistics' },
];

export const COST_CATEGORIES: { id: CostCategory; label: string }[] = [
  { id: 'attire', label: 'Attire & beauty' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'stationery', label: 'Stationery & gifts' },
  { id: 'other', label: 'Other' },
];

// Names only: no prices are ever pre-filled.
const ITEMS: [string, GroupId, Unit][] = [
  ['Venue hire', 'space', 'flat'],
  ['Ceremony space', 'space', 'flat'],
  ['Exclusive use', 'space', 'flat'],
  ['Extra hours / overtime', 'space', 'perHour'],
  ['Bridal suite / getting-ready room', 'space', 'flat'],
  ['Rain backup space', 'space', 'flat'],
  ['Menu / catering', 'food', 'perGuest'],
  ['Welcome drinks / aperitivo', 'food', 'perGuest'],
  ['Drinks package', 'food', 'perGuest'],
  ['Wedding cake', 'food', 'flat'],
  ['Cake cutting fee', 'food', 'flat'],
  ['Corkage', 'food', 'flat'],
  ["Children's menu", 'food', 'perItem'],
  ['Vendor / staff meals', 'food', 'perItem'],
  ['Tables & chairs', 'setup', 'flat'],
  ['Linens', 'setup', 'flat'],
  ['Tableware & glassware', 'setup', 'flat'],
  ['Flowers & centrepieces', 'setup', 'flat'],
  ['Lighting', 'setup', 'flat'],
  ['Sound system / AV', 'setup', 'flat'],
  ['Dance floor', 'setup', 'flat'],
  ['Music / DJ', 'services', 'flat'],
  ['Wedding coordinator', 'services', 'flat'],
  ['Waiting staff', 'services', 'flat'],
  ['Cleaning', 'services', 'flat'],
  ['Security', 'services', 'flat'],
  ['Overnight rooms', 'extras', 'perItem'],
  ['Parking', 'extras', 'flat'],
  ['Guest shuttle', 'extras', 'flat'],
];

const COSTS: [string, CostCategory][] = [
  ["Bride's dress", 'attire'],
  ["Groom's suit", 'attire'],
  ["Bride's hair & makeup", 'attire'],
  ["Bridesmaids' bracelets", 'attire'],
  ['Rings', 'attire'],
  ['Photographer', 'vendors'],
  ['Videographer', 'vendors'],
  ['Officiant', 'vendors'],
  ['Invitations', 'stationery'],
  ['Favours', 'stationery'],
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
