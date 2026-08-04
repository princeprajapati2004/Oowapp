import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ExtractedItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  category: z.string(),
  foodType: z.enum(["VEG", "NON_VEG", "EGG", "NA"]),
  gstNote: z.string().nullable(),
  isCombo: z.boolean(),
  offerNote: z.string().nullable(),
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
- isCombo: true if the item is explicitly a bundle/combo/meal/thali of multiple things sold as one item (e.g. "Combo Meal", "Thali", "Burger + Fries + Coke"), false otherwise.
- offerNote: if the source shows a promotional call-out for this item (e.g. "20% OFF", "Buy 1 Get 1", "Happy Hour price"), capture that as short free text. Otherwise null. Do not invent an offer that isn't shown.
- confidence: "low" if the name or price was hard to read (messy handwriting, blurry photo, smudged print) or you had to guess; "high" otherwise.

Do not skip items because a price is missing — extract the item with price: null rather than dropping it.
Do not invent items that aren't in the source.`;

// Gemini's responseSchema is a plain JSON-schema-shaped object, not a zod
// schema — kept in sync with ExtractionResultSchema above by hand.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          price: { type: "number", nullable: true },
          category: { type: "string" },
          foodType: { type: "string", enum: ["VEG", "NON_VEG", "EGG", "NA"] },
          gstNote: { type: "string", nullable: true },
          isCombo: { type: "boolean" },
          offerNote: { type: "string", nullable: true },
          confidence: { type: "string", enum: ["high", "low"] },
        },
        required: ["name", "description", "price", "category", "foodType", "gstNote", "isCombo", "offerNote", "confidence"],
      },
    },
  },
  required: ["items"],
} as const;

// Stable, currently-recommended model for multimodal (image/PDF) understanding
// with structured JSON output. The 2.5 series is being retired (Oct 2026) —
// check https://ai.google.dev/gemini-api/docs/models before changing this.
const MODEL = "gemini-3.6-flash";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI menu import isn't configured yet — add GEMINI_API_KEY to the server environment."
    );
  }
  return new GoogleGenAI({ apiKey });
}

type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function runExtraction(parts: ContentPart[]) {
  const client = getClient();

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    throw new Error("Gemini declined to process this file. Try a different file or crop out sensitive content.");
  }
  if (finishReason === "MAX_TOKENS") {
    throw new Error("This menu has too many items to extract in one go — try splitting it into smaller files.");
  }

  const text = response.text;
  if (!text) {
    throw new Error("Couldn't read structured menu data from the response — try again.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Couldn't read structured menu data from the response — try again.");
  }

  const result = ExtractionResultSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error("Couldn't read structured menu data from the response — try again.");
  }

  return result.data.items;
}

// Gemini's actual supported input set — notably no image/gif (unlike the old
// Claude integration), but it does understand HEIC/HEIF directly, which
// matters since that's the default photo format on iPhones.
const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export function isSupportedImageType(mediaType: string): mediaType is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

export async function extractMenuItemsFromImage(base64Data: string, mediaType: ImageMediaType) {
  return runExtraction([
    { inlineData: { mimeType: mediaType, data: base64Data } },
    { text: "Extract every menu item from this photo." },
  ]);
}

export async function extractMenuItemsFromPdf(base64Data: string) {
  return runExtraction([
    { inlineData: { mimeType: "application/pdf", data: base64Data } },
    { text: "Extract every menu item from this PDF menu." },
  ]);
}

export async function extractMenuItemsFromText(text: string) {
  return runExtraction([{ text: `Extract every menu item from this text listing:\n\n${text}` }]);
}
