import type { Order } from "@kiranabar/types";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Badge } from "../components/Badge";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { Table, TableBody, TableHead, Td, Th, Tr } from "../components/Table";
import { orderStatusTone } from "../lib/status-tones";
import { usePaginatedList } from "../lib/use-paginated-list";
import { inputClass } from "../lib/ui";

const PAGE_SIZE = 20;

/** Admin-wide order list -- every order, optionally scoped to one customer via ?userId=. */
export function OrdersListPage() {
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("userId") ?? "";

  const { data, loading, error } = usePaginatedList<Order>("/orders", {
    page,
    pageSize: PAGE_SIZE,
    userId: userId || undefined,
  });

  return (
    <>
      <PageHeader title="Orders" />

      <div className="mb-4 w-80">
        <Field label="Customer user ID" htmlFor="order-user-id">
          <input
            id="order-user-id"
            type="text"
            value={userId}
            onChange={(event) => {
              const value = event.target.value;
              setSearchParams(value ? { userId: value } : {});
              setPage(1);
            }}
            placeholder="Leave blank for every order"
            className={inputClass}
          />
        </Field>
      </div>

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
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th>Subtotal</Th>
                <Th />
              </tr>
            </TableHead>
            <TableBody>
              {data.items.map((order) => (
                <Tr key={order.id}>
                  <Td>{new Date(order.createdAt).toLocaleString()}</Td>
                  <Td>
                    <Badge tone={orderStatusTone(order.status)}>{order.status}</Badge>
                  </Td>
                  <Td>
                    {order.subtotal} {order.currency}
                  </Td>
                  <Td>
                    <Link
                      to={`/orders/${order.id}`}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      View
                    </Link>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
          {data.items.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">No orders found.</p>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
