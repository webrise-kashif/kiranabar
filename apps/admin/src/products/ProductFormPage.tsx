import type { Product, ProductStatus } from "@kiranabar/types";
import { createProductSchema, STORE_CURRENCY, updateProductSchema } from "@kiranabar/validation";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { useCategoryOptions } from "../lib/use-category-options";
import { inputClass } from "../lib/ui";
import { createProduct, fetchProduct, updateProduct } from "./api";
import { ProductImagesEditor } from "./ProductImagesEditor";
import { ProductInventoryEditor } from "./ProductInventoryEditor";
import { ProductVariantsEditor } from "./ProductVariantsEditor";

const STATUS_OPTIONS: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

interface FormState {
  name: string;
  slug: string;
  description: string;
  sku: string;
  price: string;
  salePrice: string;
  status: ProductStatus;
  categoryId: string;
  initialQuantity: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  sku: "",
  price: "",
  salePrice: "",
  status: "DRAFT",
  categoryId: "",
  initialQuantity: "0",
};

function toFormState(product: Product): FormState {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    sku: product.sku,
    price: product.price,
    salePrice: product.salePrice ?? "",
    status: product.status,
    categoryId: product.categoryId ?? "",
    initialQuantity: "0",
  };
}

function orUndefined(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id;
  const navigate = useNavigate();
  const { options: categories } = useCategoryOptions();

  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isCreate) return;
    let cancelled = false;

    fetchProduct(id).then(
      (result) => {
        if (!cancelled) {
          setProduct(result);
          setForm(toFormState(result));
        }
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load product");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id, isCreate]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      if (isCreate) {
        const input = createProductSchema.parse({
          name: form.name,
          slug: form.slug,
          description: orUndefined(form.description),
          sku: form.sku,
          price: form.price,
          salePrice: orUndefined(form.salePrice),
          currency: STORE_CURRENCY,
          status: form.status,
          categoryId: orUndefined(form.categoryId),
          initialQuantity: form.initialQuantity,
        });
        const created = await createProduct(input);
        await navigate("/products", { state: { message: `Product "${created.name}" created.` } });
      } else {
        const input = updateProductSchema.parse({
          name: form.name,
          slug: form.slug,
          // An emptied optional field is sent as null (clear it); omitting it
          // would leave the stored value unchanged.
          description: orUndefined(form.description) ?? null,
          sku: form.sku,
          price: form.price,
          salePrice: orUndefined(form.salePrice) ?? null,
          currency: STORE_CURRENCY,
          status: form.status,
          categoryId: orUndefined(form.categoryId) ?? null,
        });
        const updated = await updateProduct(id, input);
        setProduct(updated);
        setForm(toFormState(updated));
        setSaved(true);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isCreate && loadError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {loadError}
      </p>
    );
  }

  if (!isCreate && !product) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <>
      <PageHeader title={isCreate ? "New product" : `Edit ${product?.name}`} />

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="product-name" required>
            <input
              id="product-name"
              type="text"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Slug" htmlFor="product-slug" required>
            <input
              id="product-slug"
              type="text"
              value={form.slug}
              onChange={(event) => updateField("slug", event.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="product-description">
              <textarea
                id="product-description"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="SKU" htmlFor="product-sku" required>
            <input
              id="product-sku"
              type="text"
              value={form.sku}
              onChange={(event) => updateField("sku", event.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Currency" htmlFor="product-currency" required>
            {/* The store sells in one currency (see STORE_CURRENCY), so this is
                shown for clarity but isn't editable. */}
            <input
              id="product-currency"
              type="text"
              value={STORE_CURRENCY}
              readOnly
              className={inputClass}
            />
          </Field>
          <Field label="Price" htmlFor="product-price" required>
            <input
              id="product-price"
              type="text"
              inputMode="decimal"
              value={form.price}
              onChange={(event) => updateField("price", event.target.value)}
              placeholder="24.99"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Sale price" htmlFor="product-sale-price">
            <input
              id="product-sale-price"
              type="text"
              inputMode="decimal"
              value={form.salePrice}
              onChange={(event) => updateField("salePrice", event.target.value)}
              placeholder="19.99"
              className={inputClass}
            />
          </Field>
          <Field label="Status" htmlFor="product-status">
            <select
              id="product-status"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as ProductStatus)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="product-category">
            <select
              id="product-category"
              value={form.categoryId}
              onChange={(event) => updateField("categoryId", event.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          {isCreate && (
            <Field label="Initial quantity" htmlFor="product-initial-quantity">
              <input
                id="product-initial-quantity"
                type="number"
                min={0}
                value={form.initialQuantity}
                onChange={(event) => updateField("initialQuantity", event.target.value)}
                className={inputClass}
              />
            </Field>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={submitting}>
            {isCreate ? "Create product" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-green-600">Saved.</p>}
        </div>
        {submitError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {submitError}
          </p>
        )}
      </form>

      {product && (
        <div className="mt-6 flex max-w-2xl flex-col gap-6">
          <ProductImagesEditor
            productId={product.id}
            images={product.images}
            onChange={() => {
              void fetchProduct(product.id).then(setProduct);
            }}
          />
          <ProductInventoryEditor productId={product.id} />
          <ProductVariantsEditor
            productId={product.id}
            variants={product.variants}
            onChange={() => {
              void fetchProduct(product.id).then(setProduct);
            }}
          />
        </div>
      )}
    </>
  );
}
