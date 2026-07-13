import type { Product, Category, Tax, Shop } from "@/generated/prisma/client";

export type CustomerProduct = Omit<Product, "price"> & { price: number };
export type CustomerTax = Omit<Tax, "value"> & { value: number };
export type CustomerCategory = Category;
export type CustomerShop = Shop;
