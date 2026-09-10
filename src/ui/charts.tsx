import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Path, Rect, Line as SvgLine, Text as SvgText } from "react-native-svg";

import { formatMoney, type Cents } from "@/earnings";
import { useTheme } from "@/theme";

import { Row, Txt } from "./primitives";

/**
 * Charts, drawn directly in SVG.
 *
 * Two of them, both answering a specific question: "is the trend up or down"
 * and "where does the money go". Neither needs a charting library, and neither
 * should ship one — the numbers are the interface, the chart is supporting.
 */

export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 160,
  currency = "USD",
  emptyLabel = "No data in this range",
}: {
  data: BarDatum[];
  height?: number;
  currency?: "USD" | "CAD";
  emptyLabel?: string;
}) {
  const { colors, space, radius } = useTheme();

  const { bars, zeroY, max, min } = useMemo(() => {
    if (data.length === 0) return { bars: [], zeroY: 0, max: 0, min: 0 };
    const values = data.map((d) => d.value);
    const rawMax = Math.max(0, ...values);
    const rawMin = Math.min(0, ...values);
    // A flat zero series still needs a scale, or every bar divides by zero.
    const span = rawMax - rawMin || 1;
    return {
      bars: data,
      zeroY: (rawMax / span) * height,
      max: rawMax,
      min: rawMin,
    };
  }, [data, height]);

  if (bars.length === 0) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="caption" color={colors.textFaint}>
          {emptyLabel}
        </Txt>
      </View>
    );
  }

  const span = max - min || 1;
  const gap = 6;
  const barWidth = Math.max(6, (100 - gap * (bars.length - 1)) / bars.length);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {/* Baseline sits at zero, so a losing week hangs below it. */}
        <SvgLine x1={0} y1={zeroY} x2={100} y2={zeroY} stroke={colors.border} strokeWidth={0.5} />
        {bars.map((bar, index) => {
          const magnitude = (Math.abs(bar.value) / span) * height;
          const positive = bar.value >= 0;
          const y = positive ? zeroY - magnitude : zeroY;
          return (
            <Rect
              key={`${bar.label}-${index}`}
              x={index * (barWidth + gap)}
              y={y}
              width={barWidth}
              height={Math.max(1, magnitude)}
              rx={1.5}
              fill={positive ? colors.accent : colors.negative}
            />
          );
        })}
      </Svg>

      <Row justify="space-between" style={{ marginTop: space.xs }}>
        <Txt variant="caption" color={colors.textFaint} numeric>
          {bars[0]?.label ?? ""}
        </Txt>
        <Txt variant="caption" color={colors.textFaint} numeric>
          {bars[bars.length - 1]?.label ?? ""}
        </Txt>
      </Row>
      <Row justify="space-between">
        <Txt variant="caption" color={colors.textFaint} numeric>
          low {formatMoney(min, currency, { decimals: 0 })}
        </Txt>
        <Txt variant="caption" color={colors.textFaint} numeric>
          high {formatMoney(max, currency, { decimals: 0 })}
        </Txt>
      </Row>
      <View style={{ height: radius.sm }} />
    </View>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export function DonutChart({
  slices,
  size = 168,
  thickness = 26,
  centerLabel,
  centerValue,
  currency = "USD",
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  currency?: "USD" | "CAD";
}) {
  const { colors, space } = useTheme();
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    const radius = (size - thickness) / 2;
    const center = size / 2;
    let angle = -Math.PI / 2;

    return slices
      .filter((s) => s.value > 0)
      .map((slice, index) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;

        const x1 = center + radius * Math.cos(start);
        const y1 = center + radius * Math.sin(start);
        const x2 = center + radius * Math.cos(end);
        const y2 = center + radius * Math.sin(end);
        const largeArc = sweep > Math.PI ? 1 : 0;

        return {
          key: `${slice.label}-${index}`,
          // A full circle cannot be drawn as one arc: the start and end points
          // coincide and the path collapses. Two half arcs instead.
          d:
            sweep >= Math.PI * 2 - 1e-6
              ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius}`
              : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
          color: slice.color ?? colors.chart[index % colors.chart.length]!,
          label: slice.label,
          value: slice.value,
          percent: (slice.value / total) * 100,
        };
      });
  }, [slices, total, size, thickness, colors.chart]);

  if (arcs.length === 0) {
    return (
      <View style={{ height: size, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="caption" color={colors.textFaint}>
          No expenses in this range
        </Txt>
      </View>
    );
  }

  return (
    <Row gap={space.lg} align="center">
      <Svg width={size} height={size}>
        <G>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={(size - thickness) / 2}
            stroke={colors.surfaceRaised}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((arc) => (
            <Path
              key={arc.key}
              d={arc.d}
              stroke={arc.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
          {centerValue ? (
            <SvgText
              x={size / 2}
              y={size / 2 + 2}
              fontSize={18}
              fontWeight="700"
              fill={colors.text}
              textAnchor="middle"
            >
              {centerValue}
            </SvgText>
          ) : null}
          {centerLabel ? (
            <SvgText
              x={size / 2}
              y={size / 2 + 20}
              fontSize={11}
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {centerLabel}
            </SvgText>
          ) : null}
        </G>
      </Svg>

      <View style={{ flex: 1, gap: space.sm }}>
        {arcs.slice(0, 6).map((arc) => (
          <Row key={arc.key} gap={space.sm}>
            <View
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: arc.color }}
            />
            <View style={{ flex: 1 }}>
              <Txt variant="caption" numberOfLines={1}>
                {arc.label}
              </Txt>
            </View>
            <Txt variant="caption" numeric color={colors.textMuted}>
              {formatMoney(arc.value as Cents, currency, { decimals: 0 })}
            </Txt>
          </Row>
        ))}
        {arcs.length > 6 ? (
          <Txt variant="caption" color={colors.textFaint}>
            +{arcs.length - 6} more
          </Txt>
        ) : null}
      </View>
    </Row>
  );
}

/** A single-bar progress meter, used for the breakeven gauge. */
export function Meter({
  value,
  target,
  label,
  tone,
}: {
  value: number;
  target: number;
  label: string;
  tone?: string;
}) {
  const { colors, space, radius } = useTheme();
  const ratio = target > 0 ? Math.min(1.5, Math.max(0, value / target)) : 0;
  const clears = value >= target;
  const color = tone ?? (clears ? colors.accent : colors.negative);

  return (
    <View style={{ gap: space.xs }}>
      <Row justify="space-between">
        <Txt variant="caption" color={colors.textMuted}>
          {label}
        </Txt>
      </Row>
      <View
        style={{
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceRaised,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.min(100, (ratio / 1.5) * 100)}%`,
            height: "100%",
            backgroundColor: color,
          }}
        />
        {/* The breakeven line itself, at two thirds of the track. */}
        <View
          style={{
            position: "absolute",
            left: `${(1 / 1.5) * 100}%`,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: colors.textFaint,
          }}
        />
      </View>
    </View>
  );
}
