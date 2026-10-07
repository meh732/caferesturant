import React, { useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import PWAInstallBanner from './PWAInstallBanner';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstalled, isInstallable, promptInstall } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already installed in standalone mode, hide the button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome !== 'accepted') {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer ${className}`}
        title="نصب مستقیم نسخه وب‌اپلیکیشن روی گوشی یا دسکتاپ (PWA)"
      >
        <Download size={14} />
        <span>نصب اپلیکیشن</span>
      </button>

      {showModal && (
        <div onClick={() => setShowModal(false)}>
          <PWAInstallBanner />
        </div>
      )}
    </>
  );
};

export default PWAInstallButton;
