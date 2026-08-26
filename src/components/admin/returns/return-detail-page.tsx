"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, X, PackageCheck, Wallet, AlertTriangle, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_BADGE_CLASS,
  RETURN_REASON_LABELS,
  REFUND_METHODS,
  REFUND_METHOD_LABELS,
  RETURN_VALID_PRIOR_STATUS,
  RETURN_ITEM_CONDITIONS,
  RETURN_ITEM_CONDITION_LABELS,
  deriveReturnNumber,
  type ReturnStatus,
  type ReturnReason,
  type RefundMethod,
  type ReturnItemCondition,
} from "@/lib/return-status";
import { deriveLossDamageNumber } from "@/lib/loss-damage-status";
import type { ReturnDetailPayload } from "@/lib/services/return-request";
import { ReturnTimeline } from "./return-timeline";

export function ReturnDetailPage({ initial, currency }: { initial: ReturnDetailPayload; currency: string }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("UPI");
  const [refundReference, setRefundReference] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [conditionOpen, setConditionOpen] = useState(false);
  const [itemConditions, setItemConditions] = useState<Record<string, ReturnItemCondition>>({});

  const status = data.status as ReturnStatus;
  const reason = data.reason as ReturnReason;

  useOrderEvents("/api/admin/orders/stream", {
    onReturnUpdated: (r) => {
      if (r.id !== data.id) return;
      api.get<ReturnDetailPayload>(`/api/admin/returns/${data.id}`).then(setData).catch(() => {});
    },
  });

  async function runAction(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const updated = await api.patch<ReturnDetailPayload>(`/api/admin/returns/${data.id}`, body);
      setData(updated);
      toast.success(successMessage);
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this return");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const canApprove = RETURN_VALID_PRIOR_STATUS.approve.includes(status);
  const canReject = RETURN_VALID_PRIOR_STATUS.reject.includes(status);
  const canMarkItemReturned = RETURN_VALID_PRIOR_STATUS.mark_item_returned.includes(status);
  const canProcessRefund = RETURN_VALID_PRIOR_STATUS.process_refund.includes(status);
  const canMarkFailed = RETURN_VALID_PRIOR_STATUS.mark_refund_failed.includes(status);

  return (
    <>
      <div className="-m-4 bg-background md:-m-6">
        <div className="sticky top-0 z-20 border-b bg-background">
          <div className="mx-auto flex h-14 max-w-[620px] items-center gap-2 px-3 sm:px-4">
            <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/returns" />} nativeButton={false} aria-label="Back to Returns">
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="truncate text-base font-semibold">Return Details</h1>
          </div>
        </div>

        <div className="mx-auto max-w-[620px] space-y-3 px-3 pt-3 pb-28 sm:px-4 sm:pt-4">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="font-mono text-sm font-semibold">{deriveReturnNumber(data.id)}</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", RETURN_STATUS_BADGE_CLASS[status])}>
              {RETURN_STATUS_LABELS[status]}
            </span>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Order</p>
            <Link href={`/admin/orders/${data.orderId}`} className="text-sm font-medium text-primary hover:underline">
              #{data.order.billNumber}
            </Link>
            <p className="pt-2 text-xs text-muted-foreground">Customer</p>
            <p className="text-sm font-medium">{data.order.customerName || "Walk-in Customer"}</p>
            {data.order.customerPhone && <p className="text-sm text-muted-foreground">{data.order.customerPhone}</p>}
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Returned Items</p>
            {data.items.map((item) => (
              <div key={item.id} className="space-y-0.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item.productName} × {item.quantity}</span>
                  <span className="shrink-0 font-medium">{formatCurrency(item.refundableAmount, currency)}</span>
                </div>
                {item.condition && (
                  <p className="text-xs text-muted-foreground">
                    {RETURN_ITEM_CONDITION_LABELS[item.condition as ReturnItemCondition]}
                    {item.lossDamageRecordId && (
                      <>
                        {" · "}
                        <Link href={`/admin/loss-damage/${item.lossDamageRecordId}`} className="text-primary hover:underline">
                          {deriveLossDamageNumber(item.lossDamageRecordId)}
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>

          {(data.inventoryAction.restockedQuantity > 0 || data.inventoryAction.damagedQuantity > 0) && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventory</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Quantity Restored</span>
                <span className="font-medium">{data.inventoryAction.restockedQuantity}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Quantity Damaged / Not Restocked</span>
                <span className="font-medium">{data.inventoryAction.damagedQuantity}</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Return Reason</p>
            <p className="text-sm">{RETURN_REASON_LABELS[reason]}{reason === "OTHER" && data.reasonOtherText ? ` — ${data.reasonOtherText}` : ""}</p>
            {data.notes && <p className="text-sm text-muted-foreground">{data.notes}</p>}
          </div>

          {data.evidencePhotos.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence Photos</p>
              <div className="flex flex-wrap gap-2">
                {data.evidencePhotos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.url} alt="Return evidence" className="size-20 rounded-lg border object-cover" />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refund</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Refund Amount</span>
              <span className="font-semibold">{formatCurrency(data.requestedRefundAmount, currency)}</span>
            </div>
            {data.refundMethod && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Refund Method</span>
                <span className="font-medium">{REFUND_METHOD_LABELS[data.refundMethod as RefundMethod]}</span>
              </div>
            )}
            {data.refundReference && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-medium">{data.refundReference}</span>
              </div>
            )}
            {status === "REFUND_FAILED" && data.refundFailedReason && (
              <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="size-3.5 shrink-0" /> {data.refundFailedReason}
              </p>
            )}
            {status === "RETURN_REJECTED" && data.rejectionReason && (
              <p className="text-sm text-red-600 dark:text-red-400">{data.rejectionReason}</p>
            )}
          </div>

          <ReturnTimeline createdAt={data.createdAt} statusEvents={data.statusEvents} />
        </div>

        {(canApprove || canReject || canMarkItemReturned || canProcessRefund || canMarkFailed) && (
          <div className="sticky bottom-0 border-t bg-background px-3 py-3 sm:px-4">
            <div className="mx-auto flex max-w-[620px] flex-wrap gap-2">
              {canReject && (
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRejectOpen(true)}>
                  <X className="size-4" /> Reject
                </Button>
              )}
              {canApprove && (
                <Button className="flex-1" disabled={busy} onClick={() => runAction({ action: "approve" }, "Return approved")}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve Return
                </Button>
              )}
              {canMarkItemReturned && (
                <Button
                  className="flex-1"
                  disabled={busy}
                  onClick={() => {
                    setItemConditions(Object.fromEntries(data.items.map((i) => [i.id, "RESELLABLE" as ReturnItemCondition])));
                    setConditionOpen(true);
                  }}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} Mark Item Returned
                </Button>
              )}
              {canMarkFailed && (
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setFailOpen(true)}>
                  <AlertTriangle className="size-4" /> Refund Failed
                </Button>
              )}
              {canProcessRefund && (
                <Button className="flex-1" disabled={busy} onClick={() => setRefundOpen(true)}>
                  <Wallet className="size-4" /> Process Refund
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this return?</DialogTitle>
            <DialogDescription>The customer will see this reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              className={cn(buttonVariants({ variant: "default" }), "bg-destructive text-white hover:bg-destructive/90")}
              disabled={busy || !rejectReason.trim()}
              onClick={async () => {
                if (await runAction({ action: "reject", reason: rejectReason.trim() }, "Return rejected")) {
                  setRejectOpen(false);
                  setRejectReason("");
                }
              }}
            >
              Reject Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Record how you refunded {formatCurrency(data.requestedRefundAmount, currency)} to the customer. There is no
              payment gateway integration — this only records what actually happened.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Refund Method</Label>
              <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as RefundMethod)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue>{REFUND_METHOD_LABELS[refundMethod]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {REFUND_METHODS.map((m) => (
                    <SelectItem key={m} value={m} disabled={m === "WALLET" && !data.customerId}>
                      {REFUND_METHOD_LABELS[m]}
                      {m === "WALLET" && !data.customerId ? " (no customer account)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference (optional)</Label>
              <Input value={refundReference} onChange={(e) => setRefundReference(e.target.value)} placeholder="UPI txn id, etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  await runAction(
                    { action: "process_refund", refundMethod, refundReference: refundReference.trim() || undefined, note: refundNote.trim() || undefined },
                    "Refund recorded"
                  )
                ) {
                  setRefundOpen(false);
                  setRefundReference("");
                  setRefundNote("");
                  router.refresh();
                }
              }}
            >
              Mark Refunded
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={conditionOpen} onOpenChange={setConditionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Item Returned</DialogTitle>
            <DialogDescription>
              Set each item&apos;s condition — Resellable restocks it, anything else logs a Loss &amp; Damage record instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {data.items.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <Label className="text-xs">{item.productName} × {item.quantity}</Label>
                <Select
                  value={itemConditions[item.id] ?? "RESELLABLE"}
                  onValueChange={(v) => setItemConditions((prev) => ({ ...prev, [item.id]: v as ReturnItemCondition }))}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue>{RETURN_ITEM_CONDITION_LABELS[itemConditions[item.id] ?? "RESELLABLE"]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_ITEM_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>{RETURN_ITEM_CONDITION_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConditionOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const items = data.items.map((i) => ({ id: i.id, condition: itemConditions[i.id] ?? "RESELLABLE" }));
                if (await runAction({ action: "mark_item_returned", items }, "Item marked returned")) {
                  setConditionOpen(false);
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark refund as failed?</DialogTitle>
            <DialogDescription>You can retry processing the refund afterward.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea value={failReason} onChange={(e) => setFailReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              className={cn(buttonVariants({ variant: "default" }), "bg-destructive text-white hover:bg-destructive/90")}
              disabled={busy || !failReason.trim()}
              onClick={async () => {
                if (await runAction({ action: "mark_refund_failed", reason: failReason.trim() }, "Marked as failed")) {
                  setFailOpen(false);
                  setFailReason("");
                }
              }}
            >
              Mark Failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
