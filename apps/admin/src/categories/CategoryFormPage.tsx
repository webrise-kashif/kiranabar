import type { Category, CategoryStatus } from "@kiranabar/types";
import { createCategorySchema, updateCategorySchema } from "@kiranabar/validation";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { useCategoryOptions } from "../lib/use-category-options";
import { inputClass } from "../lib/ui";
import { createCategory, fetchCategory, updateCategory } from "./api";

const STATUS_OPTIONS: CategoryStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

interface FormState {
  name: string;
  slug: string;
  description: string;
  status: CategoryStatus;
  parentId: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  status: "DRAFT",
  parentId: "",
};

function toFormState(category: Category): FormState {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    status: category.status,
    parentId: category.parentId ?? "",
  };
}

function orUndefined(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}

export function CategoryFormPage() {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id;
  const navigate = useNavigate();
  const { options: allCategories } = useCategoryOptions();
  const parentOptions = allCategories.filter((category) => category.id !== id);

  const [category, setCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isCreate) return;
    let cancelled = false;

    fetchCategory(id).then(
      (result) => {
        if (!cancelled) {
          setCategory(result);
          setForm(toFormState(result));
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load category");
        }
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
        const input = createCategorySchema.parse({
          name: form.name,
          slug: form.slug,
          description: orUndefined(form.description),
          status: form.status,
          parentId: orUndefined(form.parentId),
        });
        const created = await createCategory(input);
        await navigate("/categories", {
          state: { message: `Category "${created.name}" created.` },
        });
      } else {
        const input = updateCategorySchema.parse({
          name: form.name,
          slug: form.slug,
          // An emptied optional field is sent as null (clear it); omitting it
          // would leave the stored value unchanged.
          description: orUndefined(form.description) ?? null,
          status: form.status,
          parentId: orUndefined(form.parentId) ?? null,
        });
        const updated = await updateCategory(id, input);
        setCategory(updated);
        setForm(toFormState(updated));
        setSaved(true);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save category");
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

  if (!isCreate && !category) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <>
      <PageHeader title={isCreate ? "New category" : `Edit ${category?.name}`} />

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="category-name" required>
            <input
              id="category-name"
              type="text"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Slug" htmlFor="category-slug" required>
            <input
              id="category-slug"
              type="text"
              value={form.slug}
              onChange={(event) => updateField("slug", event.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="category-description">
              <textarea
                id="category-description"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Status" htmlFor="category-status-field">
            <select
              id="category-status-field"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as CategoryStatus)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parent category" htmlFor="category-parent">
            <select
              id="category-parent"
              value={form.parentId}
              onChange={(event) => updateField("parentId", event.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={submitting}>
            {isCreate ? "Create category" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-green-600">Saved.</p>}
        </div>
        {submitError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {submitError}
          </p>
        )}
      </form>
    </>
  );
}
