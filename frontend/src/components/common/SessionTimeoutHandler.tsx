import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useIdleTimeout } from '../../hooks/useIdleTimeout';
import SessionTimeoutModal from './SessionTimeoutModal';

/**
 * Komponen untuk menangani session timeout berdasarkan inaktivitas user
 * 
 * Konfigurasi menggunakan default values:
 * - Idle time: 30 menit (1800000 ms) - sesuai dengan default ACCESS_TOKEN_EXPIRE_MINUTES di backend
 * - Warning time: 1 menit (60000 ms) sebelum logout
 * 
 * Catatan: Endpoint getSessionConfig tidak tersedia di backend,
 * jadi menggunakan default values yang konsisten dengan backend configuration.
 */
export default function SessionTimeoutHandler() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  
  // Default values (dalam milliseconds)
  // Idle time: 30 menit (sesuai dengan default ACCESS_TOKEN_EXPIRE_MINUTES di backend)
  const idleTime = 30 * 60 * 1000; // 30 menit
  // Warning time: 1 menit sebelum logout
  const warningTime = 1 * 60 * 1000; // 1 menit
  const [remainingTime, setRemainingTime] = useState(Math.floor(warningTime / 1000)); // Convert ke detik

  // Handler untuk ketika user idle (logout)
  const handleIdle = async () => {
    // Clear state dan redirect ke login
    // Token di HttpOnly cookie akan otomatis expire, tidak perlu panggil API logout
    logout();
    navigate('/signin', {
      state: {
        message: 'Session Anda telah berakhir karena tidak ada aktivitas. Silakan login kembali.',
      },
      replace: true,
    });
  };

  // Handler untuk menampilkan warning
  const handleWarning = () => {
    setShowWarning(true);
    setRemainingTime(Math.floor(warningTime / 1000)); // Convert ke detik
  };

  // Handler untuk tetap login (reset timer)
  const handleStayLoggedIn = () => {
    setShowWarning(false);
    // Timer akan di-reset otomatis oleh useIdleTimeout ketika ada aktivitas
  };

  // Handler untuk logout manual dari modal
  const handleLogout = async () => {
    setShowWarning(false);
    await handleIdle();
  };

  // Setup idle timeout detection
  const { pause, resume } = useIdleTimeout({
    idleTime: idleTime,
    warningTime: warningTime,
    onIdle: handleIdle,
    onWarning: handleWarning,
    enabled: isAuthenticated && !!user, // Hanya aktif jika user sudah login
  });

  // Pause idle detection ketika warning modal terbuka
  useEffect(() => {
    if (showWarning) {
      pause();
    } else {
      resume();
    }
  }, [showWarning, pause, resume]);

  // Jangan render jika user belum login
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <SessionTimeoutModal
      isOpen={showWarning}
      onStayLoggedIn={handleStayLoggedIn}
      onLogout={handleLogout}
      remainingTime={remainingTime}
    />
  );
}

