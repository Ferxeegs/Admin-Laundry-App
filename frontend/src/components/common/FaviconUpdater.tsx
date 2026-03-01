import { useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';

/**
 * Component untuk mengupdate favicon secara dinamis berdasarkan settings
 */
export default function FaviconUpdater() {
  const { getFaviconUrl } = useSettings();

  useEffect(() => {
    const faviconUrl = getFaviconUrl();
    
    // Hapus favicon lama jika ada
    const existingFavicon = document.querySelector('link[rel="icon"]');
    if (existingFavicon) {
      existingFavicon.remove();
    }

    // Tambahkan favicon baru
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = faviconUrl;
    document.head.appendChild(link);
  }, [getFaviconUrl]);

  return null;
}

