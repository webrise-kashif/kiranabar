<script setup lang="ts">
import { loginSchema, registerSchema } from "@kiranabar/validation";

const route = useRoute();
const { user, login, register, logout, fetchCurrentUser } = useAuth();

// Session state is fetched in the browser only -- see pages/cart.vue.
const { status: authStatus } = useAsyncData("account-auth", fetchCurrentUser, {
  server: false,
  lazy: true,
});

type Mode = "login" | "register";
type Field = "email" | "password";

const mode = ref<Mode>("login");
const email = ref("");
const password = ref("");
const fieldErrors = ref<Partial<Record<Field, string>>>({});
const formError = ref<string | null>(null);
const submitting = ref(false);

/**
 * Where to go after signing in (?redirect=/checkout). Internal paths only --
 * "//evil.example" and "https://..." would make this an open redirect.
 */
function safeRedirect(target: unknown): string | null {
  if (typeof target !== "string") return null;
  return target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\")
    ? target
    : null;
}

function switchMode() {
  mode.value = mode.value === "login" ? "register" : "login";
  fieldErrors.value = {};
  formError.value = null;
}

async function onSubmit() {
  formError.value = null;

  // The same schemas the API validates with. Registration holds a new
  // password to the length rules; sign-in only requires one.
  const schema = mode.value === "login" ? loginSchema : registerSchema;
  const parsed = schema.safeParse({ email: email.value, password: password.value });
  if (!parsed.success) {
    const errors: Partial<Record<Field, string>> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path[0] as Field] ??= issue.message;
    }
    fieldErrors.value = errors;
    return;
  }
  fieldErrors.value = {};

  submitting.value = true;
  try {
    if (mode.value === "login") {
      await login(parsed.data);
    } else {
      await register(parsed.data);
    }
    password.value = "";
    const target = safeRedirect(route.query.redirect);
    if (target) {
      await navigateTo(target);
    }
  } catch (err) {
    // The API's message is written for shoppers ("Invalid email or password").
    formError.value = err instanceof Error ? err.message : "Something went wrong";
  } finally {
    submitting.value = false;
  }
}

async function onLogout() {
  await logout();
  mode.value = "login";
}

const inputClass =
  "mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-1 focus:outline-none";
function inputState(field: Field) {
  return fieldErrors.value[field]
    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
    : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500";
}
</script>

<template>
  <main class="mx-auto max-w-md px-4 py-12">
    <p v-if="authStatus !== 'success' && !user" class="py-16 text-center text-gray-500">Loading…</p>

    <div v-else-if="user" class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 class="text-2xl font-bold tracking-tight text-gray-900">Your account</h1>
      <p class="mt-4 font-medium text-gray-900">{{ user.email }}</p>
      <p class="text-sm text-gray-500">Customer since {{ formatOrderDate(user.createdAt) }}</p>

      <div class="mt-6 flex items-center gap-4">
        <NuxtLink
          to="/orders"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >My orders</NuxtLink
        >
        <button
          type="button"
          data-log-out
          class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          @click="onLogout"
        >
          Log out
        </button>
      </div>
    </div>

    <div v-else class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 class="text-2xl font-bold tracking-tight text-gray-900">
        {{ mode === "login" ? "Sign in" : "Create an account" }}
      </h1>

      <form class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
        <label class="block text-sm font-medium text-gray-700">
          Email
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            :aria-invalid="fieldErrors.email ? 'true' : undefined"
            :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
            :class="[inputClass, inputState('email')]"
          />
          <span
            v-if="fieldErrors.email"
            id="email-error"
            class="mt-1 block text-xs font-normal text-red-600"
            >{{ fieldErrors.email }}</span
          >
        </label>

        <label class="block text-sm font-medium text-gray-700">
          Password
          <input
            v-model="password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            :aria-invalid="fieldErrors.password ? 'true' : undefined"
            :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
            :class="[inputClass, inputState('password')]"
          />
          <span
            v-if="fieldErrors.password"
            id="password-error"
            class="mt-1 block text-xs font-normal text-red-600"
            >{{ fieldErrors.password }}</span
          >
        </label>

        <p v-if="formError" role="alert" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {{ formError }}
        </p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ mode === "login" ? "Sign in" : "Create account" }}
        </button>
      </form>

      <button
        type="button"
        data-switch-mode
        class="mt-4 text-sm text-indigo-600 hover:underline"
        @click="switchMode"
      >
        {{ mode === "login" ? "New here? Create an account" : "Already have an account? Sign in" }}
      </button>
    </div>
  </main>
</template>
