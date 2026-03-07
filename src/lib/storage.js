import { generateId } from "./utils.js";

export const EVENTS_KEY = "gymcomp_events";

// ── Cached localStorage wrapper — avoids repeated JSON.parse on every getAll() call ──
let _eventsCache = null;

export const events = {
  getAll: () => {
    if (_eventsCache) return _eventsCache;
    try { _eventsCache = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); } catch { _eventsCache = []; }
    return _eventsCache;
  },
  save: (allEvents) => {
    _eventsCache = allEvents;
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(allEvents)); } catch (e) {
      console.warn("[events.save] localStorage write failed (quota?):", e.message);
    }
  },
  clear: () => { _eventsCache = null; localStorage.removeItem(EVENTS_KEY); },

  getForAccount: (accountId) => events.getAll().filter(e => e.accountId === accountId),

  create: (accountId, compId) => {
    const all = events.getAll();
    const ev = { id: generateId(), accountId, compId, status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    all.push(ev);
    events.save(all);
    return ev;
  },

  update: (eventId, updates) => {
    const all = events.getAll();
    const idx = all.findIndex(e => e.id === eventId);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    // Strip snapshot when archiving to reclaim localStorage space
    if (updates.status === "archived") delete all[idx].snapshot;
    events.save(all);
    return all[idx];
  },

  remove: (eventId) => {
    const all = events.getAll().filter(e => e.id !== eventId);
    events.save(all);
  },

  // Snapshot — save a full copy of comp data with the event record
  snapshot: (eventId, compData, gymnasts) => {
    const all = events.getAll();
    const idx = all.findIndex(e => e.id === eventId);
    if (idx === -1) return;
    all[idx] = { ...all[idx], snapshot: { compData, gymnasts }, updatedAt: new Date().toISOString() };
    events.save(all);
  },

  // Return estimated localStorage usage in bytes
  storageBytes: () => {
    try {
      const raw = localStorage.getItem(EVENTS_KEY);
      const queue = localStorage.getItem(SYNC_QUEUE_KEY);
      return (raw ? raw.length * 2 : 0) + (queue ? queue.length * 2 : 0); // JS strings are UTF-16 (2 bytes/char)
    } catch { return 0; }
  },
};

// ── Offline sync queue ───────────────────────────────────────────────────
export const SYNC_QUEUE_KEY = "gymcomp_sync_queue";
export const syncQueue = {
  get: () => { try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]"); } catch { return []; } },
  save: (q) => localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)),
  push: (record, token) => {
    const q = syncQueue.get();
    // Replace any existing entry for the same comp ID (only latest matters)
    const idx = q.findIndex(e => e.record.id === record.id);
    if (idx !== -1) q.splice(idx, 1);
    q.push({ record, token, ts: Date.now() });
    syncQueue.save(q);
  },
  clear: (compId) => {
    if (compId) {
      const q = syncQueue.get().filter(e => e.record.id !== compId);
      syncQueue.save(q);
    } else {
      syncQueue.save([]);
    }
  },
  size: () => syncQueue.get().length,
};
