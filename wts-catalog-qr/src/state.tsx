import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadCart, saveCart, upsertLine, removeLine } from './lib/cart';
import { loadCatalog } from './lib/catalog';
import type { CartLine, CatalogState } from './types';

type Ctx = {
  catalog: CatalogState | null;
  loading: boolean;
  lines: CartLine[];
  add: (line: CartLine) => void;
  update: (line: CartLine) => void;
  remove: (slug: string, optionKey: string | null) => void;
  clear: () => void;
};

const CatalogCtx = createContext<Ctx | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<CartLine[]>(() => loadCart());

  useEffect(() => {
    let cancelled = false;
    loadCatalog().then((state) => {
      if (!cancelled) {
        setCatalog(state);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveCart(lines);
  }, [lines]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.slug === line.slug && (l.option_key || null) === (line.option_key || null));
      if (existing) return upsertLine(prev, { ...line, qty: existing.qty + line.qty });
      return upsertLine(prev, line);
    });
  }, []);

  const update = useCallback((line: CartLine) => {
    setLines((prev) => upsertLine(prev, line));
  }, []);

  const remove = useCallback((slug: string, optionKey: string | null) => {
    setLines((prev) => removeLine(prev, slug, optionKey));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ catalog, loading, lines, add, update, remove, clear }),
    [catalog, loading, lines, add, update, remove, clear],
  );

  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogCtx);
  if (!ctx) throw new Error('useCatalog must be used inside CatalogProvider');
  return ctx;
}
