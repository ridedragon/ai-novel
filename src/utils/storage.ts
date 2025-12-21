import { get, set } from 'idb-keyval';
import { Novel } from '../types';

const NOVELS_KEY = 'novels';

export const storage = {
  async getNovels(): Promise<Novel[]> {
    try {
      // First, try to get from IndexedDB
      const novels = await get<Novel[]>(NOVELS_KEY);
      
      if (novels) {
        return novels;
      }

      // If not in IndexedDB, try localStorage (migration path)
      const localNovels = localStorage.getItem(NOVELS_KEY);
      if (localNovels) {
        try {
          const parsed = JSON.parse(localNovels);
          // Save to IndexedDB
          await set(NOVELS_KEY, parsed);
          // Clear from localStorage to free up space, but maybe keep it for safety until confirmed? 
          // For now, let's just leave it or clear it. 
          // Since QuotaExceededError is the issue, we should probably eventually clear it.
          // Let's clear it to ensure we don't hit the limit again with other keys.
          localStorage.removeItem(NOVELS_KEY);
          return parsed;
        } catch (e) {
          console.error('Failed to parse novels from localStorage', e);
          return [];
        }
      }

      return [];
    } catch (e) {
      console.error('Failed to load novels', e);
      return [];
    }
  },

  async saveNovels(novels: Novel[]): Promise<void> {
    try {
      await set(NOVELS_KEY, novels);
    } catch (e) {
      console.error('Failed to save novels to IndexedDB', e);
      throw e;
    }
  }
};
