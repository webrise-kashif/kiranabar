<script setup lang="ts">
import type { CartItem } from "@kiranabar/types";

const { getCart, updateItem, removeItem } = useCart();

const { data: cart, error } = await useAsyncData("cart", getCart);

const actionError = ref<string | null>(null);

/** The API's message is written for shoppers (e.g. the stock limit). */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Couldn't update your cart";
}

/** As reported by the API -- checkout rejects a line that isn't ACTIVE. */
function isUnavailable(item: CartItem): boolean {
  return (
    item.product.status !== "ACTIVE" || (item.variant !== null && item.variant.status !== "ACTIVE")
  );
}

async function remove(item: CartItem) {
  actionError.value = null;
  try {
    cart.value = await removeItem(item.productId, item.variantId);
  } catch (err) {
    actionError.value = messageOf(err);
  }
}

async function changeQuantity(item: CartItem, event: Event) {
  const input = event.target as HTMLInputElement;
  const quantity = Number(input.value);
  actionError.value = null;

  if (!Number.isInteger(quantity) || quantity < 1) {
    input.value = String(item.quantity);
    return;
  }

  try {
    cart.value = await updateItem(item.productId, quantity, item.variantId);
  } catch (err) {
    actionError.value = messageOf(err);
    // The input is one-way bound to the server's quantity, which didn't
    // change -- so Vue won't re-render it; put it back by hand.
    input.value = String(item.quantity);
  }
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-gray-900">Your cart</h1>

    <p v-if="actionError" role="alert" class="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
      {{ actionError }}
    </p>

    <p v-if="error" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load your cart. Please try again.
    </p>

    <div v-else-if="cart && cart.items.length === 0" class="py-16 text-center">
      <p class="text-gray-500">Your cart is empty.</p>
      <NuxtLink
        to="/"
        class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
      >
        Continue shopping
      </NuxtLink>
    </div>

    <div v-else-if="cart" class="rounded-lg border border-gray-200 bg-white shadow-sm">
      <ul class="divide-y divide-gray-200">
        <li
          v-for="item in cart.items"
          :key="`${item.productId}:${item.variantId ?? ''}`"
          data-cart-line
          class="flex gap-4 p-4"
        >
          <img
            v-if="item.product.image"
            :src="item.product.image"
            :alt="item.product.name"
            class="h-20 w-20 rounded-md object-cover"
          />
          <div v-else class="h-20 w-20 rounded-md bg-gray-100" aria-hidden="true" />

          <div class="flex-1">
            <NuxtLink
              :to="`/products/${item.product.slug}`"
              class="font-medium text-gray-900 hover:underline"
              >{{ item.product.name }}</NuxtLink
            >
            <p v-if="item.variant" class="text-sm text-gray-500">
              {{ describeVariant(item.variant.attributes) }}
            </p>
            <p v-if="isUnavailable(item)" class="mt-1 text-sm font-medium text-red-600">
              No longer available — remove it to check out.
            </p>
            <p class="mt-1 text-sm text-gray-700">
              <span data-unit-price>{{ formatMoney(item.unitPrice, cart.currency) }}</span> each
            </p>
          </div>

          <label class="text-sm text-gray-700">
            <span class="sr-only">Quantity of {{ item.product.name }}</span>
            <input
              type="number"
              min="1"
              :value="item.quantity"
              class="block w-20 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              @change="changeQuantity(item, $event)"
            />
          </label>

          <div class="w-24 text-right">
            <p data-line-total class="font-semibold text-gray-900">
              {{ formatMoney(item.lineTotal, cart.currency) }}
            </p>
            <button
              type="button"
              :aria-label="`Remove ${item.product.name}`"
              class="mt-2 text-sm text-gray-500 hover:text-red-600 hover:underline"
              @click="remove(item)"
            >
              Remove
            </button>
          </div>
        </li>
      </ul>

      <div class="flex items-center justify-between border-t border-gray-200 p-4">
        <span class="text-sm font-medium text-gray-700">Subtotal</span>
        <span data-subtotal class="text-lg font-semibold text-gray-900">{{
          formatMoney(cart.subtotal, cart.currency)
        }}</span>
      </div>
    </div>
  </main>
</template>
