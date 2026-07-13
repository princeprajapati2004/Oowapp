"use client";

import { useCallback, useEffect, useState } from "react";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  categoryId: string;
  quantity: number;
}

function storageKey(slug: string) {
  return `mykharcha_cart_${slug}`;
}

export function useCart(slug: string) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // localStorage is only available client-side, so the cart must be hydrated post-mount.
    try {
      const raw = localStorage.getItem(storageKey(slug));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore corrupt cart data
    }
    setHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKey(slug), JSON.stringify(items));
  }, [items, slug, hydrated]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { ...item, quantity }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.productId !== productId);
      return prev.map((i) => (i.productId === productId ? { ...i, quantity } : i));
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const quantityOf = useCallback(
    (productId: string) => items.find((i) => i.productId === productId)?.quantity ?? 0,
    [items]
  );

  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, hydrated, addItem, setQuantity, removeItem, clear, quantityOf, totalQuantity };
}
