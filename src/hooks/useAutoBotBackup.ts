import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { dispatchBackupToBots } from '../lib/botBackupService';

export function useAutoBotBackup() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!settings) return;

    const intervalHours = settings.autoBackupIntervalHours ?? 0;
    // 0 means disabled
    if (intervalHours <= 0) return;

    const hasTelegram = Boolean(settings.telegramBotToken && settings.telegramAdminChatIds && (settings.telegramBackupEnabled !== false));
    const hasBale = Boolean(settings.baleBotToken && settings.baleAdminChatIds && (settings.baleBackupEnabled !== false));

    if (!hasTelegram && !hasBale) return;

    const checkAndRunBackup = async () => {
      if (isRunningRef.current) return;

      const lastBackupStr = settings.lastAutoBackupTime;
      const intervalMs = intervalHours * 60 * 60 * 1000;
      const now = Date.now();

      let shouldRun = false;

      if (!lastBackupStr) {
        shouldRun = true;
      } else {
        const lastTime = new Date(lastBackupStr).getTime();
        if (isNaN(lastTime) || (now - lastTime) >= intervalMs) {
          shouldRun = true;
        }
      }

      if (shouldRun) {
        isRunningRef.current = true;
        try {
          console.log(`[AutoBotBackup] Running scheduled backup (interval: ${intervalHours}h)...`);
          const res = await dispatchBackupToBots(settings, false);
          console.log('[AutoBotBackup] Result:', res);
        } catch (err) {
          console.error('[AutoBotBackup] Execution error:', err);
        } finally {
          isRunningRef.current = false;
        }
      }
    };

    // Check on startup after 10 seconds
    const startupTimeout = setTimeout(checkAndRunBackup, 10000);

    // Periodic check every 2 minutes
    const timer = setInterval(checkAndRunBackup, 2 * 60 * 1000);

    return () => {
      clearTimeout(startupTimeout);
      clearInterval(timer);
    };
  }, [settings]);
}
