import type { ProductVariant } from "@kiranabar/types";
import { STORE_CURRENCY } from "@kiranabar/validation";
import { useState, type FormEvent } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Toast } from "../components/Toast";
import { catalogStatusTone } from "../lib/status-tones";
import { inputClass } from "../lib/ui";
import { ProductInventoryEditor } from "./ProductInventoryEditor";
import { archiveProductVariant, createProductVariant, deleteProductVariant } from "./api";

interface AttributeRow {
  key: string;
  value: string;
}

function formatAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

export function ProductVariantsEditor({
  productId,
  variants,
  onChange,
}: {
  productId: string;
  variants: ProductVariant[];
  onChange: () => void;
}) {
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [attributeRows, setAttributeRows] = useState<AttributeRow[]>([{ key: "", value: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function updateAttributeRow(index: number, field: keyof AttributeRow, value: string): void {
    setAttributeRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function addAttributeRow(): void {
    setAttributeRows((rows) => [...rows, { key: "", value: "" }]);
  }

  function removeAttributeRow(index: number): void {
    setAttributeRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const attributes = Object.fromEntries(
      attributeRows
        .map((row) => [row.key.trim(), row.value.trim()] as const)
        .filter(([key, value]) => key && value),
    );

    if (Object.keys(attributes).length === 0) {
      setError("At least one attribute (e.g. Color) is required");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createProductVariant(productId, {
        sku,
        price,
        salePrice: salePrice || undefined,
        currency: STORE_CURRENCY,
        attributes,
        status: "ACTIVE",
        initialQuantity: Number(initialQuantity),
      });
      setSku("");
      setPrice("");
      setSalePrice("");
      setInitialQuantity("0");
      setAttributeRows([{ key: "", value: "" }]);
      setToastMessage(`Variant "${created.sku}" created.`);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create variant");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(variant: ProductVariant): Promise<void> {
    setError(null);
    try {
      await archiveProductVariant(productId, variant.id);
      setToastMessage(`Variant "${variant.sku}" archived.`);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive variant");
    }
  }

  async function handleDelete(variant: ProductVariant): Promise<void> {
    if (!window.confirm(`Permanently delete "${variant.sku}"? This cannot be undone.`)) {
      return;
    }

    setError(null);
    try {
      await deleteProductVariant(productId, variant.id);
      setToastMessage(`Variant "${variant.sku}" deleted.`);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete variant");
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Variants</h3>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {variants.length > 0 && (
        <ul className="mb-6 flex flex-col gap-4">
          {variants.map((variant) => (
            <li key={variant.id} className="rounded-md border border-gray-100 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {variant.sku}{" "}
                    <span className="font-normal text-gray-500">
                      ({formatAttributes(variant.attributes)})
                    </span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {variant.salePrice ?? variant.price} {variant.currency}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={catalogStatusTone(variant.status)}>{variant.status}</Badge>
                  {variant.status !== "ARCHIVED" && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => void handleArchive(variant)}
                    >
                      Archive
                    </Button>
                  )}
                  {variant.status === "ARCHIVED" && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => void handleDelete(variant)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <ProductInventoryEditor productId={productId} variantId={variant.id} />
            </li>
          ))}
        </ul>
      )}
      {variants.length === 0 && <p className="mb-4 text-sm text-gray-500">No variants yet.</p>}

      <form onSubmit={(event) => void handleAdd(event)} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <Field label="SKU" htmlFor="variant-sku" required>
              <input
                id="variant-sku"
                type="text"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                required
                className={inputClass}
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Price" htmlFor="variant-price" required>
              <input
                id="variant-price"
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="24.99"
                required
                className={inputClass}
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Sale price" htmlFor="variant-sale-price">
              <input
                id="variant-sale-price"
                type="text"
                inputMode="decimal"
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
                placeholder="19.99"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="w-24">
            <Field label="Currency" htmlFor="variant-currency" required>
              {/* Fixed to the single store currency -- see STORE_CURRENCY. */}
              <input
                id="variant-currency"
                type="text"
                value={STORE_CURRENCY}
                readOnly
                className={inputClass}
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Initial quantity" htmlFor="variant-initial-quantity">
              <input
                id="variant-initial-quantity"
                type="number"
                min={0}
                value={initialQuantity}
                onChange={(event) => setInitialQuantity(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">
            Attributes<span className="text-red-600"> *</span>
          </p>
          <div className="flex flex-col gap-2">
            {attributeRows.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="w-40">
                  <Field label="Name" htmlFor={`variant-attribute-key-${index}`}>
                    <input
                      id={`variant-attribute-key-${index}`}
                      type="text"
                      placeholder="Color"
                      value={row.key}
                      onChange={(event) => updateAttributeRow(index, "key", event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="w-40">
                  <Field label="Value" htmlFor={`variant-attribute-value-${index}`}>
                    <input
                      id={`variant-attribute-value-${index}`}
                      type="text"
                      placeholder="Red"
                      value={row.value}
                      onChange={(event) => updateAttributeRow(index, "value", event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                {attributeRows.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => removeAttributeRow(index)}
                  >
                    &times;
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" className="mt-2" onClick={addAttributeRow}>
            Add attribute
          </Button>
        </div>

        <div>
          <Button type="submit" disabled={submitting}>
            Add variant
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
