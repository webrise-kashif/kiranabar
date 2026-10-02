<script setup lang="ts">
/** A price, or a sale price next to the struck-through original. */
withDefaults(
  defineProps<{
    price: string;
    salePrice: string | null;
    currency: string;
    size?: "sm" | "lg";
  }>(),
  { size: "sm" },
);
</script>

<template>
  <span :class="size === 'lg' ? 'text-2xl' : 'text-sm'">
    <template v-if="salePrice">
      <span class="font-semibold text-red-600">{{ formatMoney(salePrice, currency) }}</span>
      <s class="ml-2 font-normal text-gray-500" :class="size === 'lg' ? 'text-lg' : ''">{{
        formatMoney(price, currency)
      }}</s>
    </template>
    <span v-else class="font-semibold text-gray-900">{{ formatMoney(price, currency) }}</span>
  </span>
</template>
