import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const ExtractedItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  category: z.string(),
  foodType: z.enum(["VEG", "NON_VEG", "EGG", "NA"]),
  gstNote: z.string().nullable(),
  confidence: z.enum(["high", "low"]),
});

const ExtractionResultSchema = z.object({
  items: z.array(ExtractedItemSchema),
});

export type ExtractedMenuItem = z.infer<typeof ExtractedItemSchema>;

const SYSTEM_PROMPT = `You extract menu items from a restaurant/cafe/store menu source (a photo of a
handwritten or printed menu, a menu PDF, or a plain text listing).

For every distinct sellable item you find:
- name: the item's name, cleaned up (fix obvious OCR/spelling slips, keep the owner's wording otherwise).
- description: any accompanying description text, or null if none.
- price: the price as a plain number with no currency symbol. If a range is given, use the lower value. If truly unreadable or absent, use null.
- category: the section/group the item belongs to (e.g. "Starters", "Main Course", "Beverages", "Desserts"). Use the source's own section headers when present; otherwise infer a sensible grouping.
- foodType: "VEG", "NON_VEG", or "EGG" if a green/red/brown dot marker, explicit label, or the dish itself makes it clear (e.g. "Chicken Biryani" is NON_VEG, "Egg Fried Rice" is EGG). Use "NA" only when genuinely ambiguous (e.g. a beverage or a dessert with no meat/egg content and no marker).
- gstNote: if the source explicitly shows a tax/GST rate near the item or its section (e.g. "5% GST"), capture that as short free text. Otherwise null. This is informational only — do not invent a rate that isn't shown.
- confidence: "low" if the name or price was hard to read (messy handwriting, blurry photo, smudged print) or you had to guess; "high" otherwise.

Do not skip items because a price is missing — extract the item with price: null rather than dropping it.
Do not invent items that aren't in the source.`;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI menu import isn't configured yet — add ANTHROPIC_API_KEY to the server environment."
    );
  }
  return new Anthropic({ apiKey });
}

async function runExtraction(userContent: Anthropic.MessageParam["content"]) {
  const client = getClient();

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(ExtractionResultSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to process this file. Try a different file or crop out sensitive content.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("This menu has too many items to extract in one go — try splitting it into smaller files.");
  }
  if (!response.parsed_output) {
    throw new Error("Couldn't read structured menu data from the response — try again.");
  }

  return response.parsed_output.items;
}

const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export function isSupportedImageType(mediaType: string): mediaType is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

export async function extractMenuItemsFromImage(base64Data: string, mediaType: ImageMediaType) {
  return runExtraction([
    {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64Data },
    },
    { type: "text", text: "Extract every menu item from this photo." },
  ]);
}

export async function extractMenuItemsFromPdf(base64Data: string) {
  return runExtraction([
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64Data },
    },
    { type: "text", text: "Extract every menu item from this PDF menu." },
  ]);
}

export async function extractMenuItemsFromText(text: string) {
  return runExtraction([
    {
      type: "text",
      text: `Extract every menu item from this text listing:\n\n${text}`,
    },
  ]);
}
