import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { newId } from "@/db/ids";
import type { Attachment, ExpenseCategory, FuelEntry } from "@/db/models";
import * as attachmentsRepo from "@/db/repositories/attachments";
import * as expensesRepo from "@/db/repositories/expenses";
import { env } from "@/lib/env";
import { storagePathFor } from "@/sync";
import { formatMoney, type RecurrenceFrequency } from "@/earnings";
import { useData } from "@/store/data";
import { ownerId, useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Banner,
  BottomBar,
  Button,
  Card,
  DateTimeField,
  MoneyField,
  NumberField,
  Row,
  Screen,
  SectionHeader,
  Select,
  TextField,
  Toggle,
  Txt,
  todayKey,
  type Option,
} from "@/ui";

/**
 * Expense quick entry. Target is under fifteen seconds for the common case:
 * amount, category, done.
 */

const RECURRENCE_OPTIONS: Option<RecurrenceFrequency>[] = [
  { value: "none", label: "One-off" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK","NT","NU","YT",
];

export default function ExpenseEditor() {
  const { colors, space } = useTheme();
  const { id, loadId } = useLocalSearchParams<{ id?: string; loadId?: string }>();
  const trucks = useProfile((s) => s.trucks);
  const profile = useProfile((s) => s.profile);
  const refresh = useData((s) => s.refresh);

  const currency = profile?.currency ?? "USD";

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [incurredOn, setIncurredOn] = useState(todayKey());
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [truckId, setTruckId] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>("none");
  const [recurrenceEndOn, setRecurrenceEndOn] = useState<string | null>(null);
  const [gallons, setGallons] = useState<number | null>(null);
  const [odometer, setOdometer] = useState<number | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [isDef, setIsDef] = useState(false);
  const [receipt, setReceipt] = useState<Attachment | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void expensesRepo.listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (!id) return;
    void expensesRepo.getExpense(id).then((expense) => {
      if (!expense) return;
      setAmountCents(expense.amountCents);
      setCategoryId(expense.categoryId);
      setIncurredOn(expense.incurredOn);
      setVendor(expense.vendor ?? "");
      setNotes(expense.notes ?? "");
      setTruckId(expense.truckId);
      setRecurrence(expense.recurrenceRule);
      setRecurrenceEndOn(expense.recurrenceEndOn);
      if (expense.fuel) {
        setGallons(expense.fuel.gallons);
        setOdometer(expense.fuel.odometer);
        setState(expense.fuel.state);
        setIsDef(expense.fuel.isDef);
      }
    });
  }, [id]);

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  // Fuel entries capture gallons, price, odometer and state; state is what IFTA
  // prep is built on.
  const isFuel = category?.name === "Fuel" || category?.name === "DEF" || isDef;

  const pricePerGallonCents =
    amountCents !== null && gallons && gallons > 0 ? Math.round(amountCents / gallons) : null;

  const categoryOptions = useMemo<Option<string>[]>(
    () =>
      categories.map((c) => {
        const parent = c.parentId ? categories.find((p) => p.id === c.parentId) : null;
        return {
          value: c.id,
          label: parent ? `${parent.name} › ${c.name}` : c.name,
          description: c.isFixed ? "Fixed cost" : undefined,
        };
      }),
    [categories],
  );

  const attachReceipt = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    const result = permission.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const expenseId = id ?? "pending";
    setReceipt({
      id: newId(),
      ownerId: ownerId(),
      loadId: null,
      expenseId: null,
      kind: "receipt",
      storagePath: storagePathFor(ownerId(), "expenses", expenseId, asset.fileName ?? "receipt.jpg"),
      localUri: asset.uri,
      fileName: asset.fileName ?? "receipt.jpg",
      mimeType: asset.mimeType ?? "image/jpeg",
      sizeBytes: asset.fileSize ?? null,
      uploaded: false,
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const expenseId = id ?? newId();
      const owner = ownerId();
      const fuel: FuelEntry | null = isFuel
        ? {
            expenseId,
            gallons: gallons ?? 0,
            pricePerGallonCents,
            odometer,
            state,
            isDef,
          }
        : null;

      await expensesRepo.saveExpense({
        id: expenseId,
        ownerId: owner,
        truckId,
        loadId: loadId ?? null,
        driverId: null,
        categoryId,
        amountCents: amountCents ?? 0,
        incurredOn,
        vendor: vendor.trim() || null,
        notes: notes.trim() || null,
        receiptUrl: null,
        currency,
        recurrenceRule: recurrence,
        recurrenceStartOn: recurrence === "none" ? null : incurredOn,
        recurrenceEndOn: recurrence === "none" ? null : recurrenceEndOn,
        generatedFromId: null,
        // A recurring expense is a template: it describes what the truck costs
        // per period rather than money that left the account on one day.
        isTemplate: recurrence !== "none",
        skipped: false,
        fuel,
      });

      if (receipt) {
        await attachmentsRepo.saveAttachment({
          ...receipt,
          expenseId,
          storagePath: storagePathFor(owner, "expenses", expenseId, receipt.fileName ?? "receipt.jpg"),
        });
      }

      if (recurrence !== "none") {
        await expensesRepo.generateRecurringExpenses(owner, todayKey());
      }

      await refresh();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <Screen scroll edges={[]}>
        <MoneyField label="Amount" cents={amountCents} onChange={setAmountCents} />

        <Select
          label="Category"
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          clearable
          placeholder="Uncategorised"
        />

        <DateTimeField
          label="Date"
          mode="date"
          clearable={false}
          value={`${incurredOn}T12:00:00Z`}
          onChange={(iso) => iso && setIncurredOn(iso.slice(0, 10))}
        />

        <TextField label="Vendor" value={vendor} onChangeText={setVendor} placeholder="Pilot #442" />

        {trucks.length > 0 ? (
          <Select
            label="Truck"
            options={trucks.map((t) => ({ value: t.id, label: t.unitNumber ?? t.nickname ?? "Truck" }))}
            value={truckId}
            onChange={setTruckId}
            clearable
            placeholder="General overhead"
          />
        ) : null}

        {isFuel ? (
          <>
            <SectionHeader title="Fuel" />
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <NumberField label="Gallons" suffix="gal" value={gallons} onChange={setGallons} />
              </View>
              <View style={{ flex: 1 }}>
                <NumberField label="Odometer" decimals={0} value={odometer} onChange={setOdometer} />
              </View>
            </Row>
            <Select
              label="State"
              hint="For IFTA"
              options={STATES.map((s) => ({ value: s, label: s }))}
              value={state}
              onChange={setState}
              clearable
              placeholder="Not set"
            />
            <Toggle label="DEF, not diesel" value={isDef} onChange={setIsDef} />
            {pricePerGallonCents !== null ? (
              <Card style={{ marginTop: space.md }}>
                <Row justify="space-between">
                  <Txt variant="body" color={colors.textMuted}>
                    Price per gallon
                  </Txt>
                  <Txt variant="body" numeric>
                    {formatMoney(pricePerGallonCents, currency)}
                  </Txt>
                </Row>
              </Card>
            ) : null}
          </>
        ) : null}

        <SectionHeader title="Repeats" />
        <Select
          label="Frequency"
          options={RECURRENCE_OPTIONS}
          value={recurrence}
          onChange={(next) => next && setRecurrence(next)}
        />
        {recurrence !== "none" ? (
          <>
            <DateTimeField
              label="Until"
              mode="date"
              value={recurrenceEndOn ? `${recurrenceEndOn}T12:00:00Z` : null}
              onChange={(iso) => setRecurrenceEndOn(iso ? iso.slice(0, 10) : null)}
            />
            <Banner tone="info" icon="repeat-outline">
              {recurrence === "annually"
                ? "Annual costs like plates and your 2290 are spread across the year in your cost per mile, not dumped into one month."
                : "Each occurrence is generated for you and marked as auto, so you can edit or skip any one of them."}
            </Banner>
          </>
        ) : null}

        <SectionHeader title="Receipt" />
        {receipt ? (
          <Card>
            <Row justify="space-between">
              <Txt variant="body" numberOfLines={1}>
                {receipt.fileName}
              </Txt>
              <Button label="Remove" variant="ghost" onPress={() => setReceipt(null)} />
            </Row>
          </Card>
        ) : (
          <Button label="Attach a photo" variant="secondary" icon="camera-outline" onPress={attachReceipt} full />
        )}
        {!env.ocrEnabled ? (
          <Txt variant="caption" color={colors.textFaint} style={{ marginTop: space.xs }}>
            Receipt OCR is behind a feature flag and off in this build.
          </Txt>
        ) : null}

        <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />
      </Screen>

      <BottomBar>
        {id ? (
          <Button
            label="Delete"
            variant="destructive"
            style={{ flex: 1 }}
            onPress={async () => {
              await expensesRepo.deleteExpense(id);
              await refresh();
              router.back();
            }}
          />
        ) : (
          <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => router.back()} />
        )}
        <Button label="Save" onPress={save} loading={saving} style={{ flex: 2 }} />
      </BottomBar>
    </Screen>
  );
}
