import type {
  AccessorialCode,
  AccountDefaults,
  Currency,
  DeductionCode,
  DistanceUnit,
  DriverAccessorialPay,
  LineItemKind,
  LoadStatus,
  PayStructure,
  RecurrenceFrequency,
  Role,
  TrailerType,
  WeekStart,
} from "@/earnings";
import type {
  AppointmentType,
  Attachment,
  AttachmentKind,
  Driver,
  Expense,
  ExpenseCategory,
  FuelEntry,
  Load,
  LoadLineItemRow,
  LoadStop,
  Profile,
  Shift,
  StopType,
  Truck,
} from "./models";
import { fromBool, fromJson, toBool, toJson, toNumber, toText, type Row } from "./sqlite";

/**
 * Row-to-model mapping, in one place.
 *
 * Every mapper is total: a malformed or half-written row yields a usable model
 * with sensible defaults rather than throwing halfway through rendering a list.
 * A load with a corrupt pay structure should still show its gross.
 */

export function rowToProfile(row: Row): Profile {
  return {
    userId: String(row.user_id),
    role: (toText(row.role) ?? "owner_operator") as Role,
    displayName: toText(row.display_name),
    companyName: toText(row.company_name),
    currency: (toText(row.currency) ?? "USD") as Currency,
    units: (toText(row.units) ?? "mi") as DistanceUnit,
    weekStart: (toText(row.week_start) ?? "sunday") as WeekStart,
    payStructure: toJson<PayStructure | null>(row.pay_structure, null),
    accessorialPay: toJson<DriverAccessorialPay | null>(row.accessorial_pay, null),
    defaults: toJson<AccountDefaults | null>(row.defaults, null),
    allocateFixedCosts: toBool(row.allocate_fixed_costs),
    onboardingCompletedAt: toText(row.onboarding_completed_at),
  };
}

export function profileToRow(profile: Profile): Row {
  return {
    user_id: profile.userId,
    role: profile.role,
    display_name: profile.displayName,
    company_name: profile.companyName,
    currency: profile.currency,
    units: profile.units,
    week_start: profile.weekStart,
    pay_structure: fromJson(profile.payStructure),
    accessorial_pay: fromJson(profile.accessorialPay),
    defaults: fromJson(profile.defaults),
    allocate_fixed_costs: fromBool(profile.allocateFixedCosts),
    onboarding_completed_at: profile.onboardingCompletedAt,
  };
}

export function rowToTruck(row: Row): Truck {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    unitNumber: toText(row.unit_number),
    nickname: toText(row.nickname),
    make: toText(row.make),
    model: toText(row.model),
    year: toNumber(row.year),
    assignedDriverId: toText(row.assigned_driver_id),
    heightM: toNumber(row.height_m),
    widthM: toNumber(row.width_m),
    lengthM: toNumber(row.length_m),
    weightT: toNumber(row.weight_t),
    axleLoadT: toNumber(row.axle_load_t),
    hazmat: toBool(row.hazmat),
    avgMpg: toNumber(row.avg_mpg),
    avgFuelPriceCents: toNumber(row.avg_fuel_price_cents),
    isActive: toBool(row.is_active),
  };
}

export function truckToRow(truck: Truck): Row {
  return {
    id: truck.id,
    owner_id: truck.ownerId,
    unit_number: truck.unitNumber,
    nickname: truck.nickname,
    make: truck.make,
    model: truck.model,
    year: truck.year,
    assigned_driver_id: truck.assignedDriverId,
    height_m: truck.heightM,
    width_m: truck.widthM,
    length_m: truck.lengthM,
    weight_t: truck.weightT,
    axle_load_t: truck.axleLoadT,
    hazmat: fromBool(truck.hazmat),
    avg_mpg: truck.avgMpg,
    avg_fuel_price_cents: truck.avgFuelPriceCents,
    is_active: fromBool(truck.isActive),
  };
}

export function rowToDriver(row: Row): Driver {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    authUserId: toText(row.auth_user_id),
    name: toText(row.name) ?? "Driver",
    phone: toText(row.phone),
    email: toText(row.email),
    payStructure: toJson<PayStructure | null>(row.pay_structure, null),
    accessorialPay: toJson<DriverAccessorialPay | null>(row.accessorial_pay, null),
    isActive: toBool(row.is_active),
  };
}

export function driverToRow(driver: Driver): Row {
  return {
    id: driver.id,
    owner_id: driver.ownerId,
    auth_user_id: driver.authUserId,
    name: driver.name,
    phone: driver.phone,
    email: driver.email,
    pay_structure: fromJson(driver.payStructure),
    accessorial_pay: fromJson(driver.accessorialPay),
    is_active: fromBool(driver.isActive),
  };
}

export function rowToStop(row: Row): LoadStop {
  return {
    id: String(row.id),
    loadId: String(row.load_id),
    ownerId: String(row.owner_id),
    sequence: toNumber(row.sequence) ?? 0,
    type: (toText(row.type) ?? "stop") as StopType,
    name: toText(row.name),
    address: toText(row.address),
    city: toText(row.city),
    state: toText(row.state),
    postalCode: toText(row.postal_code),
    country: toText(row.country),
    lat: toNumber(row.lat),
    lng: toNumber(row.lng),
    appointmentAt: toText(row.appointment_at),
    appointmentType: toText(row.appointment_type) as AppointmentType | null,
    reference: toText(row.reference),
    notes: toText(row.notes),
  };
}

