import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSession, type CustomerSessionPayload } from "@/lib/customer-auth";
import { UnauthorizedError } from "@/lib/session";

// Most customer-facing pages are public by design (browse and order as a
// guest), so "not logged in" is usually a normal state to branch on rather
// than an error — use this directly for those. requireCustomerSession below
// is only for the handful of surfaces (the wallet) that have no guest mode
// at all, since a guest has no wallet to look up.
export async function getCustomerSession(): Promise<CustomerSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyCustomerSession(token);
}

export async function requireCustomerSession(): Promise<CustomerSessionPayload> {
  const session = await getCustomerSession();
  if (!session) throw new UnauthorizedError("Please log in to continue");
  return session;
}
