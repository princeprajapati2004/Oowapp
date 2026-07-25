import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSession, type CustomerSessionPayload } from "@/lib/customer-auth";

// No `requireCustomerSession` here — customer-facing pages are public by
// design (browse and order as a guest), so "not logged in" is a normal state
// to branch on, not an error to throw.
export async function getCustomerSession(): Promise<CustomerSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyCustomerSession(token);
}
