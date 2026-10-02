<script setup lang="ts">
import type { Product } from "@kiranabar/types";

const { fetchProducts, fetchCategories } = useCatalog();

const PAGE_SIZE = 12;

const page = ref(1);
const search = ref("");
const searchDraft = ref("");
const categoryId = ref("");

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

function primaryImage(product: Product) {
  return product.images.find((image) => image.isPrimary) ?? product.images[0] ?? null;
}
</script>

<template>
  <main>
    <h1>Shop</h1>

    <form role="search" class="filters" @submit.prevent="applySearch">
      <label>
        Search
        <input v-model="searchDraft" type="search" placeholder="Search products" />
      </label>
      <button type="submit">Search</button>
    </form>

    <label class="filters">
      Category
      <select
        :value="categoryId"
        @change="selectCategory(($event.target as HTMLSelectElement).value)"
      >
        <option value="">All categories</option>
        <option v-for="category in categories?.items ?? []" :key="category.id" :value="category.id">
          {{ category.name }}
        </option>
      </select>
    </label>

    <p v-if="error" role="alert">Sorry, we couldn't load the catalog. Please try again.</p>
    <p v-else-if="data && data.items.length === 0">No products found.</p>

    <div v-else class="grid">
      <article v-for="product in data?.items ?? []" :key="product.id" class="card">
        <img
          v-if="primaryImage(product)"
          :src="primaryImage(product)!.url"
          :alt="primaryImage(product)!.altText ?? product.name"
        />
        <h2>{{ product.name }}</h2>
        <p v-if="product.salePrice" class="price">
          {{ formatMoney(product.salePrice, product.currency) }}
          <s>{{ formatMoney(product.price, product.currency) }}</s>
        </p>
        <p v-else class="price">{{ formatMoney(product.price, product.currency) }}</p>
      </article>
    </div>

    <nav v-if="!error && totalPages > 1" aria-label="Pagination" class="pagination">
      <button type="button" aria-label="Previous page" :disabled="page <= 1" @click="page--">
        Previous
      </button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button type="button" aria-label="Next page" :disabled="page >= totalPages" @click="page++">
        Next
      </button>
    </nav>
  </main>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: end;
  margin-bottom: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.pagination {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 1.5rem;
}

.price s {
  margin-left: 0.5rem;
  color: #6b7280;
}
</style>
