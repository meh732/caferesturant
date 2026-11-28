import React from 'react';
import { Download, Share2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstalled, isInstallable, isIOS, promptInstall } = usePWAInstall();

  // Only show when natively installable via browser prompt, or on iOS Safari
  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await promptInstall();
    } else if (isIOS) {
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
      title="نصب اپلیکیشن آرکا"
    >
      {isIOS ? (
        <Share2 size={12} className="text-white shrink-0" />
      ) : (
        <Download size={12} className="text-white shrink-0" />
      )}
      <span className="truncate">{isIOS ? 'نصب آیفون' : 'نصب اپ'}</span>
    </button>
  );
};

export default PWAInstallButton;
