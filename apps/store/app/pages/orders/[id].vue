<script setup lang="ts">
import { ApiClientError } from "@kiranabar/api-client";
import type { ShippingAddress } from "@kiranabar/types";

const route = useRoute();
const orderId = computed(() => String(route.params.id));
// Arriving straight from checkout (see pages/checkout.vue).
const justPlaced = computed(() => route.query.placed === "1");

const { getOrder, cancelOrder } = useOrders();

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

const cancelling = ref(false);
const cancelled = ref(false);
const cancelError = ref<string | null>(null);

/** Customers can cancel only while an order is still PLACED (the API enforces it). */
async function cancel(id: string) {
  if (!window.confirm("Cancel this order? This can't be undone.")) {
    return;
  }

  cancelling.value = true;
  cancelError.value = null;
  try {
    order.value = await cancelOrder(id);
    cancelled.value = true;
  } catch (err) {
    // The API's message is written for shoppers.
    cancelError.value = err instanceof Error ? err.message : "Couldn't cancel this order";
  } finally {
    cancelling.value = false;
  }
}

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
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <p v-if="error" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load this order. Please try again.
    </p>

    <div v-else-if="order === 'signed-out'" class="py-16 text-center">
      <h1 class="text-2xl font-bold text-gray-900">Sign in to view this order</h1>
      <NuxtLink
        :to="{ path: '/account', query: { redirect: route.path } }"
        class="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >Sign in</NuxtLink
      >
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
        {{
          justPlaced
            ? "Thank you! Your order has been placed."
            : `Order ${orderReference(order.id)}`
        }}
      </h1>
      <p class="mt-2 text-sm text-gray-500">
        <template v-if="justPlaced">Order {{ orderReference(order.id) }} · </template>
        Placed {{ formatOrderDate(order.createdAt) }} · Status: {{ statusLabel(order.status) }}
      </p>

      <p
        v-if="cancelled"
        role="status"
        class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800"
      >
        Your order has been cancelled.
      </p>
      <p v-if="cancelError" role="alert" class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
        {{ cancelError }}
      </p>
      <button
        v-if="order.status === 'PLACED'"
        type="button"
        data-cancel-order
        :disabled="cancelling"
        class="mt-4 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        @click="cancel(order.id)"
      >
        {{ cancelling ? "Cancelling…" : "Cancel order" }}
      </button>

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
