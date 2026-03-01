import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { userAPI, mediaAPI, getBaseUrl } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { AngleLeftIcon, PencilIcon } from "../../icons";
import Badge from "../../components/ui/badge/Badge";
import TableSkeleton from "../../components/common/TableSkeleton";

interface User {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string | null;
  phone_number: string | null;
  email_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  roles: Array<{
    id: number;
    name: string;
    guard_name: string;
  }>;
  profile_picture: {
    id: number;
    url: string;
  } | null;
}

export default function ViewUser() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ktmPreview, setKtmPreview] = useState<string | null>(null);
  const [ktmUrl, setKtmUrl] = useState<string | null>(null);
  const [ktmMimeType, setKtmMimeType] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchUserData();
      fetchKTM();
    }
  }, [id]);

  const fetchUserData = async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await userAPI.getUserById(id);
      if (response.success && response.data) {
        // Ensure profile_picture is included
        const userData = {
          ...response.data,
          profile_picture: (response.data as any).profile_picture || null,
        };
        setUser(userData as User);
      } else {
        setError(response.message || "Gagal mengambil data user");
      }
    } catch (err: any) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      console.error("Fetch user error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchKTM = async () => {
    if (!id) return;

    try {
      const response = await mediaAPI.getMediaByModel('User', id, 'ktm');
      if (response.success && response.data?.media && response.data.media.length > 0) {
        const media = response.data.media[0];
        const serverUrl = `${getBaseUrl()}${media.url}`;
        setKtmUrl(serverUrl);
        setKtmMimeType(media.mime_type);
        if (media.mime_type.startsWith('image/')) {
          setKtmPreview(serverUrl);
        } else {
          setKtmPreview(null); // PDF - will show download link
        }
      } else {
        setKtmPreview(null);
        setKtmUrl(null);
        setKtmMimeType(null);
      }
    } catch (err) {
      console.error('Error fetching KTM:', err);
      setKtmPreview(null);
      setKtmUrl(null);
      setKtmMimeType(null);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFullName = (user: User) => {
    if (user.fullname) {
      return user.fullname;
    }
    return `${user.firstname} ${user.lastname}`.trim() || user.username;
  };

  const getInitials = (user: User) => {
    const fullName = getFullName(user);
    if (fullName !== user.username) {
      const names = fullName.split(" ");
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return fullName.substring(0, 2).toUpperCase();
    }
    return user.username.substring(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="View User" />
        <PageMeta title="View User" description="View user details and profile information" />
        <div className="p-5 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <TableSkeleton rows={10} columns={2} />
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="View User" />
        <PageMeta title="View User" description="View user details and profile information" />
        <ComponentCard title="Error">
          <div className="p-5 text-center">
            <p className="text-red-600 dark:text-red-400">{error || "User tidak ditemukan"}</p>
            <button
              onClick={() => navigate("/users")}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
            >
              Kembali ke Daftar User
            </button>
          </div>
        </ComponentCard>
      </div>
    );
  }

  const profilePictureUrl = user.profile_picture
    ? `${getBaseUrl()}${user.profile_picture.url}`
    : null;

  return (
    <div className="space-y-5">
      <PageBreadcrumb pageTitle="View User" />
      <PageMeta title="View User" description="View user details and profile information" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/users"
            className="inline-flex items-center justify-center w-10 h-10 text-gray-500 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <AngleLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
              {getFullName(user)}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View user details and profile information
            </p>
          </div>
        </div>
        {hasPermission(['update_user']) && (
          <Link
            to={`/users/${user.id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600"
          >
            <PencilIcon className="w-4 h-4" />
            Edit User
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left Sidebar - Profile Picture & Quick Info */}
        <div className="lg:col-span-1">
          <ComponentCard title="Profile">
            <div className="space-y-6">
              {/* Profile Picture */}
              <div className="flex flex-col items-center">
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Profile"
                    className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-4xl border-4 border-gray-200 dark:border-gray-700">
                    {getInitials(user)}
                  </div>
                )}
                <h3 className="mt-4 text-lg font-semibold text-gray-800 dark:text-white">
                  {getFullName(user)}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
              </div>

              {/* Quick Info */}
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Username</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{user.username}</p>
                </div>
                {user.phone_number && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Phone Number</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{user.phone_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Email Verified</p>
                  {user.email_verified_at ? (
                    <Badge size="sm" color="success">
                      Verified
                    </Badge>
                  ) : (
                    <Badge size="sm" color="error">
                      Unverified
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Roles</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {user.roles && user.roles.length > 0 ? (
                      user.roles.map((role) => (
                        <Badge key={role.id} size="sm" color="primary">
                          {role.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">No roles assigned</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ComponentCard>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-5">
          {/* User Information & Profile */}
          <ComponentCard title="User Information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Full Name</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {getFullName(user)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Email</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">{user.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Username</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">{user.username}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Phone Number</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {user.phone_number || "-"}
                </p>
              </div>
            </div>
          </ComponentCard>

          {/* Metadata / Timestamps */}
          <ComponentCard title="Metadata">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created At</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {formatDate(user.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Updated At</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {formatDate(user.updated_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Email Verified At</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  {user.email_verified_at ? formatDate(user.email_verified_at) : "-"}
                </p>
              </div>
            </div>
          </ComponentCard>

          {/* KTM Section */}
          {(ktmPreview || ktmUrl) && (
            <ComponentCard title="KTM (Kartu Tanda Mahasiswa)">
              <div className="space-y-4">
                {/* Image Preview */}
                {ktmPreview && (
                  <div className="relative rounded-lg border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
                    <img
                      src={ktmPreview}
                      alt="KTM"
                      className="max-w-full h-auto max-h-96 object-contain mx-auto"
                    />
                  </div>
                )}

                {/* PDF/File Info Card */}
                {!ktmPreview && ktmUrl && (
                  <div className="p-4 border border-gray-200 rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <svg
                          className="w-6 h-6 text-blue-600 dark:text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                          KTM telah diupload
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Format: {ktmMimeType === 'application/pdf' ? 'PDF Document' : 'File'}
                        </p>
                        {ktmUrl && (
                          <a
                            href={ktmUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                            Buka di tab baru
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ComponentCard>
          )}

          {/* Roles */}
          <ComponentCard title="Roles">
            {user.roles && user.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <Badge key={role.id} size="md" color="primary">
                    {role.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No roles assigned</p>
            )}
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}

