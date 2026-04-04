
const API_BASE_URL =
  import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.length > 0
    ? import.meta.env.VITE_API_URL
    : '/api';

/**
 * Get base URL without /api suffix (for static files)
 * Returns empty string for relative URLs (same origin)
 */
export const getBaseUrl = (): string => {
  const baseUrl = API_BASE_URL || '';
  // Remove /api and /api/v1 suffix if present
  let result = baseUrl.replace(/\/api\/v1\/?$/, '');
  result = result.replace(/\/api\/?$/, '');
  
  // If result is empty or just '/', return empty string for relative URLs
  if (!result || result === '/') {
    return '';
  }
  
  return result;
};

/**
 * Build correct URL for media files
 * Uses API endpoint: /api/v1/media/serve/{model_type}/{collection}/{filename}
 * This is more reliable than static file mount
 * @param mediaUrl - URL from media record (format: /uploads/{model_type}/{collection}/{filename})
 * @returns Full URL for displaying the image
 */
export const getMediaUrl = (mediaUrl: string | null | undefined): string | null => {
  if (!mediaUrl) return null;
  
  // Parse URL to extract model_type, collection, and filename
  // Format: /uploads/{model_type}/{collection}/{filename}
  const urlMatch = mediaUrl.match(/\/uploads\/([^\/]+)\/([^\/]+)\/(.+)$/);
  
  if (urlMatch) {
    // Use API endpoint: /api/v1/media/serve/{model_type}/{collection}/{filename}
    const [, modelType, collection, filename] = urlMatch;
    // Don't double-encode filename - FastAPI :path parameter handles encoding
    // Just use the filename as-is, but ensure it's properly formatted
    const cleanFilename = filename;
    
    // Ensure API_BASE_URL ends with /api or /api/v1, then add /media/serve
    let apiUrl: string;
    if (API_BASE_URL.endsWith('/api/v1')) {
      apiUrl = `${API_BASE_URL}/media/serve/${modelType}/${collection}/${cleanFilename}`;
    } else if (API_BASE_URL.endsWith('/api')) {
      apiUrl = `${API_BASE_URL}/v1/media/serve/${modelType}/${collection}/${cleanFilename}`;
    } else {
      // Fallback: assume /api/v1 structure
      apiUrl = `${API_BASE_URL}/api/v1/media/serve/${modelType}/${collection}/${cleanFilename}`;
    }
    
    // Debug logging (can be removed in production)
    if (import.meta.env.DEV) {
      console.log('Media URL:', { original: mediaUrl, final: apiUrl, apiBaseUrl: API_BASE_URL, filename: cleanFilename });
    }
    
    return apiUrl;
  }
  
  // Fallback: if URL doesn't match expected format, try to use static file mount
  // Ensure URL starts with /
  let imageUrl = mediaUrl.startsWith('/') ? mediaUrl : '/' + mediaUrl;
  
  // If API_BASE_URL is absolute (http://...), use it to build full URL
  // Otherwise use relative URL (same origin)
  if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
    // Extract base URL without /api
    const baseUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    imageUrl = `${baseUrl}${imageUrl}`;
  }
  
  // Debug logging (can be removed in production)
  if (import.meta.env.DEV) {
    console.log('Media URL (fallback):', { original: mediaUrl, final: imageUrl, apiBaseUrl: API_BASE_URL });
  }
  
  return imageUrl;
};

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

async function parseResponseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Mint access_token baru via cookie HttpOnly refresh_token (POST /auth/refresh).
 * Dipakai saat access JWT habis masa berlaku tetapi pengguna masih punya sesi refresh.
 */
export async function tryRefreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        return res.ok;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function shouldAttemptRefreshOn401(requestUrl: string): boolean {
  return (
    !requestUrl.includes('/auth/login') &&
    !requestUrl.includes('/auth/register') &&
    !requestUrl.includes('/auth/refresh')
  );
}

/**
 * Helper function untuk membuat request ke API
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  allowRefreshRetry = true
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Token sekarang disimpan di HttpOnly cookie oleh backend
  // Browser akan otomatis mengirim cookie, jadi tidak perlu Authorization header
  // Tapi kita tetap support Authorization header untuk backward compatibility

  const config: RequestInit = {
    ...options,
    credentials: 'include', // Penting: kirim cookies dengan setiap request
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await parseResponseBody(response);

    if (
      response.status === 401 &&
      allowRefreshRetry &&
      shouldAttemptRefreshOn401(url)
    ) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return apiRequest<T>(endpoint, options, false);
      }
      return {
        success: false,
        message: 'Session telah berakhir. Silakan login kembali.',
        error: 'Session expired',
      };
    }

    if (!response.ok) {
      // Jika error dari backend, gunakan message atau error field
      const errorMessage =
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        'Terjadi kesalahan';
      return {
        success: false,
        message: errorMessage,
        error:
          (typeof data.error === 'string' && data.error) ||
          (typeof data.message === 'string' && data.message) ||
          errorMessage,
      };
    }

    // Backend mengembalikan { status: "success", data: {...}, message?: ... }
    // Konversi ke format ApiResponse yang diharapkan frontend
    const isSuccess = data.status === "success" || data.success === true;
    return {
      success: isSuccess,
      message:
        (typeof data.message === 'string' && data.message) ||
        (isSuccess ? "Success" : "Error"),
      data: data.data as T | undefined,
      error:
        (typeof data.error === 'string' && data.error) ||
        (!isSuccess && typeof data.message === 'string' ? data.message : undefined),
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Gagal terhubung ke server',
      error: error.message || 'Network error',
    };
  }
}

/**
 * Auth API functions
 */
