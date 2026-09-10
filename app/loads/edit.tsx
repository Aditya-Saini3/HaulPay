import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { routeAdapter, routingIsEstimated, type Position } from "@/adapters";
import { newId } from "@/db/ids";
import {
  ACCESSORIAL_CODES,
  DEDUCTION_CODES,
  LOAD_STATUSES,
  TRAILER_TYPES,
  type Load,
  type LoadLineItemRow,
  type LoadStop,
} from "@/db/models";
import * as expensesRepo from "@/db/repositories/expenses";
import * as loadsRepo from "@/db/repositories/loads";
import {
  checkBreakeven,
  computeLoad,
  dailyFixedCostCents,
  formatHours,
  formatMoney,
  formatRate,
  hoursBetween,
  metersToMiles,
  monthlyEquivalentCents,
  type AccessorialCode,
  type DeductionCode,
  type LoadStatus,
  type TrailerType,
} from "@/earnings";
import { haversineMiles } from "@/adapters";
import { useData } from "@/store/data";
import { ownerId, useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  AddressField,
  Banner,
  BottomBar,
  Button,
  Card,
  DateTimeField,
  DetailRow,
  DraggableList,
  EMPTY_ADDRESS,
  MoneyField,
  NumberField,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Select,
  Sheet,
  TextField,
  Toggle,
  Txt,
  addressLabel,
  toLocalIso,
  type AddressValue,
} from "@/ui";
import { usesShifts } from "@/store/profile";

/**
 * The load form.
 *
 * A driver fills this in a truck stop parking lot, not at a desk, so it is one
 * screen with everything in reach and nothing gated behind a wizard. The
 * target is under sixty seconds.
 */

interface StopDraft {
  id: string;
  type: "pickup" | "dropoff" | "stop";
  address: AddressValue;
  appointmentAt: string | null;
  appointmentType: "fcfs" | "scheduled" | null;
  reference: string | null;
  notes: string | null;
}

interface LineDraft {
  id: string;
  kind: "accessorial" | "deduction";
  code: AccessorialCode | DeductionCode;
  label: string;
  amountCents: number | null;
  percentOfGross: number | null;
}

