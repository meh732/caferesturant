import React from 'react';
import { Download, Smartphone, Share2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstalled, isInstallable, isIOS, promptInstall } = usePWAInstall();

  // If already installed in standalone mode, hide the button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome !== 'accepted') {
        window.dispatchEvent(new CustomEvent('open-pwa-prompt'));
      }
    } else {
      window.dispatchEvent(new CustomEvent('open-pwa-prompt'));
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer ${className}`}
      title="نصب وب‌اپلیکیشن بدون نیاز به مرورگر (PWA)"
    >
      {isIOS ? (
        <Share2 size={13} className="text-white shrink-0" />
      ) : (
        <Smartphone size={13} className="text-white shrink-0" />
      )}
      <span className="whitespace-nowrap">{isIOS ? 'نصب آیفون' : 'نصب اپلیکیشن'}</span>
    </button>
  );
};

export default PWAInstallButton;
