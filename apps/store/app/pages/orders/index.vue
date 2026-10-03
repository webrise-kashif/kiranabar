<script setup lang="ts">
import type { Order, PaginatedResult } from "@kiranabar/types";

const route = useRoute();
const { user, fetchCurrentUser } = useAuth();
const { listOrders } = useOrders();

// Session-owned data is fetched in the browser only -- see pages/cart.vue.
const { status: authStatus } = useAsyncData("orders-auth", fetchCurrentUser, {
  server: false,
  lazy: true,
});

const page = ref(1);
const orders = ref<PaginatedResult<Order> | null>(null);
const loadError = ref(false);

async function load() {
  loadError.value = false;
  try {
    orders.value = await listOrders(page.value);
  } catch {
    loadError.value = true;
  }
}

// Load once someone is signed in (including signing in from the header on
// this page), and again on every page change.
watch(
  [user, page],
  ([signedIn]) => {
    if (signedIn) {
      void load();
    }
  },
  { immediate: true },
);

const totalPages = computed(() =>
  orders.value ? Math.max(1, Math.ceil(orders.value.total / orders.value.pageSize)) : 1,
);

function itemCount(order: Order): string {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return `${count} ${count === 1 ? "item" : "items"}`;
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-gray-900">My orders</h1>

    <p v-if="authStatus !== 'success' && !user" class="py-16 text-center text-gray-500">Loading…</p>

    <div v-else-if="!user" class="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <p class="text-lg font-medium text-gray-900">Sign in to see your orders</p>
      <NuxtLink
        :to="{ path: '/account', query: { redirect: route.path } }"
        class="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >Sign in</NuxtLink
      >
    </div>

    <p v-else-if="loadError" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load your orders. Please try again.
    </p>

    <p v-else-if="!orders" class="py-16 text-center text-gray-500">Loading your orders…</p>

    <div v-else-if="orders.items.length === 0" class="py-16 text-center">
      <p class="text-gray-500">You haven't placed any orders yet.</p>
      <NuxtLink
        to="/"
        class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
      >
        Start shopping
      </NuxtLink>
    </div>

    <template v-else>
      <ul class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm">
        <li v-for="order in orders.items" :key="order.id" data-order-row>
          <NuxtLink
            :to="`/orders/${order.id}`"
            class="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-gray-50"
          >
            <div>
              <p class="font-medium text-gray-900">{{ orderReference(order.id) }}</p>
              <p class="text-sm text-gray-500">
                {{ formatOrderDate(order.createdAt) }} · {{ itemCount(order) }}
              </p>
            </div>
            <div class="flex items-center gap-4">
              <span
                class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                >{{ statusLabel(order.status) }}</span
              >
              <span class="font-semibold text-gray-900">{{
                formatMoney(order.subtotal, order.currency)
              }}</span>
            </div>
          </NuxtLink>
        </li>
      </ul>

      <nav
        v-if="totalPages > 1"
        aria-label="Pagination"
        class="mt-8 flex items-center justify-center gap-4 text-sm text-gray-700"
      >
        <button
          type="button"
          aria-label="Previous page"
          :disabled="page <= 1"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          @click="page--"
        >
          Previous
        </button>
        <span>Page {{ page }} of {{ totalPages }}</span>
        <button
          type="button"
          aria-label="Next page"
          :disabled="page >= totalPages"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          @click="page++"
        >
          Next
        </button>
      </nav>
    </template>
  </main>
</template>
