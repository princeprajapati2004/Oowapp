"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenuePoint } from "@/lib/services/analytics";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
  data: RevenuePoint[];
  granularity: "hour" | "day" | "month";
  currency: string;
  onPointClick?: (point: RevenuePoint, index: number) => void;
  selectedIndex?: number | null;
}

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Revenue: <span className="font-semibold text-foreground">{formatCurrency(payload[0]?.value ?? 0, currency)}</span>
      </p>
      <p className="text-muted-foreground">
        Orders: <span className="font-semibold text-foreground">{payload[1]?.value ?? 0}</span>
      </p>
    </div>
  );
}

export function RevenueChart({ data, granularity, currency, onPointClick, selectedIndex }: Props) {
  const hasData = data.some((p) => p.revenue > 0);

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No orders in this period
      </div>
    );
  }

  const tickInterval = granularity === "hour" ? 2 : granularity === "day" && data.length > 14 ? 4 : 0;

  if (granularity === "hour") {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={(e) => {
            const idx = e?.activeTooltipIndex;
            if (typeof idx === "number" && onPointClick) {
              onPointClick(data[idx], idx);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) =>
              v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`
            }
          />
          <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <Bar
            dataKey="revenue"
            fill="var(--color-primary)"
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart
        data={data}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        onClick={(e) => {
          const idx = e?.activeTooltipIndex;
          if (typeof idx === "number" && onPointClick) {
            onPointClick(data[idx], idx);
          }
        }}
      >
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) =>
            v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`
          }
        />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#revenueGradient)"
          dot={false}
          activeDot={{
            r: 4,
            fill: "var(--color-primary)",
            stroke: "var(--background)",
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
