<script setup lang="ts">
import { ApiClientError } from "@kiranabar/api-client";
import type { ShippingAddress } from "@kiranabar/types";

const route = useRoute();
const orderId = computed(() => String(route.params.id));

const { getOrder } = useOrders();

// The order belongs to the signed-in session, so it's fetched in the browser
// (server: false) -- see pages/cart.vue. A 404 (unknown, or another
// customer's order) becomes null; a 401 (signed out) becomes "signed-out".
const { data: order, error } = useAsyncData(
  () => `order:${orderId.value}`,
  async () => {
    try {
      return await getOrder(orderId.value);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        return null;
      }
      if (err instanceof ApiClientError && err.status === 401) {
        return "signed-out" as const;
      }
      throw err;
    }
  },
  { server: false, lazy: true },
);

/** The address as display lines, skipping empty optional ones. */
function addressLines(address: ShippingAddress): string[] {
  return [
    address.recipientName,
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ].filter((part): part is string => Boolean(part));
}

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <p v-if="error" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load this order. Please try again.
    </p>

    <div v-else-if="order === 'signed-out'" class="py-16 text-center">
      <h1 class="text-2xl font-bold text-gray-900">Sign in to view this order</h1>
      <p class="mt-2 text-sm text-gray-500">Use the form at the top of the page.</p>
    </div>

    <div v-else-if="order === null" class="py-16 text-center">
      <h1 class="text-2xl font-bold text-gray-900">Order not found</h1>
      <NuxtLink
        to="/"
        class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
      >
        Back to shop
      </NuxtLink>
    </div>

    <p v-else-if="!order" class="py-16 text-center text-gray-500">Loading your order…</p>

    <div v-else>
      <h1 class="text-2xl font-bold tracking-tight text-gray-900">
        Thank you! Your order has been placed.
      </h1>
      <p class="mt-2 text-sm text-gray-500">
        Order {{ order.id }} · Status: {{ statusLabel(order.status) }}
      </p>

      <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <ul class="divide-y divide-gray-200">
          <li
            v-for="item in order.items"
            :key="`${item.productId}:${item.variantId ?? ''}`"
            data-order-line
            class="flex justify-between py-3 text-sm"
          >
            <span class="text-gray-700">
              {{ item.productName }}
              <template v-if="item.variantAttributes"
                >({{ describeVariant(item.variantAttributes) }})</template
              >
              × {{ item.quantity }}
            </span>
            <span class="font-medium text-gray-900">{{
              formatMoney(item.lineTotal, order.currency)
            }}</span>
          </li>
        </ul>
        <div class="mt-4 flex justify-between border-t border-gray-200 pt-4">
          <span class="font-medium text-gray-700">Total</span>
          <span data-subtotal class="text-lg font-semibold text-gray-900">{{
            formatMoney(order.subtotal, order.currency)
          }}</span>
        </div>
      </section>

      <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-sm font-semibold text-gray-900">Shipping to</h2>
        <address class="mt-2 text-sm text-gray-700 not-italic">
          <span
            v-for="(addressLine, index) in addressLines(order.shippingAddress)"
            :key="index"
            class="block"
            >{{ addressLine }}</span
          >
        </address>
      </section>
    </div>
  </main>
</template>
