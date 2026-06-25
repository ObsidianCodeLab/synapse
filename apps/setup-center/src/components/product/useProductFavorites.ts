import { useCallback, useState } from "react";
import { readProductFavorites, writeProductFavorites } from "./productFavorites";

export function useProductFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => readProductFavorites());

  const isFavorite = useCallback((productId: string) => favoriteIds.has(productId), [favoriteIds]);

  const toggleFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      writeProductFavorites(next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      if (!prev.has(productId)) return prev;
      const next = new Set(prev);
      next.delete(productId);
      writeProductFavorites(next);
      return next;
    });
  }, []);

  return { favoriteIds, isFavorite, toggleFavorite, removeFavorite } as const;
}
