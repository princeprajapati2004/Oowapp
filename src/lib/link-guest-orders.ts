import { db } from "@/lib/db";

// Orders placed as a guest (no session yet) are only ever findable via a
// device-local localStorage ref — once the same person logs into (or
// creates) an account, those past orders should show up in their real
// account history too. Identity here is the verified phone number, the
// same trust boundary every Customer row itself is already keyed on
// (shopId_phone unique constraint) — matches only orders still unlinked
// (customerId: null) so an already-linked order can never be reassigned.
export async function linkGuestOrdersToCustomer(shopId: string, customerId: string, phone: string) {
  await db.order.updateMany({
    where: { shopId, customerPhone: phone, customerId: null },
    data: { customerId },
  });
}
