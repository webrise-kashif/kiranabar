<script setup lang="ts">
import { shippingAddressSchema, type ShippingAddressInput } from "@kiranabar/validation";

const { user, fetchCurrentUser } = useAuth();
const { getCart } = useCart();
const { placeOrder } = useOrders();

// Everything here belongs to the browser's session, so it's fetched in the
// browser only (server: false) -- a server-side render's fetch wouldn't
// carry the session cookie. See pages/cart.vue.
const { status: authStatus } = useAsyncData("checkout-auth", fetchCurrentUser, {
  server: false,
  lazy: true,
});

const {
  data: cart,
  error: cartError,
  execute: loadCart,
} = useAsyncData("checkout-cart", getCart, { server: false, lazy: true, immediate: false });

// Load the cart once someone is signed in -- including after signing in from
// the header on this page (the API merges a guest cart into the account then).
watch(
  user,
  (signedIn) => {
    if (signedIn) {
      void loadCart();
    }
  },
  { immediate: true },
);

type AddressField = keyof ShippingAddressInput;

const OPTIONAL_FIELDS: AddressField[] = ["line2", "phone"];

const FIELDS: { key: AddressField; label: string; autocomplete: string; placeholder?: string }[] = [
  { key: "recipientName", label: "Recipient name", autocomplete: "name" },
  { key: "line1", label: "Address line 1", autocomplete: "address-line1" },
  { key: "line2", label: "Address line 2 (optional)", autocomplete: "address-line2" },
  { key: "city", label: "City", autocomplete: "address-level2" },
  { key: "state", label: "State / region", autocomplete: "address-level1" },
  { key: "postalCode", label: "Postal code", autocomplete: "postal-code" },
  { key: "country", label: "Country (2-letter code)", autocomplete: "country", placeholder: "US" },
  { key: "phone", label: "Phone (optional)", autocomplete: "tel" },
];

const address = reactive<Record<AddressField, string>>({
  recipientName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  phone: "",
});
const fieldErrors = ref<Partial<Record<AddressField, string>>>({});
const placing = ref(false);
const placeError = ref<string | null>(null);

async function submit() {
  placeError.value = null;

  // The same schema the API validates with, so errors match exactly. Empty
  // *optional* fields are left out rather than sent as ""; required ones stay
  // (as "") so the schema reports its own "... is required" messages.
  const parsed = shippingAddressSchema.safeParse(
    Object.fromEntries(
      Object.entries(address).filter(
        ([key, value]) => !OPTIONAL_FIELDS.includes(key as AddressField) || value.trim() !== "",
      ),
    ),
  );
  if (!parsed.success) {
    const errors: Partial<Record<AddressField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as AddressField;
      errors[key] ??= issue.message;
    }
    fieldErrors.value = errors;
    return;
  }
  fieldErrors.value = {};

  placing.value = true;
  try {
    const order = await placeOrder({ shippingAddress: parsed.data });
    // ?placed=1 tells the order page to thank the shopper; reached any other
    // way (e.g. from order history), it's just the order's details.
    await navigateTo({ path: `/orders/${order.id}`, query: { placed: "1" } });
  } catch (err) {
    // The API's message is written for shoppers (e.g. stock changed).
    placeError.value = err instanceof Error ? err.message : "Couldn't place your order";
  } finally {
    placing.value = false;
  }
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-gray-900">Checkout</h1>

    <p v-if="authStatus !== 'success' && !user" class="py-16 text-center text-gray-500">Loading…</p>

    <div v-else-if="!user" class="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <p class="text-lg font-medium text-gray-900">Sign in to check out</p>
      <p class="mt-2 text-sm text-gray-500">
        Use the form at the top of the page. Your cart comes with you.
      </p>
    </div>

    <p v-else-if="cartError" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load your cart. Please try again.
    </p>

    <p v-else-if="!cart" class="py-16 text-center text-gray-500">Loading your cart…</p>

    <div v-else-if="cart.items.length === 0" class="py-16 text-center">
      <p class="text-gray-500">Your cart is empty.</p>
      <NuxtLink
        to="/"
        class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
      >
        Continue shopping
      </NuxtLink>
    </div>

    <div v-else class="grid gap-8 md:grid-cols-2">
      <form
        class="space-y-4 rounded-lg border border-gray-200 bg-white p-6"
        novalidate
        @submit.prevent="submit"
      >
        <h2 class="text-lg font-semibold text-gray-900">Shipping address</h2>

        <label
          v-for="input in FIELDS"
          :key="input.key"
          class="block text-sm font-medium text-gray-700"
        >
          {{ input.label }}
          <input
            v-model="address[input.key]"
            type="text"
            :autocomplete="input.autocomplete"
            :placeholder="input.placeholder"
            :aria-invalid="fieldErrors[input.key] ? 'true' : undefined"
            :aria-describedby="fieldErrors[input.key] ? `${input.key}-error` : undefined"
            class="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-1 focus:outline-none"
            :class="
              fieldErrors[input.key]
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
            "
          />
          <span
            v-if="fieldErrors[input.key]"
            :id="`${input.key}-error`"
            class="mt-1 block text-xs font-normal text-red-600"
            >{{ fieldErrors[input.key] }}</span
          >
        </label>

        <p v-if="placeError" role="alert" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {{ placeError }}
        </p>

        <button
          type="submit"
          :disabled="placing"
          class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ placing ? "Placing order…" : "Place order" }}
        </button>
      </form>

      <section data-order-summary class="rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">Order summary</h2>
        <ul class="mt-4 divide-y divide-gray-200">
          <li
            v-for="item in cart.items"
            :key="`${item.productId}:${item.variantId ?? ''}`"
            class="flex justify-between py-3 text-sm"
          >
            <span class="text-gray-700">
              {{ item.product.name }}
              <span v-if="item.variant" class="text-gray-500">
                ({{ describeVariant(item.variant.attributes) }})
              </span>
              × {{ item.quantity }}
            </span>
            <span class="font-medium text-gray-900">{{
              formatMoney(item.lineTotal, cart.currency)
            }}</span>
          </li>
        </ul>
        <div class="mt-4 flex justify-between border-t border-gray-200 pt-4">
          <span class="font-medium text-gray-700">Subtotal</span>
          <span data-subtotal class="text-lg font-semibold text-gray-900">{{
            formatMoney(cart.subtotal, cart.currency)
          }}</span>
        </div>
      </section>
    </div>
  </main>
</template>
