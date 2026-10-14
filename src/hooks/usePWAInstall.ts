import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isSamsungBrowser, setIsSamsungBrowser] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone display mode (already installed as PWA or native webview)
    const checkStandalone = () => {
      const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isDisplayMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;
      const isDisplayFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
      const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const isAndroidAppReferrer = document.referrer.includes('android-app://');
      const isTauriWindow = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

      return isDisplayStandalone || isDisplayMinimalUI || isDisplayFullscreen || isNavigatorStandalone || isAndroidAppReferrer || isTauriWindow;
    };

    setIsInstalled(checkStandalone());

    // 2. User Agent & Platform Detection
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(ua);
    const isMobileDevice = isIOSDevice || isAndroidDevice || /mobile|tablet|silk/.test(ua) || (window.innerWidth <= 820);
    const isSafariBrowser = /safari/.test(ua) && !/chrome|crios|crmo|firefox|fxios|edg/.test(ua);
    const isSamsung = /samsungbrowser/.test(ua);

    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);
    setIsMobile(isMobileDevice);
    setIsSafari(isSafariBrowser);
    setIsSamsungBrowser(isSamsung);

    // 3. Capture beforeinstallprompt event
    if ((window as any).__arka_deferred_pwa_prompt) {
      setDeferredPrompt((window as any).__arka_deferred_pwa_prompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__arka_deferred_pwa_prompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).__arka_deferred_pwa_prompt = null;
    };

    const handlePromptReady = () => {
      if ((window as any).__arka_deferred_pwa_prompt) {
        setDeferredPrompt((window as any).__arka_deferred_pwa_prompt);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('arka_pwa_prompt_ready', handlePromptReady);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('arka_pwa_prompt_ready', handlePromptReady);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'manual_needed'> => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
        }
        return choice.outcome;
      } catch (err) {
        console.warn('Error during PWA install prompt:', err);
        return 'manual_needed';
      }
    }
    return 'manual_needed';
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isMobile,
    isSafari,
    isSamsungBrowser,
    deferredPrompt,
    promptInstall,
  };
}
