export const BUSINESS_TYPES = [
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "GROCERY",
  "MEDICAL",
  "ELECTRONICS",
  "CLOTHING",
  "STORE",
  "OTHER",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  RESTAURANT: "Restaurant",
  CAFE: "Cafe / Tea Stall",
  BAKERY: "Bakery",
  GROCERY: "Grocery Shop",
  MEDICAL: "Medical Store",
  ELECTRONICS: "Electronics Shop",
  CLOTHING: "Clothing Shop",
  STORE: "General Store",
  OTHER: "Other Business",
};

/** Business types where a delivery address makes more sense than a table number by default. */
const DELIVERY_FIRST_TYPES: BusinessType[] = ["GROCERY", "MEDICAL", "ELECTRONICS", "CLOTHING", "STORE", "OTHER"];

/** Business types where food-specific fields (Veg/Non-Veg, food type, table QR) are relevant. */
const FOOD_BUSINESS_TYPES: BusinessType[] = ["RESTAURANT", "CAFE", "BAKERY"];

export function isDeliveryFirst(businessType: BusinessType) {
  return DELIVERY_FIRST_TYPES.includes(businessType);
}

/** Returns true for restaurant/cafe/bakery — enables food type field and table QR. */
export function isFoodBusiness(businessType: BusinessType) {
  return FOOD_BUSINESS_TYPES.includes(businessType);
}

/** Copy that changes by business type — never branch actual logic on this, only wording. */
export function businessTypeCopy(businessType: BusinessType) {
  const deliveryFirst = isDeliveryFirst(businessType);
  return {
    locationFieldLabel: deliveryFirst ? "Delivery Address" : "Table Number",
    menuLabel: deliveryFirst ? "Products" : "Menu",
    itemLabel: deliveryFirst ? "Product" : "Item",
    addToCartLabel: deliveryFirst ? "Add to Order" : "Add to Cart",
  };
}
