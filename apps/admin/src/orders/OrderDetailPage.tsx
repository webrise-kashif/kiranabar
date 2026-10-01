import type { Order, OrderStatus } from "@kiranabar/types";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Table, TableBody, TableHead, Td, Th, Tr } from "../components/Table";
import { orderStatusTone } from "../lib/status-tones";
import { fetchOrder, updateOrderStatus } from "./api";
import { NEXT_STATUS } from "./status";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    fetchOrder(id).then(
      (result) => {
        if (!cancelled) setOrder(result);
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load order");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleAdvance(nextStatus: OrderStatus): Promise<void> {
    if (!id) return;
    setAdvanceError(null);
    setAdvancing(true);
    try {
      const updated = await updateOrderStatus(id, nextStatus);
      setOrder(updated);
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : "Failed to update order status");
    } finally {
      setAdvancing(false);
    }
  }

  if (loadError)
    return (
      <p role="alert" className="text-sm text-red-600">
        {loadError}
      </p>
    );
  if (!order) return <p className="text-sm text-gray-500">Loading…</p>;

  const nextStatus = NEXT_STATUS[order.status];

  return (
    <>
      <PageHeader title={`Order ${order.id}`} />

      <div className="mb-6 flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Status</p>
          <Badge tone={orderStatusTone(order.status)}>{order.status}</Badge>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Subtotal</p>
          <p className="text-sm text-gray-900">
            {order.subtotal} {order.currency}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Placed</p>
          <p className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        {nextStatus && (
          <Button
            type="button"
            disabled={advancing}
            onClick={() => void handleAdvance(nextStatus)}
            className="ml-auto"
          >
            Advance to {nextStatus}
          </Button>
        )}
      </div>
      {advanceError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {advanceError}
        </p>
      )}

      <h3 className="mb-3 text-sm font-semibold text-gray-900">Items</h3>
      <Table>
        <TableHead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th>Unit price</Th>
            <Th>Qty</Th>
            <Th>Line total</Th>
          </tr>
        </TableHead>
        <TableBody>
          {order.items.map((item) => (
            <Tr key={item.productId}>
              <Td className="font-medium text-gray-900">{item.productName}</Td>
              <Td>{item.productSku}</Td>
              <Td>{item.unitPrice}</Td>
              <Td>{item.quantity}</Td>
              <Td>{item.lineTotal}</Td>
            </Tr>
          ))}
        </TableBody>
      </Table>

      <h3 className="mt-6 mb-3 text-sm font-semibold text-gray-900">Shipping address</h3>
      <address className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 not-italic shadow-sm">
        {order.shippingAddress.recipientName}
        <br />
        {order.shippingAddress.line1}
        <br />
        {order.shippingAddress.line2 && (
          <>
            {order.shippingAddress.line2}
            <br />
          </>
        )}
        {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
        {order.shippingAddress.postalCode}
        <br />
        {order.shippingAddress.country}
        {order.shippingAddress.phone && <> · {order.shippingAddress.phone}</>}
      </address>
    </>
  );
}
