import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiErrorText, type Messages, useT } from '@/i18n';
import { fareRule } from '@/lib/fare';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { FareRule, TransitRoute, VehicleType } from '@/types';

/** Matches FARE_SUPPORTERS on the server. */
const FARE_SUPPORTERS = 2;

function describe(rule: FareRule, t: Messages): string {
  return rule.kind === 'flat'
    ? t.routes.fare.flat(rule.amount)
    : t.fares.jeepRule(rule.base, rule.baseKm, rule.perKm.toFixed(2));
}

/**
 * The route's fare (agreed by commuters, else the standard table) and, for community
 * routes, proposing a new fare or backing one someone else proposed.
 */
export function RouteFare({ route, editable }: { route: TransitRoute; editable: boolean }) {
  const theme = useTheme();
  const t = useT();
  const p = route.properties;
  const user = useAuthStore((s) => s.user);
  const backed = useAppStore((s) => s.backedFareIds);
  const backRouteFare = useAppStore((s) => s.backRouteFare);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (p.type === 'walk') return null;
  const standard = fareRule(p.type as VehicleType, p.city);
  const pending = p.pendingFare;
  const mine = !!pending && (pending.proposedBy === user?.username || backed.includes(pending.id));

  const back = async () => {
    if (!user) return router.push('/sign-in');
    setBusy(true);
    setMessage(null);
    try {
      await backRouteFare(p.id, pending!.id);
    } catch (e) {
      setMessage(apiErrorText(e, t, t.routes.voteFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="small">
        {t.routes.fare.label}:{' '}
        {p.fare
          ? `${describe(p.fare, t)} · ${t.routes.fare.agreed(p.fare.supporters)}`
          : `${describe({ kind: 'distance', ...standard }, t)} ${t.routes.fare.standard}`}
      </ThemedText>

      {editable && pending && (
        <View style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary">
            {t.routes.fare.proposed(
              pending.proposedBy,
              describe(pending, t),
              pending.supporters,
              FARE_SUPPORTERS
            )}
          </ThemedText>
          {mine ? (
            <ThemedText type="small" themeColor="textSecondary">
              {pending.proposedBy === user?.username ? t.routes.fare.waiting : t.routes.fare.backed}
            </ThemedText>
          ) : (
            <Pressable
              onPress={back}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, { borderColor: theme.accent }]}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                {busy ? '…' : t.routes.fare.back}
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {editable &&
        (editing ? (
          <FareForm
            initial={p.fare ?? { kind: 'distance', ...standard }}
            routeId={p.id}
            onDone={() => setEditing(false)}
          />
        ) : (
          <Pressable
            onPress={() => (user ? setEditing(true) : router.push('/sign-in'))}
            accessibilityRole="button"
            style={[styles.button, styles.start, { borderColor: theme.border }]}>
            <ThemedText type="small">{t.routes.fare.update}</ThemedText>
          </Pressable>
        ))}

      {message && (
        <ThemedText type="small" style={styles.error}>
          {message}
        </ThemedText>
      )}
    </View>
  );
}

function FareForm({
  initial,
  routeId,
  onDone,
}: {
  initial: FareRule;
  routeId: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const proposeRouteFare = useAppStore((s) => s.proposeRouteFare);
  const [kind, setKind] = useState<FareRule['kind']>(initial.kind);
  const [amount, setAmount] = useState(initial.kind === 'flat' ? String(initial.amount) : '');
  const [base, setBase] = useState(initial.kind === 'distance' ? String(initial.base) : '');
  const [baseKm, setBaseKm] = useState(initial.kind === 'distance' ? String(initial.baseKm) : '4');
  const [perKm, setPerKm] = useState(initial.kind === 'distance' ? String(initial.perKm) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => Number.parseFloat(s.replace(',', '.'));
  const fare: FareRule | null =
    kind === 'flat'
      ? num(amount) > 0
        ? { kind, amount: num(amount) }
        : null
      : num(base) > 0 && num(baseKm) >= 0 && num(perKm) >= 0
        ? { kind, base: num(base), baseKm: num(baseKm), perKm: num(perKm) }
        : null;

  const submit = async () => {
    if (!fare) return setError(t.routes.fare.invalid);
    setBusy(true);
    setError(null);
    try {
      await proposeRouteFare(routeId, fare);
      onDone();
    } catch (e) {
      setError(apiErrorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const input = (label: string, value: string, onChange: (v: string) => void) => (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />
    </View>
  );

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <View style={styles.row}>
        {(['distance', 'flat'] as const).map((k) => {
          const active = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityState={{ selected: active }}
              style={[
                styles.button,
                { borderColor: active ? theme.accent : theme.border },
                active && { backgroundColor: theme.accent },
              ]}>
              <ThemedText type="small" style={{ color: active ? theme.accentText : theme.text }}>
                {t.routes.fare.kinds[k]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        {kind === 'flat' ? (
          input(t.routes.fare.amount, amount, setAmount)
        ) : (
          <>
            {input(t.routes.fare.base, base, setBase)}
            {input(t.routes.fare.baseKm, baseKm, setBaseKm)}
            {input(t.routes.fare.perKm, perKm, setPerKm)}
          </>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t.routes.fare.note}
      </ThemedText>
      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
      <View style={styles.row}>
        <Pressable
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            {busy ? '…' : t.routes.fare.submit}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          style={[styles.button, { borderColor: theme.border }]}>
          <ThemedText type="small">{t.common.cancel}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  start: { alignSelf: 'flex-start' },
  button: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  form: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.two },
  field: { gap: Spacing.half, minWidth: 110, flexGrow: 1 },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
  },
  error: { color: '#CF222E' },
});
