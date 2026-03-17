import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { settingAPI, getBaseUrl } from '../utils/api';

interface SettingsData {
  general: {
    site_name?: string;
    site_tagline?: string;
    site_description?: string;
    company_name?: string;
    company_email?: string;
    company_phone?: string;
    company_address?: string;
    copyright_text?: string;
  };
  appearance: {
    site_logo?: string;
    site_logo_dark?: string;
    brand_logo_square?: string;
    site_favicon?: string;
  };
}

interface SettingsContextType {
  settings: SettingsData | null;
  isLoading: boolean;
  getLogoUrl: (dark?: boolean) => string;
  getBrandLogoSquareUrl: () => string;
  getFaviconUrl: () => string;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider = ({ children }: SettingsProviderProps) => {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const [generalResponse, appearanceResponse] = await Promise.all([
        settingAPI.getByGroup('general'),
        settingAPI.getByGroup('appearance'),
      ]);

      const generalData: Record<string, string> = {};
      if (generalResponse.success && generalResponse.data) {
        Object.entries(generalResponse.data || {}).forEach(([key, value]) => {
          generalData[key] = value !== null && value !== undefined ? String(value) : '';
        });
      }

      const appearanceData: Record<string, string | null> = {};
      if (appearanceResponse.success && appearanceResponse.data) {
        Object.entries(appearanceResponse.data || {}).forEach(([key, value]) => {
          appearanceData[key] = value !== null && value !== undefined ? String(value) : null;
        });
      }

      setSettings({
        general: generalData,
        appearance: appearanceData,
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch settings sekali di awal, tidak tergantung auth
    fetchSettings();
  }, []);

  const getLogoUrl = (dark = false): string => {
    if (!settings) {
      return dark ? '/images/logo/logo-dark.svg' : '/images/logo/logo.svg';
    }

    const logoUrl = dark
      ? settings.appearance.site_logo_dark
      : settings.appearance.site_logo;

    if (!logoUrl || logoUrl.trim() === '') {
      return dark ? '/images/logo/logo-dark.svg' : '/images/logo/logo.svg';
    }

    // If URL is already absolute, return as is
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }

    // Otherwise, prepend base URL
    return `${getBaseUrl()}${logoUrl}`;
  };

  const getBrandLogoSquareUrl = (): string => {
    if (!settings || !settings.appearance.brand_logo_square || settings.appearance.brand_logo_square.trim() === '') {
      return '/images/logo/logo-icon.svg';
    }

    const logoUrl = settings.appearance.brand_logo_square;
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }

    return `${getBaseUrl()}${logoUrl}`;
  };

  const getFaviconUrl = (): string => {
    if (!settings || !settings.appearance.site_favicon || settings.appearance.site_favicon.trim() === '') {
      return '/favicon.png';
    }

    const faviconUrl = settings.appearance.site_favicon;
    if (faviconUrl.startsWith('http://') || faviconUrl.startsWith('https://')) {
      return faviconUrl;
    }

    return `${getBaseUrl()}${faviconUrl}`;
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        getLogoUrl,
        getBrandLogoSquareUrl,
        getFaviconUrl,
        refreshSettings: fetchSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

