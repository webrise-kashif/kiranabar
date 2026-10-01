import type { Category, CategoryStatus } from "@kiranabar/types";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { LinkButton } from "../components/LinkButton";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { Table, TableBody, TableHead, Td, Th, Tr } from "../components/Table";
import { Toast } from "../components/Toast";
import { catalogStatusTone } from "../lib/status-tones";
import { usePaginatedList } from "../lib/use-paginated-list";
import { useFlashMessage } from "../lib/use-flash-message";
import { inputClass } from "../lib/ui";
import { archiveCategory, deleteCategory } from "./api";

const STATUS_OPTIONS: CategoryStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];
const PAGE_SIZE = 20;

export function CategoriesListPage() {
  const flashMessage = useFlashMessage();
  const [toastMessage, setToastMessage] = useState<string | null>(flashMessage);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CategoryStatus | "">("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = usePaginatedList<Category>("/categories", {
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
  });

  async function handleArchive(category: Category): Promise<void> {
    setActionError(null);
    try {
      await archiveCategory(category.id);
      setToastMessage(`Category "${category.name}" archived.`);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to archive category");
    }
  }

  async function handleDelete(category: Category): Promise<void> {
    if (!window.confirm(`Permanently delete "${category.name}"? This cannot be undone.`)) {
      return;
    }

    setActionError(null);
    try {
      await deleteCategory(category.id);
      setToastMessage(`Category "${category.name}" deleted.`);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  return (
    <>
      <PageHeader
        title="Categories"
        action={<LinkButton to="/categories/new">New category</LinkButton>}
      />

      <div className="mb-4 w-48">
        <Field label="Status" htmlFor="category-status">
          <select
            id="category-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CategoryStatus | "");
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {actionError}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th>Status</Th>
                <Th>Parent</Th>
                <Th />
              </tr>
            </TableHead>
            <TableBody>
              {data.items.map((category) => (
                <Tr key={category.id}>
                  <Td className="font-medium text-gray-900">
                    <Link
                      to={`/categories/${category.id}`}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      {category.name}
                    </Link>
                  </Td>
                  <Td>{category.slug}</Td>
                  <Td>
                    <Badge tone={catalogStatusTone(category.status)}>{category.status}</Badge>
                  </Td>
                  <Td>{category.parentId ? "Yes" : "—"}</Td>
                  <Td>
                    <div className="flex gap-2">
                      {category.status !== "ARCHIVED" && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => void handleArchive(category)}
                        >
                          Archive
                        </Button>
                      )}
                      {category.status === "ARCHIVED" && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => void handleDelete(category)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
          {data.items.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">No categories found.</p>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
