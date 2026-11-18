"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";

type RangePreset = "today" | "7d" | "30d" | "current_period" | "previous_period" | "custom";

const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  current_period: "Current Billing Period",
  previous_period: "Previous Billing Period",
  custom: "Custom Range",
};

const FEATURE_LABELS: Record<string, string> = {
  orders: "Orders / Billing",
  products: "Products",
  customers: "Customers",
  staff: "Staff",
  branches: "Branches",
};

const ACTOR_LABELS: Record<string, string> = {
  admin: "Owner",
  staff: "Staff",
  customer: "Customer",
};

interface UsageRow {
  id: string;
  shopName: string;
  featureKey: string;
  action: string;
  actorType: string;
  actorId: string;
  relatedRecordId: string | null;
  createdAt: string;
}

export function UsageHistoryPageClient() {
  const [range, setRange] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return;

    setLoading(true);
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }

    api
      .get<{ rows: UsageRow[]; summary: Record<string, number> }>(`/api/admin/subscription/usage-history?${params}`)
      .then((data) => {
        setRows(data.rows);
        setSummary(data.summary);
      })
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  const totalEvents = Object.values(summary).reduce((sum, n) => sum + n, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/subscription" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold">Usage History</h1>
          <p className="text-sm text-muted-foreground">
            What your account has done, and when — stays available even after your plan expires or renews.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangePreset)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as RangePreset[]).map((key) => (
              <SelectItem key={key} value={key}>
                {RANGE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Summary</CardTitle>
          <CardDescription>{totalEvents} total action{totalEvents === 1 ? "" : "s"} in this window</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(summary).map(([key, count]) => (
              <div key={key} className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold">{count}</p>
                <p className="text-xs text-muted-foreground">{FEATURE_LABELS[key] ?? key}</p>
              </div>
            ))}
            {Object.keys(summary).length === 0 && !loading && (
              <p className="col-span-full text-sm text-muted-foreground">No activity in this window.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={History} title="No activity yet" description="Actions you take will show up here." />
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {row.action === "CREATE" ? "Created" : row.action === "UPDATE" ? "Updated" : "Deleted"}{" "}
                      {FEATURE_LABELS[row.featureKey] ?? row.featureKey}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.shopName} · by {ACTOR_LABELS[row.actorType] ?? row.actorType}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{new Date(row.createdAt).toLocaleString()}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
