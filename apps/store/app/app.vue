<script setup lang="ts">
import { loginSchema, registerSchema } from "@kiranabar/validation";

interface HealthStatus {
  status: string;
  timestamp: string;
}

const apiClient = useApiClient();
const health = ref<HealthStatus | null>(null);
const healthError = ref<string | null>(null);

const { user, register, login, logout, fetchCurrentUser } = useAuth();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const authError = ref<string | null>(null);
const submitting = ref(false);

onMounted(async () => {
  try {
    health.value = await apiClient.get<HealthStatus>("/health");
  } catch (err) {
    healthError.value = err instanceof Error ? err.message : "Unknown error";
  }

  await fetchCurrentUser();
});

async function onSubmit(): Promise<void> {
  authError.value = null;
  submitting.value = true;

  try {
    const schema = mode.value === "login" ? loginSchema : registerSchema;
    const input = schema.parse({ email: email.value, password: password.value });

    if (mode.value === "login") {
      await login(input);
    } else {
      await register(input);
    }

    email.value = "";
    password.value = "";
  } catch (err) {
    authError.value = err instanceof Error ? err.message : "Something went wrong";
  } finally {
    submitting.value = false;
  }
}

async function onLogout(): Promise<void> {
  await logout();
}
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

        <section v-if="user" class="flex items-center gap-3 text-sm text-gray-700">
          <p>Signed in as {{ user.email }} ({{ user.role }})</p>
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-gray-50"
            @click="onLogout"
          >
            Log out
          </button>
        </section>

        <section v-else class="flex flex-col items-end gap-1">
          <form class="flex flex-wrap items-end gap-2" @submit.prevent="onSubmit">
            <label class="text-xs font-medium text-gray-700">
              Email
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                class="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
            <label class="text-xs font-medium text-gray-700">
              Password
              <input
                v-model="password"
                type="password"
                required
                autocomplete="current-password"
                class="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              :disabled="submitting"
              class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ mode === "login" ? "Log in" : "Register" }}
            </button>
          </form>
          <button
            type="button"
            class="text-xs text-indigo-600 hover:underline"
            @click="mode = mode === 'login' ? 'register' : 'login'"
          >
            {{ mode === "login" ? "Need an account? Register" : "Already have an account? Log in" }}
          </button>
          <p v-if="authError" role="alert" class="text-xs text-red-600">{{ authError }}</p>
        </section>
      </div>
    </header>

    <NuxtPage />
  </div>
</template>
