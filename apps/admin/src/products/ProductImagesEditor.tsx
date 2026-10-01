import type { ProductImage } from "@kiranabar/types";
import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { inputClass } from "../lib/ui";
import { addProductImage, removeProductImage } from "./api";

export function ProductImagesEditor({
  productId,
  images,
  onChange,
}: {
  productId: string;
  images: ProductImage[];
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addProductImage(productId, { url, altText: altText || undefined, isPrimary });
      setUrl("");
      setAltText("");
      setIsPrimary(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add image");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(imageId: string): Promise<void> {
    setError(null);
    try {
      await removeProductImage(productId, imageId);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove image");
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Images</h3>

      {images.length > 0 && (
        <ul className="mb-4 divide-y divide-gray-100 border-y border-gray-100">
          {images.map((image) => (
            <li key={image.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate text-sm text-gray-700">
                {image.url} {image.isPrimary && <span className="text-gray-400">(primary)</span>}
              </span>
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleRemove(image.id)}
                className="shrink-0"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {images.length === 0 && <p className="mb-4 text-sm text-gray-500">No images yet.</p>}

      <form onSubmit={(event) => void handleAdd(event)} className="flex flex-wrap items-end gap-4">
        <div className="w-72">
          <Field label="Image URL" htmlFor="image-url" required>
            <input
              id="image-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              className={inputClass}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Alt text" htmlFor="image-alt">
            <input
              id="image-alt"
              type="text"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(event) => setIsPrimary(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Primary
        </label>
        <Button type="submit" disabled={submitting}>
          Add image
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
