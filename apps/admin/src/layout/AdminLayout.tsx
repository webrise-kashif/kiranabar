import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/auth-context";

const NAV_LINKS = [
  { to: "/products", label: "Products" },
  { to: "/categories", label: "Categories" },
  { to: "/orders", label: "Orders" },
  { to: "/users", label: "Users" },
];

/** The signed-in staff shell: sidebar nav, a topbar with user info, and the routed page via <Outlet />. */
export function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col bg-gray-900">
        <div className="flex h-16 items-center px-6">
          <span className="text-lg font-semibold text-white">Kiranabar</span>
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gray-800 text-white"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div />
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Signed in as {user.email} <span className="text-gray-400">({user.role})</span>
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                Log out
              </button>
            </div>
          )}
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
