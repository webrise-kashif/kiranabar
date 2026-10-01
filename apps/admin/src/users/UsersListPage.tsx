import type { PublicUser, UserRole } from "@kiranabar/types";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/auth-context";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { Table, TableBody, TableHead, Td, Th, Tr } from "../components/Table";
import { usePaginatedList } from "../lib/use-paginated-list";
import { inputClass } from "../lib/ui";
import { changeUserRole } from "./api";

const ROLE_OPTIONS: UserRole[] = ["CUSTOMER", "ADMIN", "SUPER_ADMIN"];
const PAGE_SIZE = 20;

/** Read-only "customer visibility" for ADMIN; SUPER_ADMIN additionally gets role management. */
export function UsersListPage() {
  const { user: currentUser } = useAuth();
  const canChangeRoles = currentUser?.role === "SUPER_ADMIN";
  const [page, setPage] = useState(1);
  const [roleError, setRoleError] = useState<string | null>(null);

  const { data, loading, error, refetch } = usePaginatedList<PublicUser>("/users", {
    page,
    pageSize: PAGE_SIZE,
  });

  async function handleRoleChange(id: string, role: UserRole): Promise<void> {
    setRoleError(null);
    try {
      await changeUserRole(id, role);
      refetch();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Failed to change role");
    }
  }

  return (
    <>
      <PageHeader title="Customers" />

      {roleError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {roleError}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th />
              </tr>
            </TableHead>
            <TableBody>
              {data.items.map((user) => (
                <Tr key={user.id}>
                  <Td className="font-medium text-gray-900">{user.email}</Td>
                  <Td>
                    {canChangeRoles ? (
                      <select
                        value={user.role}
                        onChange={(event) =>
                          void handleRoleChange(user.id, event.target.value as UserRole)
                        }
                        className={`${inputClass} w-40`}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      user.role
                    )}
                  </Td>
                  <Td>{new Date(user.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    <Link
                      to={`/orders?userId=${user.id}`}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      View orders
                    </Link>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
          {data.items.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">No customers found.</p>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
