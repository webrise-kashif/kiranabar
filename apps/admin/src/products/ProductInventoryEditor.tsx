import type { ProductInventory } from "@kiranabar/types";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { inputClass } from "../lib/ui";
import {
  adjustInventory,
  adjustVariantInventory,
  fetchInventory,
  fetchVariantInventory,
} from "./api";

/** Reused per-variant-row in ProductVariantsEditor -- pass variantId to point it at that variant's own stock instead of the product's. */
export function ProductInventoryEditor({
  productId,
  variantId,
}: {
  productId: string;
  variantId?: string;
}) {
  const [inventory, setInventory] = useState<ProductInventory | null>(null);
  const [quantityAvailable, setQuantityAvailable] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = variantId ? `inventory-available-${variantId}` : "inventory-available";

  useEffect(() => {
    let cancelled = false;

    const load = variantId
      ? fetchVariantInventory(productId, variantId)
      : fetchInventory(productId);

    load
      .then((inv) => {
        if (!cancelled) {
          setInventory(inv);
          setQuantityAvailable(String(inv.quantityAvailable));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load inventory");
      });

    return () => {
      cancelled = true;
    };
  }, [productId, variantId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!inventory) return;

    setError(null);
    setSubmitting(true);
    try {
      const input = { quantityAvailable: Number(quantityAvailable), version: inventory.version };
      const updated = variantId
        ? await adjustVariantInventory(productId, variantId, input)
        : await adjustInventory(productId, input);
      setInventory(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to adjust inventory -- refresh and retry",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!inventory) {
    return error ? (
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
    ) : (
      <p className="text-sm text-gray-500">Loading inventory…</p>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Inventory</h3>
      <p className="mb-4 text-sm text-gray-500">Reserved: {inventory.quantityReserved}</p>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex items-end gap-4">
        <div className="w-32">
          <Field label="Available" htmlFor={inputId}>
            <input
              id={inputId}
              type="number"
              min={0}
              value={quantityAvailable}
              onChange={(event) => setQuantityAvailable(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Button type="submit" disabled={submitting}>
          Update stock
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
