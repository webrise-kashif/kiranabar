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
  <main>
    <h1>Web Store</h1>
    <p v-if="health">API status: {{ health.status }}</p>
    <p v-if="healthError" role="alert">Could not reach API: {{ healthError }}</p>

    <section v-if="user">
      <p>Signed in as {{ user.email }} ({{ user.role }})</p>
      <button type="button" @click="onLogout">Log out</button>
    </section>

    <section v-else>
      <form @submit.prevent="onSubmit">
        <label>
          Email
          <input v-model="email" type="email" required autocomplete="email" />
        </label>
        <label>
          Password
          <input v-model="password" type="password" required autocomplete="current-password" />
        </label>
        <button type="submit" :disabled="submitting">
          {{ mode === "login" ? "Log in" : "Register" }}
        </button>
      </form>
      <button type="button" @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === "login" ? "Need an account? Register" : "Already have an account? Log in" }}
      </button>
      <p v-if="authError" role="alert">{{ authError }}</p>
    </section>
  </main>
</template>
