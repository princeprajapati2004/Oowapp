/**
 * Colors for the sticky bottom action bar's status-driven buttons only
 * (Confirm/Cancel/Start Preparing/Mark Ready/.../Print/Share). Everything
 * else on the Order Details page (cards, borders, text) intentionally uses
 * the app's own theme tokens (bg-card, text-muted-foreground, etc.) so it
 * matches the rest of the admin dashboard, including dark mode — these are
 * the one deliberate exception: each workflow action keeps a fixed,
 * distinct hue so the footer reads at a glance regardless of theme.
 */
export const orderDetailColors = {
  successGreen: "#00A86B",
  whatsappGreen: "#20D366",
  dangerRed: "#F04444",
  primaryBlue: "#2864E8",
  purple: "#8B5CF6",
  orange: "#FFA000",
  deliveryOrange: "#FF6B16",
  teal: "#16B8A6",
  darkNavy: "#1E2A3D",
} as const;

/** Shared button chrome for the sticky bottom action bar's two buttons. */
export const actionButtonBase =
  "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-bold leading-tight text-center transition-colors disabled:opacity-60 disabled:pointer-events-none";