export const authAPI = {
  /**
   * Register user baru
   */
  register: async (data: {
    username: string;
    email: string;
    password: string;
    firstname: string;
    lastname: string;
  }) => {
    return apiRequest<{
      id: string;
      username: string;
      email: string;
      firstname: string;
      lastname: string;
      fullname: string;
      created_at: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Login user
   */
  login: async (data: { email: string; password: string; remember_me?: boolean }) => {
    return apiRequest<{
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string;
      };
      token: string;
      refreshToken: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get current user data
   */
  getMe: async () => {
    return apiRequest<{
      id: string;
      username: string;
      email: string;
      firstname: string;
      lastname: string;
      fullname: string | null;
      phone_number?: string | null;
      created_at?: string;
      updated_at?: string;
      roles?: {
        id: number;
        name: string;
        guard_name: string;
      }[];
      permissions?: {
        id: number;
        name: string;
        guard_name: string;
      }[];
      impersonatedBy?: {
        id: string;
        username: string;
        email: string;
      } | null;
    }>('/users/me', {
      method: 'GET',
    });
  },

};

/** Payload returned in `data` after a successful media upload */
export type MediaUploadRecord = {
  id: number;
  url: string;
  file_name?: string;
  mime_type?: string;
  size?: number;
};

export type MediaUploadResult =
  | { success: true; message: string; data: MediaUploadRecord }
  | { success: false; message: string; error?: string };

/**
 * Media API functions
 */
export const mediaAPI = {
  /**
   * Upload a single media file
   */
  uploadMedia: async (
    file: File,
    model_type: string,
    model_id: string,
    collection: string = 'default'
  ): Promise<MediaUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_type', model_type);
    formData.append('model_id', model_id);
    formData.append('collection', collection);

    // Token sekarang di HttpOnly cookie, browser akan otomatis mengirim
    // Don't set Content-Type for FormData, browser will set it with boundary
    const headers: HeadersInit = {};

    try {
      const doUpload = () =>
        fetch(`${API_BASE_URL}/media/upload`, {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include', // Important: include cookies for authentication
        });

      let response = await doUpload();

      if (response.status === 401) {
        const refreshed = await tryRefreshSession();
        if (refreshed) {
          response = await doUpload();
        }
      }

      const data = await parseResponseBody(response);

      if (!response.ok) {
        return {
          success: false,
          message:
            (typeof data.message === 'string' && data.message) ||
            (typeof data.error === 'string' && data.error) ||
            'Gagal mengupload file',
          error:
            (typeof data.error === 'string' && data.error) ||
            (typeof data.message === 'string' && data.message) ||
            'Upload failed',
        };
      }

      return {
        success: true,
        message: (typeof data.message === 'string' && data.message) || 'File berhasil diupload',
        data: data.data as MediaUploadRecord,
      };
    } catch (error: any) {
      console.error('Upload media error:', error);
      return {
        success: false,
        message: error.message || 'Terjadi kesalahan saat mengupload file',
        error: error.message || 'Network error',
      };
    }
  },

  /**
   * Get media by ID
   */
  getMediaById: async (id: number) => {
    return apiRequest<{
      id: number;
      model_type: string;
      model_id: string;
      collection: string;
      url: string;
      file_name: string;
      mime_type: string;
      size: number;
      created_at: string;
    }>(`/media/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Get media by model_type and model_id
   */
  getMediaByModel: async (model_type: string, model_id: string, collection?: string) => {
    const queryParams = new URLSearchParams();
    queryParams.append('model_type', model_type);
    queryParams.append('model_id', model_id);
    if (collection) queryParams.append('collection', collection);

    const endpoint = `/media/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiRequest<{
      media: Array<{
        id: number;
        model_type: string;
        model_id: string;
        collection: string;
        url: string;
        file_name: string;
        mime_type: string;
        size: number;
        created_at: string;
      }>;
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Delete media by ID
   */
  deleteMedia: async (id: number) => {
    return apiRequest<{ message: string }>(`/media/${id}`, {
      method: 'DELETE',
      credentials: 'include', // Kirim cookies
    });
  },

  /**
   * Delete file by URL (for settings)
   */
  deleteFileByUrl: async (url: string) => {
    return apiRequest<{ deleted: boolean }>('/media/delete-by-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
      credentials: 'include',
    });
  },
};

/**
 * Helper untuk menghapus token (logout)
 * Token sekarang di HttpOnly cookie, jadi perlu request ke backend (/auth/logout)
 */
export const removeAuthToken = async () => {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    // Jangan blokir logout frontend jika request gagal,
    // cookie akan expire sendiri sesuai masa berlaku.
    console.warn('Failed to call /auth/logout, session will expire by itself.', err);
  }
};

/**
 * Helper untuk menghapus admin token saja
 * Token sekarang di HttpOnly cookie, jadi kita perlu request ke backend untuk clear
 */
export const removeAdminToken = async () => {
  // Admin token akan di-clear oleh backend saat stopImpersonate
  // Tidak perlu action khusus di frontend
};

/**
 * Helper untuk mendapatkan token
 * Catatan: Token sekarang di HttpOnly cookie, jadi tidak bisa diakses dari JavaScript
 * Fungsi ini tetap ada untuk backward compatibility, tapi akan return null
 */
export const getAuthToken = (): string | null => {
  // Token di HttpOnly cookie, tidak bisa diakses dari JavaScript
  return null;
};

/**
 * Helper untuk mendapatkan admin token asli
 * Catatan: Token sekarang di HttpOnly cookie, jadi tidak bisa diakses dari JavaScript
 */
export const getAdminToken = (): string | null => {
  // Token di HttpOnly cookie, tidak bisa diakses dari JavaScript
  return null;
};

/**
 * Helper untuk mendapatkan refresh token
 * Catatan: Token sekarang di HttpOnly cookie, jadi tidak bisa diakses dari JavaScript
 */
export const getRefreshToken = (): string | null => {
  // Token di HttpOnly cookie, tidak bisa diakses dari JavaScript
  return null;
};

/**
 * Helper untuk menyimpan token (deprecated - token sekarang di-set oleh backend)
 * Tetap ada untuk backward compatibility, tapi tidak melakukan apa-apa
 */
export const setAuthToken = (_token: string) => {
  // Token sekarang di-set oleh backend sebagai HttpOnly cookie
  // Tidak perlu action di frontend
  console.warn('setAuthToken is deprecated - token is now set by backend as HttpOnly cookie');
};

/**
 * Helper untuk menyimpan refresh token (deprecated - token sekarang di-set oleh backend)
 * Tetap ada untuk backward compatibility, tapi tidak melakukan apa-apa
 */
export const setRefreshToken = (_refreshToken: string) => {
  // Token sekarang di-set oleh backend sebagai HttpOnly cookie
  // Tidak perlu action di frontend
  console.warn('setRefreshToken is deprecated - token is now set by backend as HttpOnly cookie');
};

/**
 * Helper untuk menyimpan admin token (deprecated - token sekarang di-set oleh backend)
 * Tetap ada untuk backward compatibility, tapi tidak melakukan apa-apa
 */
export const setAdminToken = (_token: string) => {
  // Token sekarang di-set oleh backend sebagai HttpOnly cookie
  // Tidak perlu action di frontend
  console.warn('setAdminToken is deprecated - token is now set by backend as HttpOnly cookie');
};

/**
 * User API functions
 */
export const userAPI = {
  /**
   * Get all users with pagination and search
   */
  getAllUsers: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);

    const queryString = queryParams.toString();
    // Backend route didefinisikan di "/" dengan prefix "/users" -> butuh trailing slash
    const endpoint = `/users/${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      users: Array<{
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        phone_number: string | null;
        created_at: string | null;
        updated_at: string | null;
        roles?: Array<{
          id: number;
          name: string;
          guard_name: string;
        }>;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Get user by ID
   */
  getUserById: async (id: string) => {
    return apiRequest<{
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
    }>(`/users/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Create new user
   */
  createUser: async (data: {
    username: string;
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    fullname?: string | null;
    phone_number?: string | null;
    roleIds?: (string | number)[];
    nim?: string;
    major?: string | null;
    batch?: string | null;
    room_number?: string | null;
  }) => {
    // Prepare request body: convert roleIds to role_ids (snake_case) and ensure integers
    const requestBody: any = {
      username: data.username,
      email: data.email,
      password: data.password,
      firstname: data.firstname,
      lastname: data.lastname,
      fullname: data.fullname,
      phone_number: data.phone_number,
    };

    // Convert roleIds to role_ids (snake_case) and ensure it's an array of integers
    if (data.roleIds && data.roleIds.length > 0) {
      requestBody.role_ids = data.roleIds.map(id => Number(id));
    }

    return apiRequest<{
      id: string;
      username: string;
      email: string;
      firstname: string;
      lastname: string;
      fullname: string | null;
      phone_number: string | null;
      created_at: string;
      updated_at: string;
      roles: Array<{
        id: number;
        name: string;
        guard_name: string;
      }>;
    }>('/users/', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  },

  /**
   * Update user by ID
   */
  updateUser: async (id: string, data: {
    firstname: string;
    lastname: string;
    username?: string;
    fullname?: string | null;
    phone_number?: string | null;
    email?: string;
    // User profile fields
    nim?: string;
    major?: string | null;
    batch?: string | null;
    room_number?: string | null;
  }) => {
    return apiRequest<{
      id: string;
      username: string;
      email: string;
      firstname: string;
      lastname: string;
      fullname: string | null;
      phone_number: string | null;
      created_at: string;
      updated_at: string;
      user_profile: {
        id: string;
        nim: string;
        major: string | null;
        batch: string | null;
        room_number: string | null;
      } | null;
    }>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update user roles
   */
  updateUserRoles: async (id: string, roleIds: (string | number)[]) => {
    return apiRequest<{
      roles: Array<{
        id: number;
        name: string;
        guard_name: string;
      }>;
    }>(`/users/${id}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ role_ids: roleIds }),
    });
  },

  /**
   * Impersonate a user (superadmin only)
   */
  impersonateUser: async (userId: string) => {
    return apiRequest<{
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        roles: Array<{
          id: number;
          name: string;
          guard_name: string;
        }>;
      };
      impersonated_by: {
        id: string;
        username: string;
        email: string;
      };
    }>(`/users/${userId}/impersonate`, {
      method: 'POST',
    });
  },

  /**
   * Stop impersonation and return to original admin
   */
  stopImpersonate: async () => {
    return apiRequest<{
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        roles: Array<{
          id: number;
          name: string;
          guard_name: string;
        }>;
      };
      redirect_url: string;
    }>('/users/stop-impersonate', {
      method: 'POST',
    });
  },

  /**
   * Get all deleted users
   */
  getDeletedUsers: async (params?: { page?: number; limit?: number; search?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    const endpoint = `/users/deleted${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiRequest<{
      users: Array<{
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        phone_number: string | null;
        created_at: string | null;
        updated_at: string | null;
        deleted_at: string | null;
        user_profile: {
          id: string;
          nim: string;
          major: string | null;
          batch: string | null;
          room_number: string | null;
        } | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Delete user by ID (soft delete)
   */
  deleteUser: async (id: string) => {
    return apiRequest<null>(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Force delete user by ID (hard delete)
   */
  forceDeleteUser: async (id: string) => {
    return apiRequest<null>(`/users/${id}/force`, {
      method: 'DELETE',
    });
  },

  /**
   * Verify user email
   */
  verifyUserEmail: async (id: string) => {
    return apiRequest<{
      email_verified_at: string;
    }>(`/users/${id}/verify-email`, {
      method: 'POST',
    });
  },

  /**
   * Send verification email
   */
  sendVerificationEmail: async (id: string) => {
    return apiRequest<{
      message: string;
    }>(`/users/${id}/send-verification-email`, {
      method: 'POST',
    });
  },

  /**
   * Reset user password (admin only)
   */
  resetPassword: async (id: string, data: { password: string; confirm_password: string }) => {
    return apiRequest<{
      message: string;
    }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update current user profile
   */
  updateMyProfile: async (data: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone_number?: string | null;
    username?: string;
  }) => {
    return apiRequest<{
      id: string;
      username: string;
      email: string;
      firstname: string;
      lastname: string;
      fullname: string | null;
      phone_number: string | null;
      created_at: string;
      updated_at: string;
      roles?: Array<{
        id: number;
        name: string;
        guard_name: string;
      }>;
    }>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Change current user password
   * Menggunakan endpoint /users/me/change-password dengan validasi password lama
   * Endpoint ini perlu dibuat di backend untuk validasi password lama sebelum update
   */
  changePassword: async (data: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) => {
    return apiRequest<{
      message: string;
    }>('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: data.current_password,
        password: data.new_password,
        confirm_password: data.confirm_password,
      }),
    });
  },
};

/**
 * Role API functions
 */
export const roleAPI = {
  /**
   * Get all roles with pagination and search
   */
  getAllRoles: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);

    const queryString = queryParams.toString();
    // Backend route didefinisikan di "/" dengan prefix "/roles" -> butuh trailing slash
    const endpoint = `/roles/${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      roles: Array<{
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
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Get role by ID
   */
  getRoleById: async (id: string | number) => {
    return apiRequest<{
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
      users: Array<{
        id: string;
        username: string;
        email: string;
        fullname: string | null;
      }>;
      created_at: string | null;
      updated_at: string | null;
    }>(`/roles/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Get all permissions
   */
  getAllPermissions: async () => {
    return apiRequest<{
      permissions: Array<{
        id: number;
        name: string;
        guard_name: string;
        created_at: string | null;
        updated_at: string | null;
      }>;
    }>('/roles/permissions', {
      method: 'GET',
    });
  },

  /**
   * Update role details (name, guard_name)
   */
  updateRole: async (id: string | number, data: { name: string; guard_name: string }) => {
    return apiRequest<{
      id: string;
      name: string;
      guard_name: string;
      created_at: string | null;
      updated_at: string | null;
    }>(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update role permissions
   */
  updateRolePermissions: async (id: string | number, permissionIds: (string | number)[]) => {
    // Backend mengharapkan List[int], jadi konversi semua ke number
    const permissionIdsAsNumbers = permissionIds.map(id => Number(id));
    return apiRequest<{
      permissions: Array<{
        id: number;
        name: string;
        guard_name: string;
      }>;
    }>(`/roles/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permission_ids: permissionIdsAsNumbers }),
    });
  },
};

/**
 * Complaint API functions
 */
export const complaintAPI = {
  /**
   * Get all complaints with pagination and search
   */
  getAllComplaints: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    user_id?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.priority) queryParams.append('priority', params.priority);
    if (params?.user_id) queryParams.append('user_id', params.user_id);

    const queryString = queryParams.toString();
    const endpoint = `/complaints${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      complaints: Array<{
        id: string;
        ticket_number: string;
        user_id: string;
        description: string;
        priority: 'HIGH' | 'MEDIUM' | 'LOW';
        status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
        created_at: string;
        user: {
          id: string;
          username: string;
          email: string;
          phone_number: string | null;
          firstname: string;
          lastname: string;
          fullname: string | null;
          user_profile: {
            id: string;
            nim: string;
            room_number: string | null;
            major: string | null;
            batch: string | null;
          } | null;
        } | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Get complaint by ID
   */
  getComplaintById: async (id: string) => {
    return apiRequest<{
      id: string;
      ticket_number: string;
      user_id: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
      created_at: string;
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
      } | null;
    }>(`/complaints/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Create new complaint
   */
  createComplaint: async (data: {
    description: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    user_id: string;
  }) => {
    return apiRequest<{
      id: string;
      ticket_number: string;
      user_id: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
      created_at: string;
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
      } | null;
    }>('/complaints', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update complaint by ID
   */
  updateComplaint: async (id: string, data: {
    description?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    status?: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
  }) => {
    return apiRequest<{
      id: string;
      ticket_number: string;
      user_id: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
      created_at: string;
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
      } | null;
    }>(`/complaints/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update complaint status with log
   */
  updateComplaintStatus: async (id: string, status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED', notes?: string) => {
    return apiRequest<{
      id: string;
      ticket_number: string;
      user_id: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
      created_at: string;
      user: {
        id: string;
        username: string;
        email: string;
        phone_number: string | null;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
      logs: Array<{
        id: number;
        complaint_id: string;
        status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
        notes: string | null;
        action_by: string;
        role_name: string;
        created_at: string;
        action_by_user: {
          id: string;
          username: string;
          email: string;
          firstname: string;
          lastname: string;
          fullname: string | null;
        } | null;
      }>;
    }>(`/complaints/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  },

  /**
   * Delete complaint by ID
   */
  deleteComplaint: async (id: string) => {
    return apiRequest<null>(`/complaints/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get complaints by user ID
   */
  getComplaintsByUserId: async (userId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.priority) queryParams.append('priority', params.priority);

    const queryString = queryParams.toString();
    const endpoint = `/complaints/user/${userId}${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      complaints: Array<{
        id: string;
        ticket_number: string;
        user_id: string;
        description: string;
        priority: 'HIGH' | 'MEDIUM' | 'LOW';
        status: 'PENDING' | 'PROCESS' | 'COMPLETED' | 'REJECTED';
        created_at: string;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },
};

/**
 * Curfew Permission API functions
 */
/**
 * Settings API functions
 */
export const settingAPI = {
  /**
   * Get all settings
   */
  getAll: async () => {
    return apiRequest<Array<{
      id: number;
      group: string;
      name: string;
      locked: number;
      payload: any;
      created_at: string;
      updated_at: string;
    }>>('/settings', {
      method: 'GET',
    });
  },

  /**
   * Get settings by group
   */
  getByGroup: async (groupName: string) => {
    return apiRequest<Record<string, any>>(`/settings/group/${groupName}`, {
      method: 'GET',
    });
  },

  /**
   * Get one setting
   */
  getOne: async (groupName: string, settingName: string) => {
    return apiRequest<{ value: any }>(`/settings/${groupName}/${settingName}`, {
      method: 'GET',
    });
  },

  /**
   * Create or update setting (upsert)
   */
  upsert: async (data: {
    group: string;
    name: string;
    payload: any;
    locked?: boolean;
  }) => {
    return apiRequest<{
      id: number;
      group: string;
      name: string;
      locked: number;
      payload: any;
      created_at: string;
      updated_at: string;
    }>('/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update setting
   */
  update: async (
    groupName: string,
    settingName: string,
    data: {
      payload?: any;
      locked?: boolean;
    }
  ) => {
    return apiRequest<{
      id: number;
      group: string;
      name: string;
      locked: number;
      payload: any;
      created_at: string;
      updated_at: string;
    }>(`/settings/${groupName}/${settingName}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update multiple settings
   */
  updateMultiple: async (settings: Array<{
    group: string;
    name: string;
    payload: any;
    locked?: boolean;
  }>) => {
    return apiRequest<Array<{
      id: number;
      group: string;
      name: string;
      locked: number;
      payload: any;
      created_at: string;
      updated_at: string;
    }>>('/settings/multiple', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  },

  /**
   * Delete setting
   */
  delete: async (groupName: string, settingName: string) => {
    return apiRequest(`/settings/${groupName}/${settingName}`, {
      method: 'DELETE',
    });
  },
};

export const curfewPermissionAPI = {
  /**
   * Get all curfew permissions with pagination and search
   */
  getAllCurfewPermissions: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    user_id?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.user_id) queryParams.append('user_id', params.user_id);

    const queryString = queryParams.toString();
    const endpoint = `/curfew-permissions${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      permissions: Array<{
        id: string;
        permission_number: string;
        user_id: string;
        reason: string;
        out_time: string;
        expected_return: string;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        created_at: string;
        updated_at: string;
        updated_by: string | null;
        user: {
          id: string;
          username: string;
          email: string;
          phone_number: string | null;
          firstname: string;
          lastname: string;
          fullname: string | null;
          user_profile: {
            id: string;
            nim: string;
            room_number: string | null;
            major: string | null;
            batch: string | null;
          } | null;
        } | null;
        updated_by_user: {
          id: string;
          username: string;
          email: string;
          firstname: string;
          lastname: string;
          fullname: string | null;
        } | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Get curfew permission by ID
   */
  getCurfewPermissionById: async (id: string) => {
    return apiRequest<{
      id: string;
      permission_number: string;
      user_id: string;
      reason: string;
      out_time: string;
      expected_return: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      created_at: string;
      updated_at: string;
      updated_by: string | null;
      user: {
        id: string;
        username: string;
        email: string;
        phone_number: string | null;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
      updated_by_user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
      } | null;
      active_token: {
        id: string;
        token: string;
        curfew_id: string;
        created_at: string;
        updated_at: string;
      } | null;
    }>(`/curfew-permissions/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Create new curfew permission
   */
  createCurfewPermission: async (data: {
    reason: string;
    out_time: string;
    expected_return: string;
    user_id: string;
  }) => {
    return apiRequest<{
      id: string;
      permission_number: string;
      user_id: string;
      reason: string;
      out_time: string;
      expected_return: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      created_at: string;
      updated_at: string;
      updated_by: string | null;
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
    }>('/curfew-permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update curfew permission by ID
   */
  updateCurfewPermission: async (id: string, data: {
    reason?: string;
    out_time?: string;
    expected_return?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  }) => {
    return apiRequest<{
      id: string;
      permission_number: string;
      user_id: string;
      reason: string;
      out_time: string;
      expected_return: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      created_at: string;
      updated_at: string;
      updated_by: string | null;
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
      updated_by_user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
      } | null;
      active_token: {
        id: string;
        token: string;
        curfew_id: string;
        created_at: string;
        updated_at: string;
      } | null;
    }>(`/curfew-permissions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update curfew permission status only
   */
  updateCurfewPermissionStatus: async (id: string, status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    return apiRequest<{
      id: string;
      permission_number: string;
      user_id: string;
      reason: string;
      out_time: string;
      expected_return: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      created_at: string;
      updated_at: string;
      updated_by: string | null;
      user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
      updated_by_user: {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string | null;
      } | null;
      active_token: {
        id: string;
        token: string;
        curfew_id: string;
        created_at: string;
        updated_at: string;
      } | null;
    }>(`/curfew-permissions/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  /**
   * Get curfew violation by curfew permission ID
   */
  getCurfewViolationByPermissionId: async (id: string) => {
    return apiRequest<{
      id: string;
      user_id: string | null;
      nim: string;
      student_name: string | null;
      curfew_id: string | null;
      actual_return: string;
      late_duration: number;
      note: string | null;
      created_at: string;
      user: {
        id: string;
        username: string;
        email: string;
        phone_number: string | null;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
      curfew_permission: {
        id: string;
        permission_number: string;
        user_id: string;
        reason: string;
        out_time: string;
        expected_return: string;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        created_at: string;
        updated_at: string;
        updated_by: string | null;
      } | null;
    } | null>(`/curfew-permissions/${id}/violation`, {
      method: 'GET',
    });
  },

  /**
   * Create curfew violation for a specific curfew permission
   */
  createCurfewViolation: async (id: string, data: { actual_return: string; note?: string | null }) => {
    return apiRequest<{
      id: string;
      user_id: string | null;
      nim: string;
      student_name: string | null;
      curfew_id: string | null;
      actual_return: string;
      late_duration: number;
      note: string | null;
      created_at: string;
    }>(`/curfew-permissions/${id}/violation`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Create curfew violation manually (supports manual input for students without account or permission)
   */
  createCurfewViolationManual: async (data: {
    user_id?: string | null;
    nim: string;
    student_name?: string | null;
    curfew_id?: string | null;
    actual_return: string;
    late_duration?: number;
    note?: string | null;
  }) => {
    return apiRequest<{
      id: string;
      user_id: string | null;
      nim: string;
      student_name: string | null;
      curfew_id: string | null;
      actual_return: string;
      late_duration: number;
      note: string | null;
      created_at: string;
      user: {
        id: string;
        username: string;
        email: string;
        phone_number: string | null;
        firstname: string;
        lastname: string;
        fullname: string | null;
        user_profile: {
          id: string;
          nim: string;
          room_number: string | null;
          major: string | null;
          batch: string | null;
        } | null;
      } | null;
      curfew_permission: {
        id: string;
        permission_number: string;
        user_id: string;
        reason: string;
        out_time: string;
        expected_return: string;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        created_at: string;
      } | null;
    }>('/curfew-permissions/violations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete curfew permission by ID
   */
  deleteCurfewPermission: async (id: string) => {
    return apiRequest<null>(`/curfew-permissions/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get all curfew violations with pagination and search
   */
  getAllCurfewViolations: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    user_id?: string;
    curfew_id?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.user_id) queryParams.append('user_id', params.user_id);
    if (params?.curfew_id) queryParams.append('curfew_id', params.curfew_id);

    const queryString = queryParams.toString();
    const endpoint = `/curfew-permissions/violations${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      violations: Array<{
        id: string;
        user_id: string | null;
        nim: string;
        student_name: string | null;
        curfew_id: string | null;
        actual_return: string;
        late_duration: number;
        note: string | null;
        created_at: string;
        user: {
          id: string;
          username: string;
          email: string;
          phone_number: string | null;
          firstname: string;
          lastname: string;
          fullname: string | null;
          user_profile: {
            id: string;
            nim: string;
            room_number: string | null;
            major: string | null;
            batch: string | null;
          } | null;
        } | null;
        curfew_permission: {
          id: string;
          permission_number: string;
          user_id: string;
          reason: string;
          out_time: string;
          expected_return: string;
          status: 'PENDING' | 'APPROVED' | 'REJECTED';
          created_at: string;
        } | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Get curfew permissions by user ID
   */
  getCurfewPermissionsByUserId: async (userId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);

    const queryString = queryParams.toString();
    const endpoint = `/curfew-permissions/user/${userId}${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      permissions: Array<{
        id: string;
        permission_number: string;
        user_id: string;
        reason: string;
        out_time: string;
        expected_return: string;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        created_at: string;
        updated_at: string;
        updated_by: string | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },
};

/**
 * Student API functions
 */
export const studentAPI = {
  /**
   * Get all students with pagination and search
   */
  getAllStudents: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());

    const queryString = queryParams.toString();
    // Backend route didefinisikan di path "/" dengan prefix "/students" -> butuh trailing slash
    const endpoint = `/students/${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      students: Array<{
        id: string;
        student_number: string;
        fullname: string;
        phone_number: string | null;
        guardian_name: string | null;
        is_active: boolean;
        created_at: string | null;
        updated_at: string | null;
        deleted_at: string | null;
        created_by: string | null;
        deleted_by: string | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Get student by ID
   */
  getStudentById: async (id: string) => {
    return apiRequest<{
      id: string;
      student_number: string;
      fullname: string;
      phone_number: string | null;
      guardian_name: string | null;
      is_active: boolean;
      created_at: string | null;
      updated_at: string | null;
      deleted_at: string | null;
      created_by: string | null;
      deleted_by: string | null;
    }>(`/students/${id}`, {
      method: 'GET',
    });
  },

  /**
   * Create new student
   */
  createStudent: async (data: {
    student_number: string;
    fullname: string;
    phone_number?: string | null;
    guardian_name?: string | null;
    is_active?: boolean;
  }) => {
    return apiRequest<{
      id: string;
      student_number: string;
      fullname: string;
      phone_number: string | null;
      guardian_name: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>('/students/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update student by ID
   */
  updateStudent: async (id: string, data: {
    student_number?: string;
    fullname?: string;
    phone_number?: string | null;
    guardian_name?: string | null;
    is_active?: boolean;
  }) => {
    return apiRequest<{
      id: string;
      student_number: string;
      fullname: string;
      phone_number: string | null;
      guardian_name: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get all deleted students
   */
  getDeletedStudents: async (params?: { page?: number; limit?: number; search?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    const queryString = queryParams.toString();
    const endpoint = `/students/deleted${queryString ? `?${queryString}` : ''}`;
    return apiRequest<{
      students: Array<{
        id: string;
        student_number: string;
        fullname: string;
        phone_number: string | null;
        guardian_name: string | null;
        is_active: boolean;
        created_at: string | null;
        updated_at: string | null;
        deleted_at: string | null;
        created_by: string | null;
        deleted_by: string | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * Delete student by ID (soft delete)
   */
  deleteStudent: async (id: string) => {
    return apiRequest<null>(`/students/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Restore soft-deleted student
   */
  restoreStudent: async (id: string) => {
    return apiRequest<{
      id: string;
      student_number: string;
      fullname: string;
      phone_number: string | null;
      guardian_name: string | null;
      is_active: boolean;
      created_at: string | null;
      updated_at: string | null;
      deleted_at: string | null;
      created_by: string | null;
      deleted_by: string | null;
    }>(`/students/${id}/restore`, {
      method: 'POST',
    });
  },

  /**
   * Force delete student by ID (hard delete)
   */
  forceDeleteStudent: async (id: string) => {
    return apiRequest<null>(`/students/${id}/force`, {
      method: 'DELETE',
    });
  },
};

/** Master layanan tambahan (addon) untuk order */
export const addonAPI = {
  listAddons: async (params?: { page?: number; limit?: number; active_only?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.active_only === false) queryParams.append("active_only", "false");
    const queryString = queryParams.toString();
    const endpoint = `/addons/${queryString ? `?${queryString}` : ""}`;
    return apiRequest<{
      addons: Array<{
        id: string;
        name: string;
        price: number;
        description: string | null;
        is_active: boolean;
        created_at?: string | null;
        updated_at?: string | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, { method: "GET" });
  },
};

/**
 * Order API functions
 */
export const orderAPI = {
  /**
   * Get all orders with pagination and search
   */
  getAllOrders: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    student_id?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.search) queryParams.append("search", params.search);
    if (params?.status) queryParams.append("status", params.status);
    if (params?.student_id) queryParams.append("student_id", params.student_id);

    const queryString = queryParams.toString();
    // Backend route didefinisikan di path "/" dengan prefix "/orders" -> butuh trailing slash
    const endpoint = `/orders/${queryString ? `?${queryString}` : ""}`;

    return apiRequest<{
      orders: Array<{
        id: string;
        order_number: string;
        student_id: string;
        invoice_id: string | null;
        total_items: number;
        free_items_used: number;
        paid_items_count: number;
        additional_fee: number;
        total_addon_fee?: number;
        current_status: string;
        notes: string | null;
        created_at: string | null;
        updated_at: string | null;
        created_by: string | null;
        updated_by: string | null;
        addons?: Array<{
          id: string;
          addon_id: string;
          name: string;
          price: number;
          count: number;
          subtotal: number;
        }>;
        student?: {
          id: string;
          fullname: string;
          student_number: string;
        };
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: "GET",
    });
  },

  /**
   * Get order by ID (with tracking history)
   */
  getOrderById: async (id: string) => {
    return apiRequest<{
      id: string;
      order_number: string;
      student_id: string;
      invoice_id: string | null;
      total_items: number;
      free_items_used: number;
      paid_items_count: number;
      additional_fee: number;
      total_addon_fee?: number;
      current_status: string;
      notes: string | null;
      created_at: string | null;
      updated_at: string | null;
      created_by: string | null;
      updated_by: string | null;
      addons?: Array<{
        id: string;
        addon_id: string;
        name: string;
        price: number;
        count: number;
        subtotal: number;
      }>;
      trackings: Array<{
        id: string;
        order_id: string;
        staff_id: string | null;
        status_to: string;
        notes: string | null;
        created_at: string;
      }>;
    }>(`/orders/${id}`, {
      method: "GET",
    });
  },

  /**
   * Create new order
   * Staff only inputs total_items, system automatically calculates:
   * - free_items_used (based on daily quota from settings)
   * - paid_items_count (items exceeding quota)
   * - additional_fee (paid_items_count * 4000)
   */
  createOrder: async (data: FormData | {
    student_id: string;
    total_items: number;
    notes?: string | null;
  }) => {
    // Check if data is FormData (for file upload) or regular object
    if (data instanceof FormData) {
      // For FormData, we need to make a custom request without JSON headers
      const url = `${API_BASE_URL}/orders/`;
      
      // Get auth token from cookies or localStorage
      const token = localStorage.getItem('token') || document.cookie
        .split('; ')
        .find(row => row.startsWith('token='))
        ?.split('=')[1];
      
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: data,
        credentials: "include", // Include cookies for authentication
        // Don't set Content-Type header, let browser set it with boundary for FormData
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        return {
          success: false,
          message: "Gagal memproses response dari server",
          error: "Invalid JSON response",
        };
      }
      
      if (!response.ok) {
        // Handle validation errors from FastAPI
        if (result.detail && Array.isArray(result.detail)) {
          const errorMessages = result.detail.map((err: any) => {
            if (typeof err === 'object' && err.msg) {
              return `${err.loc?.join('.')}: ${err.msg}`;
            }
            return String(err);
          }).join(', ');
          return {
            success: false,
            message: errorMessages || result.message || "Gagal membuat order",
            error: errorMessages || result.detail || result.message,
          };
        }
        
        return {
          success: false,
          message: result.message || result.detail || "Gagal membuat order",
          error: result.error || result.detail || result.message,
        };
      }

      return {
        success: result.status === "success",
        message: result.message || "Order berhasil dibuat",
        data: result.data,
      };
    } else {
      return apiRequest<{
        id: string;
        order_number: string;
        student_id: string;
        total_items: number;
        free_items_used: number;
        paid_items_count: number;
        additional_fee: number;
        current_status: string;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>("/orders/", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
  },

  /**
   * Update order (not status)
   * Staff only inputs total_items, system automatically recalculates:
   * - free_items_used (based on daily quota from settings)
   * - paid_items_count (items exceeding quota)
   * - additional_fee (paid_items_count * 4000)
   */
  updateOrder: async (
    id: string,
    data: {
      total_items?: number;
      notes?: string | null;
      addon_lines?: Array<{ addon_id: string; count: number }>;
    }
  ) => {
    return apiRequest<{
      id: string;
      order_number: string;
      student_id: string;
      total_items: number;
      free_items_used: number;
      paid_items_count: number;
      additional_fee: number;
      total_addon_fee?: number;
      current_status: string;
      notes: string | null;
      created_at: string;
      updated_at: string;
      addons?: Array<{
        id: string;
        addon_id: string;
        name: string;
        price: number;
        count: number;
        subtotal: number;
      }>;
    }>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete order by ID
   */
  deleteOrder: async (id: string) => {
    return apiRequest<null>(`/orders/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * Get order trackings
   */
  getOrderTrackings: async (id: string) => {
    return apiRequest<
      Array<{
        id: string;
        order_id: string;
        staff_id: string | null;
        status_to: string;
        notes: string | null;
        created_at: string;
      }>
    >(`/orders/${id}/trackings`, {
      method: "GET",
    });
  },

  /**
   * Create order tracking (update status)
   */
  createOrderTracking: async (
    id: string,
    data: {
      status_to: string;
      notes?: string | null;
    }
  ) => {
    return apiRequest<{
      id: string;
      order_number: string;
      student_id: string;
      total_items: number;
      free_items_used: number;
      paid_items_count: number;
      additional_fee: number;
      current_status: string;
      notes: string | null;
      created_at: string | null;
      updated_at: string | null;
      created_by: string | null;
      updated_by: string | null;
      trackings: Array<{
        id: string;
        order_id: string;
        staff_id: string | null;
        status_to: string;
        notes: string | null;
        created_at: string;
      }>;
    }>(`/orders/${id}/trackings`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

/**
 * Invoice API functions
 */
export const invoiceAPI = {
  getAllInvoices: async (params?: {
    page?: number;
    limit?: number;
    student_id?: string;
    billing_period?: string; // YYYY-MM-01
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.student_id) queryParams.append("student_id", params.student_id);
    if (params?.billing_period) queryParams.append("billing_period", params.billing_period);

    const endpoint = `/invoices/${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    return apiRequest<{
      invoices: Array<{
        id: string;
        invoice_number: string;
        student_id: string;
        billing_period: string;
        total_amount: number;
        status: "unpaid" | "waiting_confirmation" | "paid" | "cancelled";
        paid_at: string | null;
        created_at: string | null;
        updated_at: string | null;
        created_by: string | null;
        updated_by: string | null;
        deleted_at: string | null;
        deleted_by: string | null;
        student?: {
          id: string;
          fullname: string;
          student_number: string;
        };
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, {
      method: "GET",
    });
  },

  getEligibleOrders: async (params: { student_id: string; billing_period: string }) => {
    const queryParams = new URLSearchParams();
    queryParams.append("student_id", params.student_id);
    queryParams.append("billing_period", params.billing_period);

    return apiRequest<{
      orders: Array<{
        id: string;
        order_number: string;
        student_id: string;
        invoice_id: string | null;
        total_items: number;
        free_items_used: number;
        paid_items_count: number;
        additional_fee: number;
        total_addon_fee?: number;
        current_status: string;
        notes: string | null;
        created_at: string | null;
        updated_at: string | null;
        created_by: string | null;
        updated_by: string | null;
        addons?: Array<{
          id: string;
          addon_id: string;
          name: string;
          price: number;
          count: number;
          subtotal: number;
        }>;
      }>;
      total_amount: number;
    }>(`/invoices/eligible-orders?${queryParams.toString()}`, {
      method: "GET",
    });
  },

  createInvoice: async (data: { student_id: string; billing_period: string }) => {
    return apiRequest<{
      id: string;
      invoice_number: string;
      student_id: string;
      billing_period: string;
      total_amount: number;
      status: "unpaid" | "waiting_confirmation" | "paid" | "cancelled";
      paid_at: string | null;
      created_at: string | null;
      updated_at: string | null;
      created_by: string | null;
      updated_by: string | null;
      deleted_at: string | null;
      deleted_by: string | null;
    }>(`/invoices/`, {
      method: "POST",
      body: JSON.stringify({
        student_id: data.student_id,
        billing_period: data.billing_period,
      }),
    });
  },

  updateInvoice: async (
    invoice_id: string,
    data: { status: "unpaid" | "waiting_confirmation" | "paid" | "cancelled"; paid_at?: string | null }
  ) => {
    return apiRequest<{
      id: string;
      invoice_number: string;
      student_id: string;
      billing_period: string;
      total_amount: number;
      status: "unpaid" | "waiting_confirmation" | "paid" | "cancelled";
      paid_at: string | null;
      created_at: string | null;
      updated_at: string | null;
      created_by: string | null;
      updated_by: string | null;
      deleted_at: string | null;
      deleted_by: string | null;
    }>(`/invoices/${invoice_id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteInvoice: async (invoice_id: string) => {
    return apiRequest<null>(`/invoices/${invoice_id}`, {
      method: "DELETE",
    });
  },
};

/**
 * QR Code API functions
 */
export const qrCodeAPI = {
  /**
   * Get all QR codes with pagination and filters
   */
  getAllQRCodes: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    assigned?: boolean;
    dormitory?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.assigned !== undefined) queryParams.append('assigned', params.assigned.toString());
    if (params?.dormitory) queryParams.append('dormitory', params.dormitory);

    const queryString = queryParams.toString();
    const endpoint = `/qr-codes/${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      qr_codes: Array<{
        id: string;
        token_qr: string;
        dormitory: string | null;
        qr_number: string | null;
        unique_code: string | null;
        student_id: string | null;
        created_at: string | null;
        updated_at: string | null;
        student: {
          id: string;
          fullname: string;
          student_number: string;
        } | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint, { method: 'GET' });
  },

  /**
   * Lookup QR by token (used by ScanQR)
   */
  lookupQR: async (tokenQR: string) => {
    return apiRequest<{
      id: string;
      token_qr: string;
      dormitory: string | null;
      qr_number: string | null;
      unique_code: string | null;
      student_id: string | null;
      created_at: string | null;
      updated_at: string | null;
      student: {
        id: string;
        fullname: string;
        student_number: string;
      } | null;
    }>(`/qr-codes/lookup/${encodeURIComponent(tokenQR)}`, { method: 'GET' });
  },

  /**
   * Get QR by ID
   */
  getQRById: async (id: string) => {
    return apiRequest<{
      id: string;
      token_qr: string;
      dormitory: string | null;
      qr_number: string | null;
      unique_code: string | null;
      student_id: string | null;
      student: {
        id: string;
        fullname: string;
        student_number: string;
      } | null;
    }>(`/qr-codes/${id}`, { method: 'GET' });
  },

  /**
   * Create new QR code
   */
  createQR: async (data: {
    token_qr: string;
    dormitory?: string | null;
    qr_number?: string | null;
    unique_code?: string | null;
  }) => {
    return apiRequest<{
      id: string;
      token_qr: string;
      dormitory: string | null;
      qr_number: string | null;
      unique_code: string | null;
      student_id: string | null;
    }>('/qr-codes/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Auto-generate QR code with random token
   */
  generateQR: async (params?: {
    dormitory?: string;
    qr_number?: string;
    unique_code?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.dormitory) queryParams.append('dormitory', params.dormitory);
    if (params?.qr_number) queryParams.append('qr_number', params.qr_number);
    if (params?.unique_code) queryParams.append('unique_code', params.unique_code);

    const queryString = queryParams.toString();
    const endpoint = `/qr-codes/generate${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      id: string;
      token_qr: string;
      dormitory: string | null;
      qr_number: string | null;
      unique_code: string | null;
      student_id: string | null;
    }>(endpoint, { method: 'POST' });
  },

  /**
   * Update QR code metadata
   */
  updateQR: async (id: string, data: {
    dormitory?: string | null;
    qr_number?: string | null;
    unique_code?: string | null;
  }) => {
    return apiRequest<{
      id: string;
      token_qr: string;
      dormitory: string | null;
      qr_number: string | null;
      unique_code: string | null;
      student_id: string | null;
    }>(`/qr-codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Assign QR to student
   */
  assignQR: async (qrId: string, studentId: string) => {
    return apiRequest<{
      id: string;
      token_qr: string;
      student_id: string | null;
      student: {
        id: string;
        fullname: string;
        student_number: string;
      } | null;
    }>(`/qr-codes/${qrId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    });
  },

  /**
   * Release QR from student
   */
  releaseQR: async (qrId: string) => {
    return apiRequest<{
      id: string;
      token_qr: string;
      student_id: string | null;
    }>(`/qr-codes/${qrId}/release`, { method: 'POST' });
  },

  /**
   * Advance order status by scanning QR bag token (`token_qr`).
   * Backend picks next status and creates a tracking row.
   */
  advanceTrackingByQrToken: async (tokenQR: string, payload?: { notes?: string | null }) => {
    return apiRequest<{
      id: string;
      order_number: string;
      student_id: string;
      current_status: string;
      notes: string | null;
      trackings?: Array<{
        id: string;
        order_id: string;
        staff_id: string | null;
        status_to: string;
        notes: string | null;
        created_at: string;
      }>;
    }>(
      `/qr-codes/trackings/advance/${encodeURIComponent(tokenQR)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          notes: payload?.notes ?? null,
        }),
      }
    );
  },

  /**
   * Delete QR code
   */
  deleteQR: async (id: string) => {
    return apiRequest<null>(`/qr-codes/${id}`, { method: 'DELETE' });
  },

  /**
   * Bulk-generate QR codes for a dormitory.
   * - token_qr generated automatically
   * - qr_number sequential per dormitory
   * - unique_code format: {3-letter dormitory prefix}-{qr_number}
   */
  bulkGenerateQRs: async (payload: { dormitory: string; count: number }) => {
    return apiRequest<{
      dormitory: string;
      count: number;
      start_qr_number: number;
      end_qr_number: number;
      unique_code_prefix: string;
      preview?: Array<{
        id: string;
        token_qr: string;
        dormitory: string | null;
        qr_number: string | null;
        unique_code: string | null;
        student_id: string | null;
        created_at: string | null;
        updated_at: string | null;
        student: {
          id: string;
          fullname: string;
          student_number: string;
        } | null;
      }>;
    }>(`/qr-codes/bulk-generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const reportsAPI = {
  /**
   * Get operational report with transaction counts and revenue summary
   */
  getOperationalReport: async (params?: {
    period?: "daily" | "weekly" | "monthly";
    start_date?: string;
    end_date?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.append("period", params.period);
    if (params?.start_date) queryParams.append("start_date", params.start_date);
    if (params?.end_date) queryParams.append("end_date", params.end_date);

    const queryString = queryParams.toString();
    const endpoint = `/reports/operational${queryString ? `?${queryString}` : ""}`;

    return apiRequest<{
      period: string;
      start_date: string;
      end_date: string;
      summary: {
        total_transactions: number;
        free_transactions: number;
        paid_transactions: number;
        total_revenue: number;
      };
      breakdown: Array<{
        period: string;
        label: string;
        count: number;
        revenue: number;
      }>;
    }>(endpoint, {
      method: "GET",
    });
  },

  /**
   * Get order counts by status for all orders.
   * Exclude PICKED_UP on frontend to show "order dalam proses".
   */
  getOrdersByStatus: async () => {
    return apiRequest<{
      by_status: Array<{ status: string; count: number }>;
    }>("/reports/orders-by-status", {
      method: "GET",
    });
  },
};

/**
 * Dormitory API functions
 */
export const dormitoryAPI = {
  getAllDormitories: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.search) queryParams.append("search", params.search);

    const queryString = queryParams.toString();
    return apiRequest<{
      dormitories: Array<{
        id: string;
        name: string;
        description: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/dormitories/${queryString ? `?${queryString}` : ""}`, {
      method: "GET",
    });
  },

  createDormitory: async (data: {
    name: string;
    description?: string | null;
  }) => {
    return apiRequest<{
      id: string;
      name: string;
      description: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>(`/dormitories/`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateDormitory: async (id: string, data: { name?: string; description?: string | null }) => {
    return apiRequest<{
      id: string;
      name: string;
      description: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>(`/dormitories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteDormitory: async (id: string) => {
    return apiRequest<{
      id: string;
    }>(`/dormitories/${id}`, {
      method: "DELETE",
    });
  },
};
