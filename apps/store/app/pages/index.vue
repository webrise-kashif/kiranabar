<script setup lang="ts">
const { fetchProducts, fetchCategories } = useCatalog();

// Public catalog data: server-rendered (no session involved), and each
// section fails on its own so one bad request doesn't blank the page.
const { data: categories } = await useAsyncData("landing-categories", fetchCategories);
const { data: newArrivals, error: newArrivalsError } = await useAsyncData(
  "landing-new-arrivals",
  () => fetchProducts({ pageSize: 8 }),
);

const topCategories = computed(() =>
  (categories.value?.items ?? []).filter((category) => category.parentId === null).slice(0, 6),
);

// Only what the store really does -- no delivery times or guarantees it
// can't back up.
const BENEFITS = [
  {
    title: "Track every order",
    text: "See every order and its status — placed, paid, shipped, delivered — under My orders.",
  },
  {
    title: "Cancel before it's paid",
    text: "Changed your mind? Cancel an order yourself while it's still being placed.",
  },
  {
    title: "Your cart follows you",
    text: "Shop as a guest, then sign in at checkout — everything in your cart comes with you.",
  },
];
</script>

<template>
  <main>
    <section
      data-hero
      class="bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-600 text-white"
    >
      <div class="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <h1 class="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Everything you need, all in one place
        </h1>
        <p class="mt-4 max-w-xl text-lg text-indigo-100">
          Browse the whole catalog, grab what's on sale, and check out in a few steps.
        </p>
        <NuxtLink
          to="/products"
          class="mt-8 inline-block rounded-md bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
          >Shop all products</NuxtLink
        >
      </div>
    </section>

    <div class="mx-auto max-w-6xl space-y-16 px-4 py-16">
      <section v-if="topCategories.length > 0" data-categories>
        <h2 class="text-2xl font-bold tracking-tight text-gray-900">Shop by category</h2>
        <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <NuxtLink
            v-for="category in topCategories"
            :key="category.id"
            :to="`/products?category=${category.id}`"
            data-category-tile
            class="flex aspect-square items-center justify-center rounded-lg bg-gradient-to-br from-indigo-50 to-purple-100 p-4 text-center font-semibold text-indigo-900 shadow-sm transition-shadow hover:shadow-md"
            >{{ category.name }}</NuxtLink
          >
        </div>
      </section>

      <section data-new-arrivals>
        <div class="flex items-baseline justify-between">
          <h2 class="text-2xl font-bold tracking-tight text-gray-900">New arrivals</h2>
          <NuxtLink to="/products" class="text-sm font-medium text-indigo-600 hover:underline"
            >View all</NuxtLink
          >
        </div>
        <p
          v-if="newArrivalsError"
          role="alert"
          class="mt-6 rounded-md bg-red-50 p-4 text-sm text-red-700"
        >
          Sorry, we couldn't load new arrivals. Please try again.
        </p>
        <div v-else class="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          <ProductCard
            v-for="product in newArrivals?.items ?? []"
            :key="product.id"
            :product="product"
            title-tag="h3"
          />
        </div>
      </section>

      <section class="grid items-center gap-8 rounded-2xl bg-white p-8 shadow-sm md:grid-cols-2">
        <div>
          <h2 class="text-2xl font-bold tracking-tight text-gray-900">About Kiranabar</h2>
          <p class="mt-4 text-gray-600">
            Kiranabar brings the neighbourhood store online: a curated catalog, honest prices, and a
            checkout that takes minutes, not forms.
          </p>
          <NuxtLink
            to="/products"
            class="mt-6 inline-block text-sm font-semibold text-indigo-600 hover:underline"
            >Start browsing →</NuxtLink
          >
        </div>
        <div
          class="hidden aspect-video rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 md:block"
          aria-hidden="true"
        />
      </section>

      <section data-benefits>
        <h2 class="text-center text-2xl font-bold tracking-tight text-gray-900">
          Why shop with us
        </h2>
        <div class="mt-8 grid gap-6 md:grid-cols-3">
          <div
            v-for="benefit in BENEFITS"
            :key="benefit.title"
            class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <h3 class="font-semibold text-gray-900">{{ benefit.title }}</h3>
            <p class="mt-2 text-sm text-gray-600">{{ benefit.text }}</p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
