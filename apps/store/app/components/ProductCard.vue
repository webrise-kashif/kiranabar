<script setup lang="ts">
import type { Product } from "@kiranabar/types";

const props = withDefaults(
  defineProps<{
    product: Product;
    /** h2 in a plain grid (catalog); h3 under a section heading (landing page). */
    titleTag?: "h2" | "h3";
  }>(),
  { titleTag: "h2" },
);

const image = computed(
  () => props.product.images.find((candidate) => candidate.isPrimary) ?? props.product.images[0],
);

// A product with variants is sold out only when every variant is; otherwise
// its own stock counts.
const soldOut = computed(() => {
  const { variants, inventory } = props.product;
  if (variants.length > 0) {
    return variants.every((variant) => (variant.inventory?.quantityAvailable ?? 0) <= 0);
  }
  return (inventory?.quantityAvailable ?? 0) <= 0;
});
</script>

<template>
  <article
    class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
  >
    <NuxtLink :to="`/products/${product.slug}`" class="block">
      <div class="relative">
        <img
          v-if="image"
          :src="image.url"
          :alt="image.altText ?? product.name"
          class="aspect-square w-full object-cover"
        />
        <div v-else class="aspect-square w-full bg-gray-100" aria-hidden="true" />
        <span
          v-if="product.salePrice"
          data-discount
          class="absolute top-2 left-2 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
          >-{{ discountPercent(product.price, product.salePrice) }}%</span
        >
        <span
          v-if="soldOut"
          data-sold-out
          class="absolute top-2 right-2 rounded-md bg-gray-900/80 px-2 py-0.5 text-xs font-semibold text-white"
          >Sold out</span
        >
      </div>
      <div class="p-4">
        <component :is="titleTag" class="text-sm font-medium text-gray-900">{{
          product.name
        }}</component>
        <p class="mt-1">
          <PriceTag
            :price="product.price"
            :sale-price="product.salePrice"
            :currency="product.currency"
          />
        </p>
      </div>
    </NuxtLink>
  </article>
</template>
