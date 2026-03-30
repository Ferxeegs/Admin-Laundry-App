import React from 'react';
import { Link, useLocation } from 'react-router';
import { GridIcon, UserIcon, QrCodeIcon, ListIcon, FileIcon } from '../icons';

const MobileBottomNav: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const getIconClass = (path: string) => 
    `w-6 h-6 mb-1 [&>svg]:w-full [&>svg]:h-full ${isActive(path) ? 'text-brand-500 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`;
  
  const getTextClass = (path: string) =>
    `text-[10px] font-medium ${isActive(path) ? 'text-brand-500 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-2 py-2 bg-white border-t border-gray-200 lg:hidden dark:bg-gray-900 dark:border-gray-800 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <Link to="/" className="flex flex-col items-center justify-center w-full">
        <div className={getIconClass('/')}>
          <GridIcon />
        </div>
        <span className={getTextClass('/')}>Dashboard</span>
      </Link>
      
      <Link to="/students" className="flex flex-col items-center justify-center w-full">
        <div className={getIconClass('/students')}>
          <UserIcon />
        </div>
        <span className={getTextClass('/students')}>Siswa</span>
      </Link>

      {/* Center QR Scan Button */}
      <div className="relative flex flex-col items-center justify-center w-full">
        <Link
          to="/orders/scan"
          state={{ autoStart: true }}
          className="absolute -top-10 flex items-center justify-center w-[60px] h-[60px] bg-brand-500 hover:bg-brand-600 rounded-full shadow-[0_4px_10px_rgba(70,95,255,0.4)] border-[5px] border-white dark:border-gray-900 text-white transition-transform hover:scale-105 active:scale-95"
        >
          <div className="text-white w-7 h-7 [&>svg]:w-full [&>svg]:h-full">
            <QrCodeIcon />
          </div>
        </Link>
        <span className={`mt-7 ${getTextClass('/orders/scan')}`}>Scan QR</span>
      </div>

      <Link to="/orders" className="flex flex-col items-center justify-center w-full">
        <div className={getIconClass('/orders')}>
          <ListIcon />
        </div>
        <span className={getTextClass('/orders')}>Pesanan</span>
      </Link>

      <Link to="/invoices" className="flex flex-col items-center justify-center w-full">
        <div className={getIconClass('/invoices')}>
          <FileIcon />
        </div>
        <span className={getTextClass('/invoices')}>Invoice</span>
      </Link>
    </div>
  );
};

export default MobileBottomNav;
