// Every stored record carries an id and a last-edit time. Sync merges
// record by record (newest edit wins), and deletions are kept as
// tombstones so they propagate to the other device instead of reappearing.
export interface Rec {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

/** What a venue says about one item on the checklist. */
export type ItemStatus = 'unknown' | 'included' | 'extra' | 'unavailable';

/** How a price is quoted. */
export type Unit = 'flat' | 'perGuest' | 'perHour' | 'perItem';

/** Service tax on a price: none, a percentage, or a fixed amount. */
export type TaxMode = 'none' | 'percent' | 'amount';

export type GroupId = 'space' | 'food' | 'setup' | 'services' | 'extras';

export interface Venue extends Rec {
  name: string;
  location: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  capacity: number | null;
  rating: number | null; // 1–5, your gut feel after the visit
  visitDate: string;
  pros: string;
  cons: string;
  notes: string;
  deposit: string;
  paymentTerms: string;
  cancellation: string;
  order: number;
}

/** A line on the checklist every venue is compared against. */
export interface Item extends Rec {
  name: string;
  group: GroupId;
  unit: Unit;
  order: number;
}

/** One venue's answer for one checklist item. id = `${venueId}__${itemId}` */
export interface Offer extends Rec {
  venueId: string;
  itemId: string;
  status: ItemStatus;
  price: number | null;
  unit: Unit;
  qty: number | null; // hours or number of items, when the unit needs it
  taxMode: TaxMode;
  taxValue: number | null;
  note: string;
}

export interface WeddingDate extends Rec {
  date: string; // yyyy-mm-dd
  label: string;
}

export type AvailStatus = 'unknown' | 'available' | 'held' | 'unavailable' | 'booked';

/** id = `${venueId}__${dateId}` */
export interface Availability extends Rec {
  venueId: string;
  dateId: string;
  status: AvailStatus;
  holdUntil: string; // yyyy-mm-dd, when a provisional hold lapses
  note: string;
}

export type CostStatus = 'todo' | 'quoted' | 'booked' | 'paid';

export type CostCategory = 'attire' | 'vendors' | 'stationery' | 'other';

/** Wedding costs outside the venue: dress, suit, bracelets, hair & makeup… */
export interface Cost extends Rec {
  name: string;
  category: CostCategory;
  amount: number | null;
  taxMode: TaxMode;
  taxValue: number | null;
  status: CostStatus;
  paid: number | null;
  vendor: string;
  note: string;
  order: number;
}

export interface Settings extends Rec {
  id: 'settings';
  coupleNames: string;
  guests: number;
  currency: string;
  budget: number | null;
  chosenVenueId: string | null;
}

export interface Doc {
  schema: 1;
  venues: Venue[];
  items: Item[];
  offers: Offer[];
  dates: WeddingDate[];
  availability: Availability[];
  costs: Cost[];
  settings: Settings;
}

export type CollectionKey = 'venues' | 'items' | 'offers' | 'dates' | 'availability' | 'costs';
