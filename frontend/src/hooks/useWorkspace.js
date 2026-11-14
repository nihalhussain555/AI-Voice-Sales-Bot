// The workspace is the part of the console that belongs to an account rather
// than a device: which product the agent pitches, and the custom products this
// user authored. It used to live in localStorage, so two accounts on one
// machine overwrote each other. Everything here goes through /api/workspace.

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../services/api.js';

export const WORKSPACE_KEY = ['workspace'];

export function useWorkspace() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: WORKSPACE_KEY, queryFn: api.workspace });

  const settings = query.data?.settings;
  const customProducts = settings?.customProducts || [];

  const write = useCallback((next) => {
    queryClient.setQueryData(WORKSPACE_KEY, (prev) =>
      prev ? { ...prev, settings: { ...prev.settings, ...next } } : prev
    );
  }, [queryClient]);

  // Product choice is a two-key write with no useful offline guess, so it is
  // optimistic against the cache and simply refetches if the server disagrees.
  const selectProductMutation = useMutation({
    mutationFn: (productKey) => api.saveWorkspace({ productKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY })
  });

  const addProductMutation = useMutation({
    mutationFn: (product) => api.addCustomProduct(product),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY })
  });

  const removeProductMutation = useMutation({
    mutationFn: (id) => api.removeCustomProduct(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY })
  });

  // The mutation *objects* are new every render, but their mutate/mutateAsync
  // functions are stable — so the callbacks handed to pages are built from
  // those. Depending on the object would re-fire every effect that lists
  // selectProduct as a dependency.
  const saveKey = selectProductMutation.mutate;
  const addOne = addProductMutation.mutateAsync;
  const removeOne = removeProductMutation.mutateAsync;

  const selectProduct = useCallback((product) => {
    if (!product) return;
    write({ productKey: product.id });
    saveKey(product.id);
  }, [write, saveKey]);

  const addCustomProduct = useCallback(async (draft) => {
    const data = await addOne(draft);
    return data.product;
  }, [addOne]);

  const removeCustomProduct = useCallback((id) => removeOne(id), [removeOne]);

  return useMemo(() => ({
    isLoading: query.isLoading,
    error: query.error,
    settings,
    productKey: settings?.productKey || null,
    customProducts,
    maxCustomProducts: query.data?.limits?.maxCustomProducts ?? 10,
    selectProduct,
    addCustomProduct,
    removeCustomProduct,
    saving: selectProductMutation.isPending || addProductMutation.isPending || removeProductMutation.isPending,
    saveError: selectProductMutation.error || addProductMutation.error || removeProductMutation.error
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the three mutation
    // objects are read for isPending/error only; their identity churns per render.
  }), [
    query.isLoading, query.error, query.data, settings, customProducts,
    selectProduct, addCustomProduct, removeCustomProduct,
    selectProductMutation.isPending, addProductMutation.isPending, removeProductMutation.isPending,
    selectProductMutation.error, addProductMutation.error, removeProductMutation.error
  ]);
}
