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
  </div>
</template>
