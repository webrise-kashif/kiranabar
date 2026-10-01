import { Link } from "react-router";

const SECTIONS = [
  {
    to: "/products",
    label: "Products",
    description: "Manage catalog products, images, and stock.",
  },
  { to: "/categories", label: "Categories", description: "Organize the catalog hierarchy." },
  { to: "/orders", label: "Orders", description: "View orders and update fulfillment status." },
  { to: "/users", label: "Users", description: "View customers and manage staff roles." },
];

/** Landing page after login -- deliberately fetches nothing, just orients to a section. */
export function DashboardPage() {
  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Dashboard</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="text-sm font-semibold text-gray-900">{section.label}</h3>
            <p className="mt-1 text-sm text-gray-500">{section.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
