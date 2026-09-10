import type {
  AccessorialCode,
  AccountDefaults,
  Currency,
  DeductionCode,
  DistanceUnit,
  DriverAccessorialPay,
  LineItemKind,
  LoadInput,
  LoadStatus,
  PayStructure,
  RecurrenceFrequency,
  Role,
  ShiftInput,
  TrailerType,
  WeekStart,
} from "@/earnings";

/**
 * App-facing models. Camel-cased, with the JSON columns already parsed and the
 * SQLite integers already turned back into booleans.
 *
 * Load and Shift deliberately extend the earnings module's own input types, so
 * a row loaded from the database can be handed straight to the engine with no
 * adapter in between and no chance of the two drifting apart.
 */

export interface Profile {
  userId: string;
  role: Role;
  displayName: string | null;
  companyName: string | null;
  currency: Currency;
  units: DistanceUnit;
  weekStart: WeekStart;
  payStructure: PayStructure | null;
  accessorialPay: DriverAccessorialPay | null;
  /** Dispatch and factoring percentages that pre-fill new loads, per diem, authority. */
  defaults: AccountDefaults | null;
  allocateFixedCosts: boolean;
  onboardingCompletedAt: string | null;
}

export interface Truck {
  id: string;
  ownerId: string;
  unitNumber: string | null;
  nickname: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  assignedDriverId: string | null;
  heightM: number | null;
  widthM: number | null;
  lengthM: number | null;
  weightT: number | null;
  axleLoadT: number | null;
  hazmat: boolean;
  avgMpg: number | null;
  avgFuelPriceCents: number | null;
  isActive: boolean;
}

export interface Driver {
  id: string;
  ownerId: string;
  authUserId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  payStructure: PayStructure | null;
  accessorialPay: DriverAccessorialPay | null;
  isActive: boolean;
}

export type StopType = "pickup" | "dropoff" | "stop";
export type AppointmentType = "fcfs" | "scheduled";

export interface LoadStop {
  id: string;
  loadId: string;
  ownerId: string;
  sequence: number;
  type: StopType;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  appointmentAt: string | null;
  appointmentType: AppointmentType | null;
  reference: string | null;
  notes: string | null;
}

export interface LoadLineItemRow {
  id: string;
  loadId: string;
  ownerId: string;
  kind: LineItemKind;
  code: AccessorialCode | DeductionCode;
  label: string;
  amountCents: number | null;
  percentOfGross: number | null;
  sortOrder: number;
}

/** A load as the app holds it: the engine's input plus everything else on the row. */
export interface Load extends LoadInput {
  ownerId: string;
  loadNumber: string | null;
  broker: string | null;
  commodity: string | null;
  weightLbs: number | null;
  trailerType: TrailerType | null;
  status: LoadStatus;
  routeGeometry: string | null;
  routeProvider: string | null;
  routeComputedAt: string | null;
  currency: Currency;
  notes: string | null;
  stops: LoadStop[];
  createdAt: string;
  updatedAt: string;
}

export interface Shift extends ShiftInput {
  ownerId: string;
  notes: string | null;
  loadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategory {
  id: string;
  /** Null marks a system default: visible to everyone, editable by no one. */
  ownerId: string | null;
  parentId: string | null;
  name: string;
  icon: string;
  color: string;
  isFixed: boolean;
  sortOrder: number;
}

export interface Expense {
  id: string;
  ownerId: string;
  truckId: string | null;
  loadId: string | null;
  driverId: string | null;
  categoryId: string | null;
  amountCents: number;
  incurredOn: string;
  vendor: string | null;
  notes: string | null;
  receiptUrl: string | null;
  currency: Currency;
  recurrenceRule: RecurrenceFrequency;
  recurrenceStartOn: string | null;
  recurrenceEndOn: string | null;
  /** Set on rows the recurrence generator produced, so they can be flagged. */
  generatedFromId: string | null;
  isTemplate: boolean;
  skipped: boolean;
  fuel: FuelEntry | null;
}

export interface FuelEntry {
  expenseId: string;
  gallons: number;
  pricePerGallonCents: number | null;
  odometer: number | null;
  /** Two-letter state or province — this is what IFTA prep is built on. */
  state: string | null;
  isDef: boolean;
}

export type AttachmentKind = "rate_confirmation" | "bol" | "receipt" | "other";

export interface Attachment {
  id: string;
  ownerId: string;
  loadId: string | null;
  expenseId: string | null;
  kind: AttachmentKind;
  storagePath: string;
  /** Where the file sits on the device until the upload succeeds. */
  localUri: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploaded: boolean;
}

export const TRAILER_TYPES: { value: TrailerType; label: string }[] = [
  { value: "dry_van", label: "Dry van" },
  { value: "reefer", label: "Reefer" },
  { value: "flatbed", label: "Flatbed" },
  { value: "step_deck", label: "Step deck" },
  { value: "tanker", label: "Tanker" },
  { value: "power_only", label: "Power only" },
];

export const LOAD_STATUSES: { value: LoadStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
];

export const ACCESSORIAL_CODES: { value: AccessorialCode; label: string }[] = [
  { value: "detention", label: "Detention" },
  { value: "layover", label: "Layover" },
  { value: "tonu", label: "TONU" },
  { value: "lumper", label: "Lumper" },
  { value: "stop_off", label: "Stop-off pay" },
  { value: "fuel_surcharge", label: "Fuel surcharge" },
  { value: "tarp", label: "Tarp pay" },
  { value: "other", label: "Other" },
];

export const DEDUCTION_CODES: { value: DeductionCode; label: string }[] = [
  { value: "dispatch", label: "Dispatch fee" },
  { value: "factoring", label: "Factoring fee" },
  { value: "escrow", label: "Escrow" },
  { value: "insurance", label: "Insurance chargeback" },
  { value: "advance", label: "Advance / fuel advance fee" },
  { value: "trailer_rental", label: "Trailer rental" },
  { value: "other", label: "Other" },
];
