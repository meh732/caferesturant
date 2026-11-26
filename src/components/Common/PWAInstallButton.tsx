import React from 'react';
import { Monitor, Smartphone, Share2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstalled, isInstallable, isIOS, isMobile, promptInstall } = usePWAInstall();

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
      type="button"
      onClick={handleClick}
      className={`flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold shadow-xs active:scale-95 transition-all cursor-pointer ${
        className || 'px-3 py-1.5 text-xs'
      }`}
      title="نصب نرم‌افزار روی ویندوز / مک / موبایل بدون نیاز به اکانت گوگل (PWA)"
    >
      {isIOS ? (
        <Share2 size={12} className="text-white shrink-0" />
      ) : isMobile ? (
        <Smartphone size={12} className="text-white shrink-0" />
      ) : (
        <Monitor size={12} className="text-white shrink-0" />
      )}
      <span className="truncate">{isIOS ? 'نصب آیفون' : 'نصب اپ'}</span>
    </button>
  );
};

export default PWAInstallButton;
