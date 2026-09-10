import { create } from "zustand";

import { newId } from "@/db/ids";
import type { Driver, Profile, Truck } from "@/db/models";
import * as profileRepo from "@/db/repositories/profile";
import type { Currency, DistanceUnit, PayStructure, Role, WeekStart } from "@/earnings";

import { currentUserId } from "./auth";

/**
 * Profile, trucks and drivers.
 *
 * Role drives which fields, screens and metrics appear, and it must be
 * changeable later without data loss — nothing here deletes a row when the role
 * changes, it only changes what is shown.
 */

const LOCAL_USER_ID = "local-user";

/** The account id to own rows with. Falls back to a stable local id so the app
 * is fully usable before anyone signs in. */
export function ownerId(): string {
  return currentUserId() ?? LOCAL_USER_ID;
}

function emptyProfile(userId: string): Profile {
  return {
    userId,
    role: "owner_operator",
    displayName: null,
    companyName: null,
    currency: "USD",
    units: "mi",
    weekStart: "sunday",
    payStructure: null,
    accessorialPay: null,
    defaults: null,
    allocateFixedCosts: true,
    onboardingCompletedAt: null,
  };
}

interface ProfileState {
  profile: Profile | null;
  trucks: Truck[];
  drivers: Driver[];
  loading: boolean;

  load: () => Promise<void>;
  setRole: (role: Role) => Promise<void>;
  update: (patch: Partial<Profile>) => Promise<void>;
  setPayStructure: (structure: PayStructure | null) => Promise<void>;
  completeOnboarding: () => Promise<void>;

  saveTruck: (truck: Partial<Truck> & { id?: string }) => Promise<Truck>;
  removeTruck: (id: string) => Promise<void>;
  saveDriver: (driver: Partial<Driver> & { id?: string }) => Promise<Driver>;
  removeDriver: (id: string) => Promise<void>;
}

export const useProfile = create<ProfileState>((set, get) => ({
  profile: null,
  trucks: [],
  drivers: [],
  loading: true,

  async load() {
    const userId = ownerId();
    const [existing, trucks, drivers] = await Promise.all([
      profileRepo.getProfile(userId),
      profileRepo.listTrucks(),
      profileRepo.listDrivers(),
    ]);

    if (existing) {
      set({ profile: existing, trucks, drivers, loading: false });
      return;
    }

    const fresh = emptyProfile(userId);
    await profileRepo.saveProfile(fresh);
    set({ profile: fresh, trucks, drivers, loading: false });
  },

  async setRole(role) {
    await get().update({ role });
  },

  async update(patch) {
    const current = get().profile ?? emptyProfile(ownerId());
    const next = { ...current, ...patch };
    await profileRepo.saveProfile(next);
    set({ profile: next });
  },

  async setPayStructure(structure) {
    await get().update({ payStructure: structure });
  },

  async completeOnboarding() {
    await get().update({ onboardingCompletedAt: new Date().toISOString() });
  },

  async saveTruck(patch) {
    const owner = ownerId();
    const truck: Truck = {
      id: patch.id ?? newId(),
      ownerId: owner,
      unitNumber: patch.unitNumber ?? null,
      nickname: patch.nickname ?? null,
      make: patch.make ?? null,
      model: patch.model ?? null,
      year: patch.year ?? null,
      assignedDriverId: patch.assignedDriverId ?? null,
      heightM: patch.heightM ?? null,
      widthM: patch.widthM ?? null,
      lengthM: patch.lengthM ?? null,
      weightT: patch.weightT ?? null,
      axleLoadT: patch.axleLoadT ?? null,
      hazmat: patch.hazmat ?? false,
      avgMpg: patch.avgMpg ?? null,
      avgFuelPriceCents: patch.avgFuelPriceCents ?? null,
      isActive: patch.isActive ?? true,
    };
    await profileRepo.saveTruck(truck);
    set({ trucks: await profileRepo.listTrucks() });
    return truck;
  },

  async removeTruck(id) {
    await profileRepo.deleteTruck(id);
    set({ trucks: await profileRepo.listTrucks() });
  },

  async saveDriver(patch) {
    const driver: Driver = {
      id: patch.id ?? newId(),
      ownerId: ownerId(),
      authUserId: patch.authUserId ?? null,
      name: patch.name ?? "Driver",
      phone: patch.phone ?? null,
      email: patch.email ?? null,
      payStructure: patch.payStructure ?? null,
      accessorialPay: patch.accessorialPay ?? null,
      isActive: patch.isActive ?? true,
    };
    await profileRepo.saveDriver(driver);
    set({ drivers: await profileRepo.listDrivers() });
    return driver;
  },

  async removeDriver(id) {
    await profileRepo.deleteDriver(id);
    set({ drivers: await profileRepo.listDrivers() });
  },
}));

/* -------------------------------------------------------------------------- */
/* Role- and structure-derived UI decisions                                    */
/* -------------------------------------------------------------------------- */

export function isDriverRole(role: Role | undefined): boolean {
  return role === "company_driver";
}

export function isCarrierRole(role: Role | undefined): boolean {
  return role === "small_carrier";
}

/**
 * Whether the Shifts tab appears. Local, drayage and yard drivers work shifts
 * that do not map to loads; a per-mile OTR driver has no use for the tab.
 */
export function usesShifts(structure: PayStructure | null | undefined): boolean {
  if (!structure) return false;
  if (structure.kind === "hourly") return true;
  if (structure.kind === "hybrid") {
    return structure.primary.kind === "hourly" || structure.floor.kind === "hourly";
  }
  return false;
}

/**
 * Which metrics lead the dashboard.
 *
 * Never show RPM as the primary metric to a driver paid by the hour: hourly and
 * hybrid drivers get hours, effective hourly rate and overtime up front, with
 * mileage demoted. Per-mile and percentage drivers get the reverse.
 */
export function headlineMetrics(
  role: Role | undefined,
  structure: PayStructure | null | undefined,
): "hours" | "miles" | "revenue" {
  if (role !== "company_driver") return "revenue";
  return usesShifts(structure) ? "hours" : "miles";
}

export type { Currency, DistanceUnit, WeekStart };
