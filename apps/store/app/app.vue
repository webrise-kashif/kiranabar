<script setup lang="ts">
interface HealthStatus {
  status: string;
  timestamp: string;
}

const apiClient = useApiClient();
const health = ref<HealthStatus | null>(null);
const healthError = ref<string | null>(null);

// Signing in, creating an account, and logging out live on /account; the
// header only needs to know whether someone is signed in.
const { user, fetchCurrentUser } = useAuth();

onMounted(async () => {
  try {
    health.value = await apiClient.get<HealthStatus>("/health");
  } catch (err) {
    healthError.value = err instanceof Error ? err.message : "Unknown error";
  }

  await fetchCurrentUser();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="border-b border-gray-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Web Store</h1>
          <p v-if="health" class="text-xs text-gray-500">API status: {{ health.status }}</p>
          <p v-if="healthError" role="alert" class="text-xs text-red-600">
            Could not reach API: {{ healthError }}
          </p>
        </div>

        <nav class="ml-auto flex items-center gap-4 text-sm font-medium text-gray-700">
          <NuxtLink to="/products" class="hover:text-indigo-600">Shop</NuxtLink>
          <NuxtLink v-if="user" to="/orders" class="hover:text-indigo-600">My orders</NuxtLink>
          <NuxtLink to="/cart" class="hover:text-indigo-600">Cart</NuxtLink>
          <NuxtLink v-if="user" to="/account" class="hover:text-indigo-600">Account</NuxtLink>
          <NuxtLink
            v-else
            to="/account"
            class="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-indigo-700"
            >Sign in</NuxtLink
          >
        </nav>
      </div>
    </header>

    <NuxtPage />

    <footer class="mt-16 border-t border-gray-200 bg-white">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p class="text-lg font-bold text-gray-900">Kiranabar</p>
          <p class="mt-2 text-sm text-gray-500">Everything you need, all in one place.</p>
        </div>
        <nav aria-label="Shop" class="text-sm">
          <p class="font-semibold text-gray-900">Shop</p>
          <ul class="mt-3 space-y-2 text-gray-600">
            <li><NuxtLink to="/products" class="hover:text-indigo-600">All products</NuxtLink></li>
            <li><NuxtLink to="/cart" class="hover:text-indigo-600">Cart</NuxtLink></li>
          </ul>
        </nav>
        <nav aria-label="Account" class="text-sm">
          <p class="font-semibold text-gray-900">Account</p>
          <ul class="mt-3 space-y-2 text-gray-600">
            <li><NuxtLink to="/account" class="hover:text-indigo-600">Account</NuxtLink></li>
            <li><NuxtLink to="/orders" class="hover:text-indigo-600">My orders</NuxtLink></li>
          </ul>
        </nav>
      </div>
      <p class="border-t border-gray-100 py-4 text-center text-xs text-gray-500">
        © {{ new Date().getFullYear() }} Kiranabar
      </p>
    </footer>
  </div>
</template>