export function stopToRow(stop: LoadStop): Row {
  return {
    id: stop.id,
    load_id: stop.loadId,
    owner_id: stop.ownerId,
    sequence: stop.sequence,
    type: stop.type,
    name: stop.name,
    address: stop.address,
    city: stop.city,
    state: stop.state,
    postal_code: stop.postalCode,
    country: stop.country,
    lat: stop.lat,
    lng: stop.lng,
    appointment_at: stop.appointmentAt,
    appointment_type: stop.appointmentType,
    reference: stop.reference,
    notes: stop.notes,
  };
}

export function rowToLineItem(row: Row): LoadLineItemRow {
  return {
    id: String(row.id),
    loadId: String(row.load_id),
    ownerId: String(row.owner_id),
    kind: (toText(row.kind) ?? "accessorial") as LineItemKind,
    code: (toText(row.code) ?? "other") as AccessorialCode | DeductionCode,
    label: toText(row.label) ?? "Line item",
    amountCents: toNumber(row.amount_cents),
    percentOfGross: toNumber(row.percent_of_gross),
    sortOrder: toNumber(row.sort_order) ?? 0,
  };
}

export function lineItemToRow(item: LoadLineItemRow): Row {
  return {
    id: item.id,
    load_id: item.loadId,
    owner_id: item.ownerId,
    kind: item.kind,
    code: item.code,
    label: item.label,
    amount_cents: item.amountCents,
    // An accessorial priced off gross would be self-referential, so the
    // percentage is dropped rather than stored and silently ignored later.
    percent_of_gross: item.kind === "deduction" ? item.percentOfGross : null,
    sort_order: item.sortOrder,
  };
}

export function rowToLoad(
  row: Row,
  lineItems: LoadLineItemRow[] = [],
  stops: LoadStop[] = [],
  loadExpensesCents = 0,
): Load {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    truckId: toText(row.truck_id),
    driverId: toText(row.driver_id),
    loadNumber: toText(row.load_number),
    broker: toText(row.broker),
    commodity: toText(row.commodity),
    weightLbs: toNumber(row.weight_lbs),
    trailerType: toText(row.trailer_type) as TrailerType | null,
    status: (toText(row.status) ?? "booked") as LoadStatus,
    linehaulCents: toNumber(row.linehaul_cents) ?? 0,
    lineItems,
    loadedMiles: toNumber(row.loaded_miles) ?? 0,
    deadheadMiles: toNumber(row.deadhead_miles) ?? 0,
    paidMiles: toNumber(row.paid_miles),
    startedAt: toText(row.started_at),
    endedAt: toText(row.ended_at),
    hours: {
      worked: toNumber(row.hours_worked),
      driving: toNumber(row.driving_hours),
      loading: toNumber(row.loading_hours),
      waiting: toNumber(row.waiting_hours),
      unpaidBreak: toNumber(row.unpaid_break_hours),
    },
    // A load with no stops recorded is still a pickup and a drop.
    stopCount: Math.max(2, stops.length),
    loadExpensesCents,
    routeGeometry: toText(row.route_geometry),
    routeProvider: toText(row.route_provider),
    routeComputedAt: toText(row.route_computed_at),
    currency: (toText(row.currency) ?? "USD") as Currency,
    notes: toText(row.notes),
    stops,
    createdAt: toText(row.created_at) ?? new Date().toISOString(),
    updatedAt: toText(row.updated_at) ?? new Date().toISOString(),
  };
}

export function loadToRow(load: Load): Row {
  return {
    id: load.id,
    owner_id: load.ownerId,
    truck_id: load.truckId,
    driver_id: load.driverId,
    load_number: load.loadNumber,
    broker: load.broker,
    commodity: load.commodity,
    weight_lbs: load.weightLbs,
    trailer_type: load.trailerType,
    status: load.status,
    linehaul_cents: load.linehaulCents,
    loaded_miles: load.loadedMiles,
    deadhead_miles: load.deadheadMiles,
    paid_miles: load.paidMiles,
    started_at: load.startedAt,
    ended_at: load.endedAt,
    hours_worked: load.hours.worked,
    driving_hours: load.hours.driving,
    loading_hours: load.hours.loading,
    waiting_hours: load.hours.waiting,
    unpaid_break_hours: load.hours.unpaidBreak,
    route_geometry: load.routeGeometry,
    route_provider: load.routeProvider,
    route_computed_at: load.routeComputedAt,
    currency: load.currency,
    notes: load.notes,
  };
}

