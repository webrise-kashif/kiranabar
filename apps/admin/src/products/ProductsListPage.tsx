import type { Product, ProductStatus } from "@kiranabar/types";
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
import { usePaginatedList } from "../lib/use-paginated-list";
import { useFlashMessage } from "../lib/use-flash-message";
import { inputClass } from "../lib/ui";
import { catalogStatusTone } from "../lib/status-tones";
import { archiveProduct, deleteProduct } from "./api";

const STATUS_OPTIONS: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];
const PAGE_SIZE = 20;

export function ProductsListPage() {
  const flashMessage = useFlashMessage();
  const [toastMessage, setToastMessage] = useState<string | null>(flashMessage);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = usePaginatedList<Product>("/products", {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
  });

  async function handleArchive(product: Product): Promise<void> {
    setActionError(null);
    try {
      await archiveProduct(product.id);
      setToastMessage(`Product "${product.name}" archived.`);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to archive product");
    }
  }

  async function handleDelete(product: Product): Promise<void> {
    if (!window.confirm(`Permanently delete "${product.name}"? This cannot be undone.`)) {
      return;
    }

    setActionError(null);
    try {
      await deleteProduct(product.id);
      setToastMessage(`Product "${product.name}" deleted.`);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete product");
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        action={<LinkButton to="/products/new">New product</LinkButton>}
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <div className="w-64">
          <Field label="Search" htmlFor="product-search">
            <input
              id="product-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Status" htmlFor="product-status">
            <select
              id="product-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ProductStatus | "");
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
      </form>

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
                <Th>SKU</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th>Stock</Th>
                <Th />
              </tr>
            </TableHead>
            <TableBody>
              {data.items.map((product) => (
                <Tr key={product.id}>
                  <Td className="font-medium text-gray-900">
                    <Link
                      to={`/products/${product.id}`}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      {product.name}
                    </Link>
                  </Td>
                  <Td>{product.sku}</Td>
                  <Td>{product.salePrice ?? product.price}</Td>
                  <Td>
                    <Badge tone={catalogStatusTone(product.status)}>{product.status}</Badge>
                  </Td>
                  <Td>{product.inventory?.quantityAvailable ?? "—"}</Td>
                  <Td>
                    <div className="flex gap-2">
                      {product.status !== "ARCHIVED" && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => void handleArchive(product)}
                        >
                          Archive
                        </Button>
                      )}
                      {product.status === "ARCHIVED" && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => void handleDelete(product)}
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
            <p className="mt-4 text-sm text-gray-500">No products found.</p>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
