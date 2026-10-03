<script setup lang="ts">
const { fetchProducts, fetchCategories } = useCatalog();

const PAGE_SIZE = 12;

const page = ref(1);
const search = ref("");
const searchDraft = ref("");
const route = useRoute();
// Starts from ?category= so other pages (e.g. the landing page's category
// tiles) can link straight into a filtered catalog.
const categoryId = ref(typeof route.query.category === "string" ? route.query.category : "");

const { data: categories } = await useAsyncData("catalog-categories", fetchCategories);

// A reactive key (not a fixed key + `watch`): each filter combination is
// its own cache entry, and a change refetches with this instance's current
// filters. With a fixed key, Nuxt shares the first instance's handler for
// later refreshes, so another instance's filters could be used instead.
const { data, error } = await useAsyncData(
  () => `catalog-products:${page.value}:${search.value}:${categoryId.value}`,
  () =>
    fetchProducts({
      page: page.value,
      pageSize: PAGE_SIZE,
      search: search.value || undefined,
      categoryId: categoryId.value || undefined,
    }),
);

const totalPages = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1,
);

function selectCategory(id: string) {
  categoryId.value = id;
  page.value = 1;
}

function applySearch() {
  search.value = searchDraft.value.trim();
  page.value = 1;
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-gray-900">Shop</h1>

    <div class="mb-8 flex flex-wrap items-end gap-4">
      <form role="search" class="flex items-end gap-2" @submit.prevent="applySearch">
        <label class="block text-sm font-medium text-gray-700">
          Search
          <input
            v-model="searchDraft"
            type="search"
            placeholder="Search products"
            class="mt-1 block w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Search
        </button>
      </form>

      <label class="block text-sm font-medium text-gray-700">
        Category
        <select
          :value="categoryId"
          class="mt-1 block w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          @change="selectCategory(($event.target as HTMLSelectElement).value)"
        >
          <option value="">All categories</option>
          <option
            v-for="category in categories?.items ?? []"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
      </label>
    </div>

    <p v-if="error" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load the catalog. Please try again.
    </p>
    <p v-else-if="data && data.items.length === 0" class="py-12 text-center text-gray-500">
      No products found.
    </p>

    <div v-else class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard v-for="product in data?.items ?? []" :key="product.id" :product="product" />
    </div>

    <nav
      v-if="!error && totalPages > 1"
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
  </main>
</template>
