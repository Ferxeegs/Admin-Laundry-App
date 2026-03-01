import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import { roleAPI } from "../../utils/api";
import { PencilIcon } from "../../icons";
import { useAuth } from "../../context/AuthContext";
import TableSkeleton from "../../components/common/TableSkeleton";

interface Role {
  id: number;
  name: string;
  guard_name: string;
  permissions_count: number;
  users_count: number;
  permissions: Array<{
    id: number;
    name: string;
    guard_name: string;
  }>;
  created_at: string | null;
  updated_at: string | null;
}

export default function RolesList() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const fetchRoles = async (forceLoading = false) => {
    // Hanya set loading jika force loading atau benar-benar tidak ada data
    if (forceLoading || roles.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await roleAPI.getAllRoles({
        page,
        limit: 10,
        search: search.trim() || undefined,
      });

      // Backend mengembalikan { status: "success", data: { roles: [...], pagination: {...} } }
      // apiRequest sudah mengkonversi ke { success: true, data: { roles: [...], pagination: {...} } }
      if (response.success && response.data) {
        setRoles(response.data.roles);
        setPagination(response.data.pagination);
      } else {
        setError(response.message || "Gagal mengambil data roles");
        console.error("Roles response:", response);
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch roles error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Saat page berubah, fetch data
    // Loading hanya akan di-set jika tidak ada data (di dalam fetchRoles)
    fetchRoles(false);
  }, [page]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchRoles();
      } else {
        setPage(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  // const formatDate = (dateString: string | null) => {
  //   if (!dateString) return "-";
  //   const date = new Date(dateString);
  //   return date.toLocaleDateString("id-ID", {
  //     year: "numeric",
  //     month: "short",
  //     day: "numeric",
  //   });
  // };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Cari role (nama, guard name)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
          />
          <svg
            className="absolute -translate-y-1/2 left-4 top-1/2 fill-gray-500 dark:fill-gray-400"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
              fill=""
            />
          </svg>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Total: {pagination.total} roles
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          {isLoading && roles.length === 0 ? (
            <TableSkeleton rows={10} columns={6} showAvatar={true} />
          ) : roles.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                {search ? "Tidak ada role yang ditemukan" : "Belum ada role"}
              </div>
            </div>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Role Name
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Guard Name
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Permissions
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Users
                  </TableCell>
                  {/* <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Tanggal Dibuat
                  </TableCell> */}
                  <TableCell
                    isHeader
                    className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {roles.map((role) => (
                  <TableRow 
                    key={role.id} 
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  >
                    <TableCell className="px-5 py-4">
                      <div 
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => {
                          if (hasPermission(['view_role', 'view_any_role'])) {
                            navigate(`/roles/${String(role.id)}/edit`);
                          }
                        }}
                      >
                        <div className="h-10 w-10 overflow-hidden rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-sm">
                          {role.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {role.name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div 
                        className="cursor-pointer"
                        onClick={() => {
                          if (hasPermission(['view_role', 'view_any_role'])) {
                            navigate(`/roles/${String(role.id)}/edit`);
                          }
                        }}
                      >
                        <Badge size="sm" color="info">
                          {role.guard_name}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div 
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          if (hasPermission(['view_role', 'view_any_role'])) {
                            navigate(`/roles/${String(role.id)}/edit`);
                          }
                        }}
                      >
                        <Badge size="sm" color="primary">
                          {role.permissions_count} Permissions
                        </Badge>
                        {/* {role.permissions.length > 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {role.permissions.slice(0, 2).map((p) => p.name).join(", ")}
                            {role.permissions.length > 2 && ` +${role.permissions.length - 2}`}
                          </div>
                        )} */}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div 
                        className="cursor-pointer"
                        onClick={() => {
                          if (hasPermission(['view_role', 'view_any_role'])) {
                            navigate(`/roles/${String(role.id)}/edit`);
                          }
                        }}
                      >
                        <Badge size="sm" color="success">
                          {role.users_count} Users
                        </Badge>
                      </div>
                    </TableCell>
                    {/* <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatDate(role.created_at)}
                    </TableCell> */}
                    <TableCell className="px-5 py-4">
                      {hasPermission(['view_role', 'view_any_role']) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/roles/${String(role.id)}/edit`);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                          title="Edit Role"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Menampilkan {((page - 1) * pagination.limit) + 1} - {Math.min(page * pagination.limit, pagination.total)} dari {pagination.total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