export function rowToShift(row: Row, loadIds: string[] = []): Shift {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    driverId: toText(row.driver_id),
    truckId: toText(row.truck_id),
    workDate: toText(row.work_date) ?? new Date().toISOString().slice(0, 10),
    startAt: toText(row.start_at),
    endAt: toText(row.end_at),
    unpaidBreakHours: toNumber(row.unpaid_break_hours) ?? 0,
    hoursWorked: toNumber(row.hours_worked),
    notes: toText(row.notes),
    loadIds,
    createdAt: toText(row.created_at) ?? new Date().toISOString(),
    updatedAt: toText(row.updated_at) ?? new Date().toISOString(),
  };
}

export function shiftToRow(shift: Shift): Row {
  return {
    id: shift.id,
    owner_id: shift.ownerId,
    driver_id: shift.driverId,
    truck_id: shift.truckId,
    work_date: shift.workDate,
    start_at: shift.startAt,
    end_at: shift.endAt,
    unpaid_break_hours: shift.unpaidBreakHours,
    hours_worked: shift.hoursWorked,
    notes: shift.notes,
  };
}

export function rowToCategory(row: Row): ExpenseCategory {
  return {
    id: String(row.id),
    ownerId: toText(row.owner_id),
    parentId: toText(row.parent_id),
    name: toText(row.name) ?? "Category",
    icon: toText(row.icon) ?? "ellipse-outline",
    color: toText(row.color) ?? "#7C8B99",
    isFixed: toBool(row.is_fixed),
    sortOrder: toNumber(row.sort_order) ?? 100,
  };
}

export function categoryToRow(category: ExpenseCategory): Row {
  return {
    id: category.id,
    owner_id: category.ownerId,
    parent_id: category.parentId,
    name: category.name,
    icon: category.icon,
    color: category.color,
    is_fixed: fromBool(category.isFixed),
    sort_order: category.sortOrder,
  };
}

export function rowToExpense(row: Row, fuel: FuelEntry | null = null): Expense {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    truckId: toText(row.truck_id),
    loadId: toText(row.load_id),
    driverId: toText(row.driver_id),
    categoryId: toText(row.category_id),
    amountCents: toNumber(row.amount_cents) ?? 0,
    incurredOn: toText(row.incurred_on) ?? new Date().toISOString().slice(0, 10),
    vendor: toText(row.vendor),
    notes: toText(row.notes),
    receiptUrl: toText(row.receipt_url),
    currency: (toText(row.currency) ?? "USD") as Currency,
    recurrenceRule: (toText(row.recurrence_rule) ?? "none") as RecurrenceFrequency,
    recurrenceStartOn: toText(row.recurrence_start_on),
    recurrenceEndOn: toText(row.recurrence_end_on),
    generatedFromId: toText(row.generated_from_id),
    isTemplate: toBool(row.is_template),
    skipped: toBool(row.skipped),
    fuel,
  };
}

export function expenseToRow(expense: Expense): Row {
  return {
    id: expense.id,
    owner_id: expense.ownerId,
    truck_id: expense.truckId,
    load_id: expense.loadId,
    driver_id: expense.driverId,
    category_id: expense.categoryId,
    amount_cents: expense.amountCents,
    incurred_on: expense.incurredOn,
    vendor: expense.vendor,
    notes: expense.notes,
    receipt_url: expense.receiptUrl,
    currency: expense.currency,
    recurrence_rule: expense.recurrenceRule,
    recurrence_start_on: expense.recurrenceStartOn,
    recurrence_end_on: expense.recurrenceEndOn,
    generated_from_id: expense.generatedFromId,
    is_template: fromBool(expense.isTemplate),
    skipped: fromBool(expense.skipped),
  };
}

export function rowToFuel(row: Row): FuelEntry {
  return {
    expenseId: String(row.expense_id),
    gallons: toNumber(row.gallons) ?? 0,
    pricePerGallonCents: toNumber(row.price_per_gallon_cents),
    odometer: toNumber(row.odometer),
    state: toText(row.state),
    isDef: toBool(row.is_def),
  };
}

export function fuelToRow(fuel: FuelEntry, ownerId: string): Row {
  return {
    expense_id: fuel.expenseId,
    owner_id: ownerId,
    gallons: fuel.gallons,
    price_per_gallon_cents: fuel.pricePerGallonCents,
    odometer: fuel.odometer,
    state: fuel.state,
    is_def: fromBool(fuel.isDef),
  };
}

export function rowToAttachment(row: Row): Attachment {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    loadId: toText(row.load_id),
    expenseId: toText(row.expense_id),
    kind: (toText(row.kind) ?? "other") as AttachmentKind,
    storagePath: toText(row.storage_path) ?? "",
    localUri: toText(row.local_uri),
    fileName: toText(row.file_name),
    mimeType: toText(row.mime_type),
    sizeBytes: toNumber(row.size_bytes),
    uploaded: toBool(row.uploaded),
  };
}

export function attachmentToRow(attachment: Attachment): Row {
  return {
    id: attachment.id,
    owner_id: attachment.ownerId,
    load_id: attachment.loadId,
    expense_id: attachment.expenseId,
    kind: attachment.kind,
    storage_path: attachment.storagePath,
    local_uri: attachment.localUri,
    file_name: attachment.fileName,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes,
    uploaded: fromBool(attachment.uploaded),
  };
}
