
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

/**
 * Helper function untuk membuat request ke API
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
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
    const data = await response.json();

    // Jika token expired (401), langsung return error
    // Token sekarang di cookie, tidak ada refresh token mechanism
    if (response.status === 401 && !url.includes('/auth/login')) {
      // Session expired, user perlu login lagi
      return {
        success: false,
        message: 'Session telah berakhir. Silakan login kembali.',
        error: 'Session expired',
      };
    }

    if (!response.ok) {
      // Jika error dari backend, gunakan message atau error field
      const errorMessage = data.message || data.error || 'Terjadi kesalahan';
      return {
        success: false,
        message: errorMessage,
        error: data.error || data.message || errorMessage,
      };
    }

    // Backend mengembalikan { status: "success", data: {...}, message?: ... }
    // Konversi ke format ApiResponse yang diharapkan frontend
    const isSuccess = data.status === "success" || data.success === true;
    return {
      success: isSuccess,
      message: data.message || (isSuccess ? "Success" : "Error"),
      data: data.data,
      error: data.error || (!isSuccess ? data.message : undefined),
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

/**
 * Media API functions
 */
export const mediaAPI = {
  /**
   * Upload a single media file
   */
  uploadMedia: async (file: File, model_type: string, model_id: string, collection: string = 'default') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_type', model_type);
    formData.append('model_id', model_id);
    formData.append('collection', collection);

    // Token sekarang di HttpOnly cookie, browser akan otomatis mengirim
    // Don't set Content-Type for FormData, browser will set it with boundary
    const headers: HeadersInit = {};

    try {
      const response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include', // Important: include cookies for authentication
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || data.error || 'Gagal mengupload file',
          error: data.error || data.message || 'Upload failed',
        };
      }

      return {
        success: true,
        message: data.message || 'File berhasil diupload',
        data: data.data,
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

    const endpoint = `/media${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
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
 * Token sekarang di HttpOnly cookie, tidak bisa dihapus dari JavaScript
 * Cookie akan otomatis expire atau bisa dihapus oleh backend jika ada endpoint logout
 * Untuk sekarang, cukup clear state di frontend
 */
export const removeAuthToken = async () => {
  // Token disimpan di HttpOnly cookie, tidak bisa diakses/dihapus dari JavaScript
  // Cookie akan otomatis expire atau bisa dihapus oleh backend jika ada endpoint logout
  // Jika backend menambahkan endpoint logout, bisa dipanggil di sini
  console.log('Auth token will be cleared when cookie expires or user logs out');
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
    const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

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
    }>('/users', {
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
    const endpoint = `/roles${queryString ? `?${queryString}` : ''}`;

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
    const endpoint = `/students${queryString ? `?${queryString}` : ''}`;

    return apiRequest<{
      students: Array<{
        id: string;
        national_id_number: string;
        fullname: string;
        phone_number: string | null;
        dormitory: string | null;
        grade_level: string | null;
        unique_code: string | null;
        guardian_name: string | null;
        qr_code: string | null;
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
      national_id_number: string;
      fullname: string;
      phone_number: string | null;
      dormitory: string | null;
      grade_level: string | null;
      unique_code: string | null;
      guardian_name: string | null;
      qr_code: string | null;
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
    national_id_number: string;
    fullname: string;
    phone_number?: string | null;
    dormitory?: string | null;
    grade_level?: string | null;
    unique_code?: string | null;
    guardian_name?: string | null;
    qr_code?: string | null;
    is_active?: boolean;
  }) => {
    return apiRequest<{
      id: string;
      national_id_number: string;
      fullname: string;
      phone_number: string | null;
      dormitory: string | null;
      grade_level: string | null;
      unique_code: string | null;
      guardian_name: string | null;
      qr_code: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update student by ID
   */
  updateStudent: async (id: string, data: {
    national_id_number?: string;
    fullname?: string;
    phone_number?: string | null;
    dormitory?: string | null;
    grade_level?: string | null;
    unique_code?: string | null;
    guardian_name?: string | null;
    qr_code?: string | null;
    is_active?: boolean;
  }) => {
    return apiRequest<{
      id: string;
      national_id_number: string;
      fullname: string;
      phone_number: string | null;
      dormitory: string | null;
      grade_level: string | null;
      unique_code: string | null;
      guardian_name: string | null;
      qr_code: string | null;
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
        national_id_number: string;
        fullname: string;
        phone_number: string | null;
        dormitory: string | null;
        grade_level: string | null;
        unique_code: string | null;
        guardian_name: string | null;
        qr_code: string | null;
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
   * Force delete student by ID (hard delete)
   */
  forceDeleteStudent: async (id: string) => {
    return apiRequest<null>(`/students/${id}/force`, {
      method: 'DELETE',
    });
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
    const endpoint = `/orders${queryString ? `?${queryString}` : ""}`;

    return apiRequest<{
      orders: Array<{
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
        student?: {
          id: string;
          fullname: string;
          unique_code: string | null;
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
    }>(`/orders/${id}`, {
      method: "GET",
    });
  },

  /**
   * Create new order
   * Staff only inputs total_items, system automatically calculates:
   * - free_items_used (based on monthly quota: 4 free items per month)
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
      const url = `${API_BASE_URL}/orders`;
      
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
      }>("/orders", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
  },

  /**
   * Update order (not status)
   * Staff only inputs total_items, system automatically recalculates:
   * - free_items_used (based on monthly quota: 4 free items per month)
   * - paid_items_count (items exceeding quota)
   * - additional_fee (paid_items_count * 4000)
   */
  updateOrder: async (
    id: string,
    data: {
      total_items?: number;
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
      created_at: string;
      updated_at: string;
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
 * Reports API functions
 */
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
