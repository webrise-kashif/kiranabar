<script setup lang="ts">
import type { ProductImage } from "@kiranabar/types";

const route = useRoute();
const slug = computed(() => String(route.params.slug));

const { fetchProduct } = useCatalog();
const { addItem } = useCart();

const { data: product, error } = await useAsyncData(
  () => `product:${slug.value}`,
  () => fetchProduct(slug.value),
);

/** Primary first, then display order. */
function ordered(images: ProductImage[]): ProductImage[] {
  return [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position,
  );
}

// The API only returns ACTIVE variants to shoppers, so every one is choosable.
const variants = computed(() => product.value?.variants ?? []);
const selectedVariantId = ref<string | null>(null);
const selectedVariant = computed(
  () => variants.value.find((variant) => variant.id === selectedVariantId.value) ?? null,
);
const needsVariant = computed(() => variants.value.length > 0 && !selectedVariant.value);

/** What the shopper is about to buy: the chosen variant, else the product itself. */
const priced = computed(() => selectedVariant.value ?? product.value);

// The chosen variant's own photos when it has any; otherwise the product's
// general gallery (photos tagged to some variant are left out of it).
const gallery = computed(() => {
  const variantImages = selectedVariant.value?.images ?? [];
  if (variantImages.length > 0) {
    return ordered(variantImages);
  }
  return ordered((product.value?.images ?? []).filter((image) => image.variantId === null));
});

const available = computed(() => priced.value?.inventory?.quantityAvailable ?? 0);
const canAdd = computed(() => !needsVariant.value && available.value > 0);
const quantity = ref(1);

const selectedImageId = ref<string | null>(null);

const adding = ref(false);
const added = ref(false);
const addError = ref<string | null>(null);

async function addToCart() {
  if (!product.value || !canAdd.value) {
    return;
  }

  adding.value = true;
  added.value = false;
  addError.value = null;
  try {
    await addItem({
      productId: product.value.id,
      ...(selectedVariant.value ? { variantId: selectedVariant.value.id } : {}),
      quantity: quantity.value,
    });
    added.value = true;
  } catch (error) {
    // The API's message is written for shoppers (e.g. the stock limit).
    addError.value = error instanceof Error ? error.message : "Couldn't add to cart";
  } finally {
    adding.value = false;
  }
}

watch(selectedVariantId, () => {
  selectedImageId.value = null;
  quantity.value = 1;
  added.value = false;
  addError.value = null;
});
const mainImage = computed(
  () => gallery.value.find((image) => image.id === selectedImageId.value) ?? gallery.value[0],
);
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8">
    <p v-if="error" role="alert" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      Sorry, we couldn't load this product. Please try again.
    </p>

    <div v-else-if="product === null" class="py-16 text-center">
      <h1 class="text-2xl font-bold text-gray-900">Product not found</h1>
      <NuxtLink
        to="/"
        class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
      >
        Back to shop
      </NuxtLink>
    </div>

    <div v-else-if="product" class="grid gap-8 md:grid-cols-2">
      <div>
        <img
          v-if="mainImage"
          data-main-image
          :src="mainImage.url"
          :alt="mainImage.altText ?? product.name"
          class="aspect-square w-full rounded-lg border border-gray-200 object-cover"
        />
        <div v-else class="aspect-square w-full rounded-lg bg-gray-100" aria-hidden="true" />

        <div v-if="gallery.length > 1" class="mt-4 flex gap-3">
          <button
            v-for="(galleryImage, index) in gallery"
            :key="galleryImage.id"
            type="button"
            :aria-label="`Show image ${index + 1}`"
            :aria-pressed="galleryImage.id === mainImage?.id"
            class="h-20 w-20 overflow-hidden rounded-md border-2"
            :class="galleryImage.id === mainImage?.id ? 'border-indigo-600' : 'border-transparent'"
            @click="selectedImageId = galleryImage.id"
          >
            <img
              :src="galleryImage.url"
              :alt="galleryImage.altText ?? product.name"
              class="h-full w-full object-cover"
            />
          </button>
        </div>
      </div>

      <div>
        <p v-if="product.category" class="text-sm text-gray-500">{{ product.category.name }}</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-gray-900">{{ product.name }}</h1>

        <p data-price class="mt-4">
          <PriceTag
            :price="priced!.price"
            :sale-price="priced!.salePrice"
            :currency="priced!.currency"
            size="lg"
          />
        </p>

        <p
          data-stock
          class="mt-2 text-sm font-medium"
          :class="
            needsVariant ? 'text-gray-500' : available > 0 ? 'text-green-700' : 'text-red-600'
          "
        >
          {{ needsVariant ? "Choose an option" : available > 0 ? "In stock" : "Out of stock" }}
        </p>

        <fieldset v-if="variants.length > 0" class="mt-6">
          <legend class="text-sm font-medium text-gray-700">Options</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            <label
              v-for="variant in variants"
              :key="variant.id"
              class="cursor-pointer rounded-md border px-3 py-2 text-sm"
              :class="
                variant.id === selectedVariantId
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              "
            >
              <input v-model="selectedVariantId" type="radio" :value="variant.id" class="sr-only" />
              {{ describeVariant(variant.attributes) }}
            </label>
          </div>
        </fieldset>

        <form class="mt-6 flex items-end gap-3" @submit.prevent="addToCart">
          <label class="block text-sm font-medium text-gray-700">
            Quantity
            <input
              v-model.number="quantity"
              type="number"
              min="1"
              :max="Math.max(available, 1)"
              class="mt-1 block w-20 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            :disabled="!canAdd || adding"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to cart
          </button>
        </form>

        <p v-if="added" role="status" class="mt-3 text-sm font-medium text-green-700">
          Added to cart.
        </p>
        <p v-if="addError" role="alert" class="mt-3 text-sm text-red-600">{{ addError }}</p>

        <p v-if="product.description" class="mt-6 text-gray-700">{{ product.description }}</p>
      </div>
    </div>
  </main>
</template>