export default function LoadEditor() {
  const { colors, space } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = useProfile((s) => s.profile);
  const trucks = useProfile((s) => s.trucks);
  const drivers = useProfile((s) => s.drivers);
  const refresh = useData((s) => s.refresh);

  const currency = profile?.currency ?? "USD";
  const units = profile?.units ?? "mi";
  const isDriver = profile?.role === "company_driver";
  const hourlyDriver = isDriver && usesShifts(profile?.payStructure);

  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [loadNumber, setLoadNumber] = useState("");
  const [broker, setBroker] = useState("");
  const [commodity, setCommodity] = useState("");
  const [weightLbs, setWeightLbs] = useState<number | null>(null);
  const [trailerType, setTrailerType] = useState<TrailerType | null>(null);
  const [status, setStatus] = useState<LoadStatus>("booked");
  const [truckId, setTruckId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [linehaulCents, setLinehaulCents] = useState<number | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [addingLine, setAddingLine] = useState<"accessorial" | "deduction" | null>(null);

  const [loadedMiles, setLoadedMiles] = useState<number | null>(null);
  const [deadheadMiles, setDeadheadMiles] = useState<number | null>(null);
  const [paidMiles, setPaidMiles] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<string | null>(null);

  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [hoursWorked, setHoursWorked] = useState<number | null>(null);
  const [drivingHours, setDrivingHours] = useState<number | null>(null);
  const [loadingHours, setLoadingHours] = useState<number | null>(null);
  const [waitingHours, setWaitingHours] = useState<number | null>(null);
  const [breakHours, setBreakHours] = useState<number | null>(null);
  // Hourly and hybrid drivers need this open; everyone else gets it collapsed,
  // because knowing your effective hourly rate on a bad load is the whole point.
  const [timeOpen, setTimeOpen] = useState(hourlyDriver);

  const [stops, setStops] = useState<StopDraft[]>([
    { id: newId(), type: "pickup", address: EMPTY_ADDRESS, appointmentAt: null, appointmentType: null, reference: null, notes: null },
    { id: newId(), type: "dropoff", address: EMPTY_ADDRESS, appointmentAt: null, appointmentType: null, reference: null, notes: null },
  ]);

  const [monthlyFixedCents, setMonthlyFixedCents] = useState(0);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  /* ------------------------------------------------------------------ load */

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const existing = await loadsRepo.getLoad(id);
      if (!existing) {
        setLoading(false);
        return;
      }
      setLoadNumber(existing.loadNumber ?? "");
      setBroker(existing.broker ?? "");
      setCommodity(existing.commodity ?? "");
      setWeightLbs(existing.weightLbs);
      setTrailerType(existing.trailerType);
      setStatus(existing.status);
      setTruckId(existing.truckId);
      setDriverId(existing.driverId);
      setNotes(existing.notes ?? "");
      setLinehaulCents(existing.linehaulCents);
      setLines(
        existing.lineItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          code: item.code,
          label: item.label,
          amountCents: item.amountCents,
          percentOfGross: item.percentOfGross,
        })),
      );
      setLoadedMiles(existing.loadedMiles);
      setDeadheadMiles(existing.deadheadMiles);
      setPaidMiles(existing.paidMiles);
      setRouteGeometry(existing.routeGeometry);
      setStartedAt(existing.startedAt);
      setEndedAt(existing.endedAt);
      setHoursWorked(existing.hours.worked);
      setDrivingHours(existing.hours.driving);
      setLoadingHours(existing.hours.loading);
      setWaitingHours(existing.hours.waiting);
      setBreakHours(existing.hours.unpaidBreak);
      setCreatedAt(existing.createdAt);
      if (existing.stops.length > 0) {
        setStops(
          existing.stops.map((stop) => ({
            id: stop.id,
            type: stop.type,
            address: {
              address: stop.address,
              city: stop.city,
              state: stop.state,
              postalCode: stop.postalCode,
              country: stop.country,
              lat: stop.lat,
              lng: stop.lng,
            },
            appointmentAt: stop.appointmentAt,
            appointmentType: stop.appointmentType,
            reference: stop.reference,
            notes: stop.notes,
          })),
        );
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    void expensesRepo.monthlyFixedFor(ownerId(), truckId).then(setMonthlyFixedCents);
  }, [truckId]);

  /* ----------------------------------------------------- deadhead suggestion */

  useEffect(() => {
    if (id || deadheadMiles !== null) return;
    const firstStop = stops[0];
    if (!firstStop?.address.lat || !firstStop.address.lng) return;

    void (async () => {
      const previous = await loadsRepo.previousDropoff(startedAt ?? new Date().toISOString());
      if (!previous?.lat || !previous.lng) return;
      // Suggested from the last load's final dropoff. Always overridable.
      const miles = haversineMiles(
        [previous.lng, previous.lat],
        [firstStop.address.lng!, firstStop.address.lat!],
      );
      setDeadheadMiles(Math.round(miles * 1.18 * 10) / 10);
    })();
  }, [id, deadheadMiles, stops, startedAt]);

  /* ---------------------------------------------------------------- routing */

  const positioned = useMemo(
    () =>
      stops
        .filter((s) => s.address.lat !== null && s.address.lng !== null)
        .map((s) => [s.address.lng!, s.address.lat!] as Position),
    [stops],
  );

  const computeRoute = useCallback(async () => {
    if (positioned.length < 2) {
      setRouteError("Add at least two stops with addresses to work out the mileage.");
      return;
    }
    setRouting(true);
    setRouteError(null);
    try {
      const truck = trucks.find((t) => t.id === truckId);
      const result = await routeAdapter.route({
        stops: positioned,
        ...(truck
          ? {
              truck: {
                heightM: truck.heightM,
                widthM: truck.widthM,
                lengthM: truck.lengthM,
                weightT: truck.weightT,
                axleLoadT: truck.axleLoadT,
                hazmat: truck.hazmat,
              },
            }
          : {}),
        // A driver paid on HHG miles should see HHG miles.
        ...(profile?.payStructure?.kind === "per_mile" &&
        profile.payStructure.mileageBasis === "shortest"
          ? { shortest: true }
          : {}),
      });
      setLoadedMiles(result.miles);
      setRouteGeometry(result.encodedGeometry);
      // Paid miles default to loaded miles, then stay independently editable.
      if (paidMiles === null) setPaidMiles(result.miles);
    } catch (error) {
      setRouteError(
        (error as Error).message || "Could not work out a route. Enter the mileage yourself.",
      );
    } finally {
      setRouting(false);
    }
  }, [positioned, trucks, truckId, profile, paidMiles]);

  /* ------------------------------------------------------------- derivation */

  // The span less any break, offered as the default so the field starts right.
  const spanHours = useMemo(() => {
    if (!startedAt || !endedAt) return null;
    const span = hoursBetween(startedAt, endedAt);
    return span === null ? null : Math.max(0, span - (breakHours ?? 0));
  }, [startedAt, endedAt, breakHours]);

  useEffect(() => {
    if (spanHours !== null && hoursWorked === null) setHoursWorked(spanHours);
  }, [spanHours, hoursWorked]);

  const draftLoad: Load = useMemo(
    () => ({
      id: id ?? "draft",
      ownerId: ownerId(),
      truckId,
      driverId,
      loadNumber: loadNumber.trim() || null,
      broker: broker.trim() || null,
      commodity: commodity.trim() || null,
      weightLbs,
      trailerType,
      status,
      linehaulCents: linehaulCents ?? 0,
      lineItems: lines.map((line, index) => ({
        id: line.id,
        loadId: id ?? "draft",
        ownerId: ownerId(),
        kind: line.kind,
        code: line.code,
        label: line.label,
        amountCents: line.amountCents,
        percentOfGross: line.percentOfGross,
        sortOrder: index,
      })),
      loadedMiles: loadedMiles ?? 0,
      deadheadMiles: deadheadMiles ?? 0,
      paidMiles,
      startedAt,
      endedAt,
      hours: {
        worked: hoursWorked,
        driving: drivingHours,
        loading: loadingHours,
        waiting: waitingHours,
        unpaidBreak: breakHours,
      },
      stopCount: Math.max(2, stops.length),
      loadExpensesCents: 0,
      routeGeometry,
      routeProvider: routeAdapter.name,
      routeComputedAt: null,
      currency,
      notes: notes.trim() || null,
      stops: [],
      createdAt: createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [
      id, truckId, driverId, loadNumber, broker, commodity, weightLbs, trailerType, status,
      linehaulCents, lines, loadedMiles, deadheadMiles, paidMiles, startedAt, endedAt,
      hoursWorked, drivingHours, loadingHours, waitingHours, breakHours, stops.length,
      routeGeometry, currency, notes, createdAt,
    ],
  );

  const preview = useMemo(
    () =>
      computeLoad(draftLoad, {
        includeFixedCosts: profile?.allocateFixedCosts ?? false,
        dailyFixedCostCents: dailyFixedCostCents(monthlyFixedCents),
      }),
    [draftLoad, profile?.allocateFixedCosts, monthlyFixedCents],
  );

  // Breakeven for the truck this load is on, so a bad rate is flagged while it
  // is still being entered.
  const breakeven = useMemo(() => {
    const monthlyMiles = 10000;
    if (monthlyFixedCents === 0) return null;
    const fixedCpm = monthlyFixedCents / monthlyMiles;
    return checkBreakeven(preview.allInRatePerMile, fixedCpm);
  }, [preview.allInRatePerMile, monthlyFixedCents]);

  /* ------------------------------------------------------------------- save */

  const save = async () => {
    setSaving(true);
    try {
      const loadId = id ?? newId();
      const owner = ownerId();

      const stopRows: LoadStop[] = stops.map((stop, index) => ({
        id: stop.id,
        loadId,
        ownerId: owner,
        sequence: index,
        type: stop.type,
        name: null,
        address: stop.address.address,
        city: stop.address.city,
        state: stop.address.state,
        postalCode: stop.address.postalCode,
        country: stop.address.country,
        lat: stop.address.lat,
        lng: stop.address.lng,
        appointmentAt: stop.appointmentAt,
        appointmentType: stop.appointmentType,
        reference: stop.reference,
        notes: stop.notes,
      }));

      const lineRows: LoadLineItemRow[] = lines.map((line, index) => ({
        id: line.id,
        loadId,
        ownerId: owner,
        kind: line.kind,
        code: line.code,
        label: line.label,
        amountCents: line.amountCents,
        percentOfGross: line.percentOfGross,
        sortOrder: index,
      }));

      await loadsRepo.saveLoad({ ...draftLoad, id: loadId }, stopRows, lineRows);
      await refresh();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll>
        <Txt variant="body" color={colors.textMuted}>
          Loading…
        </Txt>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Screen scroll edges={[]}>
        {/* ------------------------------------------------------------ stops */}
        <SectionHeader
          title="Stops"
          action={
            <Button
              label="Add stop"
              variant="ghost"
              icon="add"
              onPress={() =>
                setStops((current) => {
                  const next = [...current];
                  next.splice(next.length - 1, 0, {
                    id: newId(),
                    type: "stop",
                    address: EMPTY_ADDRESS,
                    appointmentAt: null,
                    appointmentType: null,
                    reference: null,
                    notes: null,
                  });
                  return next;
                })
              }
            />
          }
        />

        <DraggableList
          items={stops}
          rowHeight={92}
          keyExtractor={(stop) => stop.id}
          onReorder={setStops}
          renderItem={(stop, index) => (
            <StopEditor
              stop={stop}
              index={index}
              total={stops.length}
              near={
                index > 0 && stops[index - 1]?.address.lat
                  ? ([stops[index - 1]!.address.lng!, stops[index - 1]!.address.lat!] as Position)
                  : null
              }
              onChange={(next) =>
                setStops((current) => current.map((s) => (s.id === stop.id ? next : s)))
              }
              onRemove={
                stops.length > 2
                  ? () => setStops((current) => current.filter((s) => s.id !== stop.id))
                  : undefined
              }
            />
          )}
        />

        {/* ----------------------------------------------------------- details */}
        <SectionHeader title="Load" />
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <TextField label="Load / pro #" value={loadNumber} onChangeText={setLoadNumber} placeholder="12345" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Broker / shipper" value={broker} onChangeText={setBroker} placeholder="CH Robinson" />
          </View>
        </Row>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <TextField label="Commodity" value={commodity} onChangeText={setCommodity} placeholder="Paper" />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="Weight" suffix="lbs" decimals={0} value={weightLbs} onChange={setWeightLbs} />
          </View>
        </Row>
        <Select
          label="Trailer"
          options={TRAILER_TYPES}
          value={trailerType}
          onChange={setTrailerType}
          clearable
          placeholder="Not set"
        />
        <Select
          label="Status"
          options={LOAD_STATUSES}
          value={status}
          onChange={(next) => next && setStatus(next)}
        />
        {trucks.length > 0 ? (
          <Select
            label="Truck"
            options={trucks.map((t) => ({
              value: t.id,
              label: t.unitNumber ?? t.nickname ?? "Truck",
            }))}
            value={truckId}
            onChange={setTruckId}
            clearable
            placeholder="No truck"
          />
        ) : null}
        {drivers.length > 0 ? (
          <Select
            label="Driver"
            options={drivers.map((d) => ({ value: d.id, label: d.name }))}
            value={driverId}
            onChange={setDriverId}
            clearable
            placeholder="No driver"
          />
        ) : null}

        {/* -------------------------------------------------------------- time */}
        {hourlyDriver ? <TimeBlock /> : null}
        {hourlyDriver ? (
          <TimeFields
            {...{
              startedAt, setStartedAt, endedAt, setEndedAt, hoursWorked, setHoursWorked,
              drivingHours, setDrivingHours, loadingHours, setLoadingHours,
              waitingHours, setWaitingHours, breakHours, setBreakHours, spanHours,
              onAddDetention: (hours: number) =>
                setLines((current) => [
                  ...current,
                  {
                    id: newId(),
                    kind: "accessorial",
                    code: "detention",
                    label: `Detention (${hours}h)`,
                    amountCents: null,
                    percentOfGross: null,
                  },
                ]),
            }}
          />
        ) : null}

        {/* ------------------------------------------------------------- money */}
        <SectionHeader title="Money" />
        <MoneyField label="Linehaul" cents={linehaulCents} onChange={setLinehaulCents} />

        {lines.map((line) => (
          <LineEditor
            key={line.id}
            line={line}
            currency={currency}
            onChange={(next) => setLines((current) => current.map((l) => (l.id === line.id ? next : l)))}
            onRemove={() => setLines((current) => current.filter((l) => l.id !== line.id))}
          />
        ))}

        <Row gap={space.md}>
          <Button
            label="Accessorial"
            variant="secondary"
            icon="add"
            style={{ flex: 1 }}
            onPress={() => setAddingLine("accessorial")}
          />
          <Button
            label="Deduction"
            variant="secondary"
            icon="remove"
            style={{ flex: 1 }}
            onPress={() => setAddingLine("deduction")}
          />
        </Row>

        {/* ------------------------------------------------------------- miles */}
        <SectionHeader
          title="Miles"
          action={
            <Button
              label={routing ? "Routing…" : "Auto"}
              variant="ghost"
              icon="git-branch-outline"
              loading={routing}
              onPress={computeRoute}
            />
          }
        />

        {routeError ? <Banner tone="warning">{routeError}</Banner> : null}
        {routingIsEstimated ? (
          <Banner tone="info" icon="information-circle-outline">
            No routing service is configured, so mileage is a straight-line estimate. Set
            EXPO_PUBLIC_VALHALLA_BASE_URL for real truck routing.
          </Banner>
        ) : null}
        {routeError || routingIsEstimated ? <View style={{ height: space.md }} /> : null}

        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <NumberField label="Loaded" suffix={units} value={loadedMiles} onChange={setLoadedMiles} />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="Deadhead" suffix={units} value={deadheadMiles} onChange={setDeadheadMiles} />
          </View>
        </Row>
        <NumberField
          label="Paid miles"
          hint="What the payer actually paid on"
          suffix={units}
          value={paidMiles}
          onChange={setPaidMiles}
        />

        {preview.miles.unpaidMiles > 0 ? (
          <Banner tone="warning" icon="trending-down-outline">
            {`${preview.miles.unpaidMiles} ${units} run and not paid on.`}
          </Banner>
        ) : null}

        {/* ---------------------------------------------------- collapsed time */}
        {!hourlyDriver ? (
          <>
            <SectionHeader
              title="Time"
              action={
                <Button
                  label={timeOpen ? "Hide" : "Show"}
                  variant="ghost"
                  onPress={() => setTimeOpen(!timeOpen)}
                />
              }
            />
            {timeOpen ? (
              <TimeFields
                {...{
                  startedAt, setStartedAt, endedAt, setEndedAt, hoursWorked, setHoursWorked,
                  drivingHours, setDrivingHours, loadingHours, setLoadingHours,
                  waitingHours, setWaitingHours, breakHours, setBreakHours, spanHours,
                  onAddDetention: (hours: number) =>
                    setLines((current) => [
                      ...current,
                      {
                        id: newId(),
                        kind: "accessorial",
                        code: "detention",
                        label: `Detention (${hours}h)`,
                        amountCents: null,
                        percentOfGross: null,
                      },
                    ]),
                }}
              />
            ) : (
              <Card onPress={() => setTimeOpen(true)}>
                <Row justify="space-between">
                  <Txt variant="body" color={colors.textMuted}>
                    {hoursWorked ? formatHours(hoursWorked) : "Add hours"}
                  </Txt>
                  <Txt variant="body" numeric color={colors.textMuted}>
                    {preview.effectiveHourlyCents !== null
                      ? `${formatMoney(Math.round(preview.effectiveHourlyCents), currency)}/hr`
                      : "—"}
                  </Txt>
                </Row>
              </Card>
            )}
          </>
        ) : null}

        <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />

        {/* ----------------------------------------------------------- preview */}
        <SectionHeader title="What this load makes" />
        <Card>
          <DetailRow label="Gross" value={formatMoney(preview.money.grossCents, currency)} strong />
          {preview.money.deductionsCents !== 0 ? (
            <DetailRow
              label="Deductions"
              value={formatMoney(-preview.money.deductionsCents, currency)}
              valueColor={colors.negative}
            />
          ) : null}
          <DetailRow label="Net revenue" value={formatMoney(preview.money.netRevenueCents, currency)} />
          <DetailRow
            label="Rate per mile"
            value={formatRate(preview.ratePerMile, currency, units)}
          />
          <DetailRow
            label="All-in rate"
            value={formatRate(preview.allInRatePerMile, currency, units)}
            valueColor={
              breakeven?.belowBreakeven ? colors.negative : colors.accent
            }
          />
          {preview.effectiveHourlyCents !== null ? (
            <DetailRow
              label="Effective hourly"
              value={`${formatMoney(Math.round(preview.effectiveHourlyCents), currency)}/hr`}
            />
          ) : null}
        </Card>

        {breakeven?.belowBreakeven && preview.allInRatePerMile !== null && breakeven.breakevenRpm !== null ? (
          <View style={{ marginTop: space.md }}>
            <Banner tone="negative" icon="alert-circle-outline">
              {`This load runs at ${formatRate(preview.allInRatePerMile, currency, units)} against a ${formatRate(breakeven.breakevenRpm, currency, units)} breakeven.`}
            </Banner>
          </View>
        ) : null}

        <View style={{ height: space.xxl }} />
      </Screen>

      <BottomBar>
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button label="Save load" onPress={save} loading={saving} style={{ flex: 2 }} />
      </BottomBar>

      <Sheet
        open={addingLine !== null}
        onClose={() => setAddingLine(null)}
        title={addingLine === "deduction" ? "Add a deduction" : "Add an accessorial"}
      >
        {(addingLine === "deduction" ? DEDUCTION_CODES : ACCESSORIAL_CODES).map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            onPress={() => {
              setLines((current) => [
                ...current,
                {
                  id: newId(),
                  kind: addingLine ?? "accessorial",
                  code: option.value,
                  label: option.label,
                  amountCents: null,
                  // Dispatch and factoring are quoted as a percentage far more
                  // often than as a flat amount, so start them that way.
                  percentOfGross:
                    addingLine === "deduction" &&
                    (option.value === "dispatch" || option.value === "factoring")
                      ? 10
                      : null,
                },
              ]);
              setAddingLine(null);
            }}
            style={{ minHeight: space.tap, justifyContent: "center" }}
          >
            <Txt variant="body">{option.label}</Txt>
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}

function TimeBlock() {
  return <SectionHeader title="Time" />;
}

interface TimeFieldsProps {
  startedAt: string | null;
  setStartedAt: (v: string | null) => void;
  endedAt: string | null;
  setEndedAt: (v: string | null) => void;
  hoursWorked: number | null;
  setHoursWorked: (v: number | null) => void;
  drivingHours: number | null;
  setDrivingHours: (v: number | null) => void;
  loadingHours: number | null;
  setLoadingHours: (v: number | null) => void;
  waitingHours: number | null;
  setWaitingHours: (v: number | null) => void;
  breakHours: number | null;
  setBreakHours: (v: number | null) => void;
  spanHours: number | null;
  onAddDetention: (hours: number) => void;
}

function TimeFields(props: TimeFieldsProps) {
  const { colors, space } = useTheme();
  const [detail, setDetail] = useState(false);

  return (
    <View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}>
          <DateTimeField label="Start" value={props.startedAt} onChange={props.setStartedAt} />
        </View>
        <View style={{ flex: 1 }}>
          <DateTimeField label="End" value={props.endedAt} onChange={props.setEndedAt} />
        </View>
      </Row>

      <NumberField
        label="Hours worked"
        hint={props.spanHours !== null ? `Span is ${formatHours(props.spanHours)}` : undefined}
        suffix="hrs"
        value={props.hoursWorked}
        onChange={props.setHoursWorked}
      />

      <Toggle
        label="Break it down"
        description="Driving, loading, waiting and unpaid break"
        value={detail}
        onChange={setDetail}
      />

      {detail ? (
        <View style={{ marginTop: space.md }}>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <NumberField label="Driving" suffix="hrs" value={props.drivingHours} onChange={props.setDrivingHours} />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField label="Loading" suffix="hrs" value={props.loadingHours} onChange={props.setLoadingHours} />
            </View>
          </Row>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <NumberField label="Waiting" suffix="hrs" value={props.waitingHours} onChange={props.setWaitingHours} />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField label="Unpaid break" suffix="hrs" value={props.breakHours} onChange={props.setBreakHours} />
            </View>
          </Row>

          {/* Detention hours entered here offer to become a billable line. */}
          {props.waitingHours && props.waitingHours >= 2 ? (
            <Pressable onPress={() => props.onAddDetention(props.waitingHours!)}>
              <Banner tone="accent" icon="add-circle-outline">
                {`Add a detention line for ${formatHours(props.waitingHours)} of waiting?`}
              </Banner>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ height: space.sm }} />
      <Txt variant="caption" color={colors.textFaint}>
        Hours drive the effective hourly rate on this load.
      </Txt>
      <View style={{ height: space.md }} />
    </View>
  );
}

function StopEditor({
  stop,
  index,
  total,
  near,
  onChange,
  onRemove,
}: {
  stop: StopDraft;
  index: number;
  total: number;
  near: Position | null;
  onChange: (stop: StopDraft) => void;
  onRemove?: () => void;
}) {
  const { colors, space } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const roleLabel = index === 0 ? "Pickup" : index === total - 1 ? "Dropoff" : `Stop ${index + 1}`;
  const hasAddress = Boolean(stop.address.address ?? stop.address.city);

  return (
    <View style={{ paddingVertical: space.sm, paddingRight: space.sm }}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Txt variant="label" color={colors.textMuted}>
              {roleLabel.toUpperCase()}
            </Txt>
            <Txt variant="body" numberOfLines={1} color={hasAddress ? colors.text : colors.textFaint}>
              {hasAddress ? addressLabel(stop.address) : "Tap to add an address"}
            </Txt>
            {stop.appointmentAt ? (
              <Txt variant="caption" numeric color={colors.textMuted}>
                {new Date(stop.appointmentAt).toLocaleString()}
                {stop.appointmentType === "fcfs" ? " · FCFS" : ""}
              </Txt>
            ) : null}
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </Row>
      </Pressable>

      {expanded ? (
        <View style={{ marginTop: space.md }}>
          <AddressField
            value={stop.address}
            near={near}
            onChange={(address) => onChange({ ...stop, address })}
          />
          <DateTimeField
            label="Appointment"
            value={stop.appointmentAt}
            onChange={(appointmentAt) => onChange({ ...stop, appointmentAt })}
          />
          <Segmented
            label="Appointment type"
            value={stop.appointmentType ?? "scheduled"}
            options={[
              { value: "scheduled", label: "Scheduled" },
              { value: "fcfs", label: "FCFS" },
            ]}
            onChange={(appointmentType) => onChange({ ...stop, appointmentType })}
          />
          <TextField
            label="Reference / PO"
            value={stop.reference ?? ""}
            onChangeText={(reference) => onChange({ ...stop, reference: reference || null })}
          />
          <TextField
            label="Notes"
            value={stop.notes ?? ""}
            onChangeText={(notes) => onChange({ ...stop, notes: notes || null })}
            multiline
          />
          {onRemove ? (
            <Button label="Remove stop" variant="ghost" onPress={onRemove} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LineEditor({
  line,
  currency,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  currency: "USD" | "CAD";
  onChange: (line: LineDraft) => void;
  onRemove: () => void;
}) {
  const { colors, space } = useTheme();
  const isPercent = line.percentOfGross !== null;

  return (
    <Card style={{ marginBottom: space.sm }}>
      <Row justify="space-between">
        <Txt variant="label" color={line.kind === "deduction" ? colors.negative : colors.accent}>
          {line.label.toUpperCase()}
        </Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.label}`} onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Row>

      {/* Only deductions can be a percentage: an accessorial priced off gross
          would be self-referential, since gross is what accessorials feed. */}
      {line.kind === "deduction" ? (
        <Segmented
          value={isPercent ? "percent" : "flat"}
          options={[
            { value: "flat", label: "Flat" },
            { value: "percent", label: "% of gross" },
          ]}
          onChange={(mode) =>
            onChange(
              mode === "percent"
                ? { ...line, percentOfGross: line.percentOfGross ?? 10, amountCents: null }
                : { ...line, percentOfGross: null, amountCents: line.amountCents ?? 0 },
            )
          }
        />
      ) : null}

      {isPercent ? (
        <NumberField
          suffix="% of gross"
          decimals={1}
          value={line.percentOfGross}
          onChange={(percentOfGross) => onChange({ ...line, percentOfGross })}
        />
      ) : (
        <MoneyField
          cents={line.amountCents}
          onChange={(amountCents) => onChange({ ...line, amountCents })}
        />
      )}
    </Card>
  );
}

export { metersToMiles, monthlyEquivalentCents, toLocalIso };
