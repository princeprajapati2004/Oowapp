import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies a Firebase Auth ID token server-side WITHOUT the firebase-admin
// SDK / a service account credential — Firebase ID tokens are standard
// RS256-signed JWTs, checkable against Google's own public JWKS the same
// way this app already verifies its own JWTs via `jose`. Avoids needing a
// second, genuinely-secret credential just to confirm "this phone number
// was really verified by Firebase."
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return jwks;
}

export class FirebaseTokenError extends Error {}

/**
 * Verifies a Firebase Phone-Auth ID token and returns the verified phone
 * number in the same bare-digit format (no leading "+") the rest of this
 * app already stores customer phone numbers in.
 */
export async function verifyFirebasePhoneToken(idToken: string, projectId: string): Promise<string> {
  if (!projectId) throw new FirebaseTokenError("Firebase project id is not configured.");

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, getJwks(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }));
  } catch {
    throw new FirebaseTokenError("Invalid or expired verification token.");
  }

  const phoneNumber = payload.phone_number;
  if (typeof phoneNumber !== "string" || !phoneNumber) {
    throw new FirebaseTokenError("This verification token has no verified phone number.");
  }
  // Firebase returns E.164 ("+919377033744") — strip the leading "+" to match
  // the bare-digit convention used everywhere else in this app (order.customerPhone,
  // buildWhatsAppUrl, the existing DB-OTP flow's phoneSchema, etc.).
  return phoneNumber.replace(/^\+/, "");
}
