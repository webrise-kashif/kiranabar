import type { UserRole } from "@kiranabar/types";
import { BrowserRouter, Route, Routes } from "react-router";
import { useAuth } from "./auth/auth-context";
import { LoginForm } from "./auth/LoginForm";
import { Button } from "./components/Button";
import { CategoriesListPage } from "./categories/CategoriesListPage";
import { CategoryFormPage } from "./categories/CategoryFormPage";
import { DashboardPage } from "./dashboard/DashboardPage";
import { AdminLayout } from "./layout/AdminLayout";
import { OrderDetailPage } from "./orders/OrderDetailPage";
import { OrdersListPage } from "./orders/OrdersListPage";
import { ProductFormPage } from "./products/ProductFormPage";
import { ProductsListPage } from "./products/ProductsListPage";
import { UsersListPage } from "./users/UsersListPage";

const STAFF_ROLES: ReadonlySet<UserRole> = new Set(["ADMIN", "SUPER_ADMIN"]);

/**
 * Gated on auth state and role: everything below "staff" is a UX
 * convenience only, since every API call is independently authorized by
 * the backend regardless of what this component renders. Once past the
 * gate, the actual admin sections are real routes (react-router) so each
 * has its own URL/back-button support.
 */
export function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-center text-xl font-semibold text-gray-900">Kiranabar Admin</h1>
          <LoginForm />
        </div>
      </div>
    );
  }

  if (!STAFF_ROLES.has(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">Kiranabar Admin</h1>
          <p role="alert" className="mb-4 text-sm text-red-600">
            Signed in as {user.email}, but this account does not have staff access.
          </p>
          <Button variant="secondary" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/products" element={<ProductsListPage />} />
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id" element={<ProductFormPage />} />
          <Route path="/categories" element={<CategoriesListPage />} />
          <Route path="/categories/new" element={<CategoryFormPage />} />
          <Route path="/categories/:id" element={<CategoryFormPage />} />
          <Route path="/orders" element={<OrdersListPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/users" element={<UsersListPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
