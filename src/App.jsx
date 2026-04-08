import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ── lib imports ──
import { supabase } from "./lib/supabase.js";
import { generateId, generateClubCode, hashPin, isHashed } from "./lib/utils.js";
import { scoresToFlat, flatToScoreRows } from "./lib/scoring.js";
import { events, syncQueue } from "./lib/storage.js";
import { migrateCompData, migrateScoreKeys, migrateGymnasts } from "./lib/migrate.js";
import { exportResultsPDF, exportResultsXLSX } from "./lib/pdf.js";
import { css } from "./lib/styles.js";

// ── component imports ──
import ErrorBoundary from "./components/shared/ErrorBoundary.jsx";
import ConfirmModal from "./components/shared/ConfirmModal.jsx";
import Step1_CompDetails from "./components/setup/Step1_CompDetails.jsx";
import Step2_Gymnasts from "./components/setup/Step2_Gymnasts.jsx";
import Phase2_Exports from "./components/competition/Phase2_Exports.jsx";
import Phase2_Step1 from "./components/competition/Phase2_Step1.jsx";
import Phase2_Step2 from "./components/competition/Phase2_Step2.jsx";
import MCMode from "./components/competition/MCMode.jsx";
import AuthScreen from "./components/auth/AuthScreen.jsx";
import ProfileOnboardingScreen from "./components/auth/ProfileOnboarding.jsx";
import OrganizerDashboard from "./components/dashboard/OrganizerDashboard.jsx";
import CompDashboard from "./components/dashboard/CompDashboard.jsx";
import AppSidebar from "./components/layout/AppSidebar.jsx";
import MobileLogoHeader from "./components/layout/MobileLogoHeader.jsx";
import MobileTabBar from "./components/layout/MobileTabBar.jsx";
import PinSetupModal from "./components/pages/PinSetupModal.jsx";
import AccountSettingsModal from "./components/pages/AccountSettingsModal.jsx";
import PrivacyPolicyScreen from "./components/pages/PrivacyPolicyScreen.jsx";
import TermsOfServiceScreen from "./components/pages/TermsOfServiceScreen.jsx";


// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  // ── Auth state (Supabase Auth) ──────────────────────────────────────────
  const [currentUser,    setCurrentUser]    = useState(null);  // supabase user object
  const hasAuthed = useRef(false); // guard against token-refresh re-navigation
  const [currentProfile, setCurrentProfile] = useState(null);  // row from profiles table
  const [authLoading,    setAuthLoading]    = useState(true);
  // "loading" | "auth-login" | "profile-onboarding" | "org-dashboard" | "new-pin" | "active"
  const [screen, setScreen] = useState("loading");
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterCounts, setFilterCounts] = useState({ draft: 0, active: 0, completed: 0, archived: 0 });
  // Current event record (from events store) — links comp to account
  const [currentEventId, setCurrentEventId] = useState(null);

  // Derived account shape — keeps all downstream component code unchanged
  const currentAccount = currentUser ? {
    id:       currentUser.id,
    email:    currentUser.email,
    name:     currentProfile?.full_name || currentUser.email?.split("@")[0] || "",
    clubName: currentProfile?.club_name || "",
  } : null;

  const [phase, setPhase] = useState(1);
  const [step, setStep] = useState(1);
  const [setupWarn, setSetupWarn] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);

  // Supabase sync state
  const [compId, setCompId] = useState(() => generateId());
  const [compPin, setCompPin] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const pinModalCallback = useRef(null);
  const snapshotWithPin = (evId, cd, g) => events.snapshot(evId, { ...cd, pin: compPin }, g);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [shareUrl, setShareUrl] = useState(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [shareToastType, setShareToastType] = useState("public");
  const [showCompId, setShowCompId] = useState(false);
  const syncTimer = useRef(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => syncQueue.size());
  const flushingRef = useRef(false);

  const [compData, setCompDataRaw] = useState({
    name: "", location: "", date: "", holder: "",
    organiserName: "", venue: "",
    allowSubmissions: true, dataConsentConfirmed: false,
    clubs: [], rounds: [], apparatus: [], levels: [], judges: [], ageRanges: []
  });
  const [gymnasts, setGymnasts] = useState([]);
  const [scores, setScores] = useState({});
  const [newScoreKeys, setNewScoreKeys] = useState(new Set());

  // Derived values — avoid redundant events.getAll().find() in render path
  const currentEvent = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
  const eventStatus = currentEvent?.status;
  const allGymnastsComplete = useMemo(() => {
    const rf = ["name","club","level","round","age"];
    return gymnasts.length === 0 || gymnasts.every(g => rf.every(f => g[f] && g[f].toString().trim()));
  }, [gymnasts]);

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  // ── Auth initialisation ──────────────────────────────────────────────────
  const loadUserProfile = async (user) => {
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setCurrentProfile(profile || null);
      setAuthLoading(false);
      // Only navigate on initial auth — not on token refreshes that re-trigger loadUserProfile
      if (!hasAuthed.current) {
        hasAuthed.current = true;
        setScreen(profile?.full_name ? "org-dashboard" : "profile-onboarding");
      }
    } catch (e) {
      console.error("Profile load error:", e.message);
      setAuthLoading(false);
      setScreen("auth-login");
    }
  };

  useEffect(() => {
    // Resolve any existing session on page load (also handles magic-link / OAuth redirect tokens)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadUserProfile(session.user);
      } else {
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        setCurrentUser(session.user);
        loadUserProfile(session.user);
      } else if (event === "SIGNED_OUT") {
        hasAuthed.current = false;
        setCurrentUser(null);
        setCurrentProfile(null);
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── localStorage size warning ─────────────────────────────────────────
  const [storageWarning, setStorageWarning] = useState(null);
  useEffect(() => {
    const bytes = events.storageBytes();
    const mb = bytes / (1024 * 1024);
    if (mb > 4) {
      setStorageWarning(`Local storage is ${mb.toFixed(1)} MB — approaching the browser limit. Consider archiving or deleting old competitions to free space.`);
    }
  }, []);

  // ---- Supabase sync (with offline queue) ----
  const pushToSupabase = useCallback(async (nextCompData, nextGymnasts, pin, status) => {
    if (inSandbox) { setSyncStatus("sandbox"); return; }
    if (!currentUser) { return; } // Judge/scorer mode — no Supabase auth, skip silently
    setSyncStatus("saving");
    const resolvedPin = pin ?? compPin;
    const payload = { compData: { ...nextCompData, pin: resolvedPin }, gymnasts: nextGymnasts, pin: resolvedPin };
    const record = { id: compId, data: payload, user_id: currentUser.id };
    const localEv = events.getAll().find(e => e.compId === compId);
    record.status = status || localEv?.status || "draft";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("no active session");
      const { error } = await supabase.from("competitions").upsert(record);
      if (error) throw new Error(error.message);
      // Success — clear any queued entry for this comp
      syncQueue.clear(compId);
      setPendingSyncCount(syncQueue.size());
      setSyncStatus("saved");
    } catch (e) {
      console.error("Supabase sync failed, queuing locally:", e.message);
      syncQueue.push(record);
      setPendingSyncCount(syncQueue.size());
      setSyncStatus("pending");
    }
  }, [compId, compPin, inSandbox, currentUser]);

  // Flush all queued syncs — called when back online
  const flushSyncQueue = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = syncQueue.get();
    if (queue.length === 0) return;
    flushingRef.current = true;
    setSyncStatus("saving");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { flushingRef.current = false; return; }
      const remaining = [];
      for (const entry of queue) {
        try {
          const { error } = await supabase.from("competitions").upsert(entry.record);
          if (error) throw new Error(error.message);
        } catch {
          remaining.push(entry);
        }
      }
      syncQueue.save(remaining);
      setPendingSyncCount(remaining.length);
      setSyncStatus(remaining.length > 0 ? "pending" : "saved");
    } catch {
      setSyncStatus("pending");
    }
    flushingRef.current = false;
  }, []);

  // Online/offline detection + auto-flush
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); flushSyncQueue(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Also try to flush on mount if there's a pending queue
    if (navigator.onLine && syncQueue.size() > 0) flushSyncQueue();
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [flushSyncQueue]);

  // Also flush when tab regains focus (catches cases where online event was missed)
  useEffect(() => {
    const handleVis = () => {
      if (document.visibilityState === "visible" && navigator.onLine && syncQueue.size() > 0) flushSyncQueue();
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [flushSyncQueue]);

  // ── Realtime subscription for scores table ─────────────────────────────
  useEffect(() => {
    if (!compId || inSandbox) return;
    // Subscribe for both judges and organisers when in competition phase
    if (phase !== 2 && phase !== "dashboard") return;

    const flashTimers = new Set();
    const channel = supabase.channel(`scores:${compId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `comp_id=eq.${compId}` }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const row = payload.new;
          const flat = scoresToFlat([row]);
          // Merge into scores state directly (NOT via setScoresWithSync to avoid re-pushing)
          setScores(prev => ({ ...prev, ...flat }));
          // Flash animation — add base key, remove after 2s
          const bk = `${row.round_id}__${row.gymnast_id}__${row.apparatus}`;
          setNewScoreKeys(prev => new Set(prev).add(bk));
          const t = setTimeout(() => { setNewScoreKeys(prev => { const n = new Set(prev); n.delete(bk); return n; }); flashTimers.delete(t); }, 2000);
          flashTimers.add(t);
        } else if (payload.eventType === "DELETE") {
          const row = payload.old;
          if (row) {
            const bk = `${row.round_id}__${row.gymnast_id}__${row.apparatus}`;
            setScores(prev => {
              const next = { ...prev };
              // Remove all keys starting with this base key
              for (const key of Object.keys(next)) {
                if (key === bk || key.startsWith(bk + "__")) delete next[key];
              }
              return next;
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      flashTimers.forEach(t => clearTimeout(t));
    };
  }, [compId, phase, inSandbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSync = useCallback((cd, g) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      pushToSupabase(cd, g);
      // Also snapshot to local events store (scores live in scores table, not blob)
      if (currentEventId) snapshotWithPin(currentEventId, cd, g);
    }, 800);
  }, [pushToSupabase, currentEventId]);

  const setCompData = useCallback((updater) => {
    setCompDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (gymnasts.length > 0) {
        const apparatusChanged = JSON.stringify(prev.apparatus) !== JSON.stringify(next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      scheduleSync(next, gymnasts);
      return next;
    });
  }, [gymnasts, scheduleSync]);

  // Local-only version of setCompData — updates React state without syncing to Supabase.
  // Used in Phase 1 setup so edits aren't auto-saved.
  const setCompDataLocal = useCallback((updater) => {
    setCompDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (gymnasts.length > 0) {
        const apparatusChanged = JSON.stringify(prev.apparatus) !== JSON.stringify(next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      return next;
    });
  }, [gymnasts]);

  const setGymnastsWithSync = useCallback((updater) => {
    setGymnasts(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      scheduleSync(compData, next);
      return next;
    });
  }, [compData, scheduleSync]);

  // Scores now persist via the scores table (pushScoreToTable), not the blob.
  // setScoresWithSync updates local state only — no blob sync needed.
  const setScoresWithSync = useCallback((updater) => {
    setScores(updater);
  }, []);

  // ── Score table push (fire-and-forget) ──────────────────────────────────
  const pushScoreToTable = useCallback(async (roundId, gymnastId, apparatus, flatSubset) => {
    if (inSandbox) return;
    try {
      const rows = flatToScoreRows(flatSubset, compId, currentUser ? `organiser:${currentUser.id}` : "judge");
      if (!rows.length) return;
      const { error } = await supabase.from("scores").upsert(rows, { onConflict: "comp_id,round_id,gymnast_id,apparatus" });
      if (error) console.error("[pushScoreToTable]", error.message);
    } catch (e) {
      console.error("[pushScoreToTable]", e.message);
    }
  }, [compId, currentUser, inSandbox]);

  const deleteScoreFromTable = useCallback(async (roundId, gymnastId, apparatus) => {
    if (inSandbox) return;
    try {
      const { error } = await supabase.from("scores").delete().eq("comp_id", compId).eq("round_id", roundId).eq("gymnast_id", gymnastId).eq("apparatus", apparatus);
      if (error) console.error("[deleteScoreFromTable]", error.message);
    } catch (e) {
      console.error("[deleteScoreFromTable]", e.message);
    }
  }, [compId, inSandbox]);

  const confirmSetupChange = () => {
    setCompDataRaw(pendingChange);
    setSetupWarn(null);
    setPendingChange(null);
  };

  // ---- Auth actions ----
  /* OLD handleLogin — navigation now driven by onAuthStateChange
  const handleLogin = (account) => {
    setCurrentAccount(account);
    setScreen("org-dashboard");
  };
  */

  const handleLogout = async () => {
    events.clear(); // Wipe local events so stale data never leaks to the next session
    await supabase.auth.signOut();
    // setCurrentUser(null) + setScreen("auth-login") handled by onAuthStateChange
  };

  const handleAccountSave = (updatedProfile) => {
    setCurrentProfile(updatedProfile);
  };

  // ---- New competition flow ----
  const handleNew = () => {
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    setCompDataRaw({ name:"", location:"", date:"", holder: currentProfile?.full_name || "", organiserName: currentProfile?.club_name || "", venue:"", allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
    setGymnasts([]);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    // Create event record if logged in
    if (currentAccount) {
      const ev = events.create(currentAccount.id, newCompId);
      setCurrentEventId(ev.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  // Open an existing event from the organiser dashboard
  const handleOpenEvent = async (ev) => {
    const snapshot = ev.snapshot;
    setCompId(ev.compId);
    if (snapshot) {
      const rawPin = snapshot.compData?.pin || snapshot.pin || null;
      setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
      const consentGiven = ev.status !== "draft";
      setCompDataRaw(migrateCompData({ ...structuredClone(snapshot.compData || {}), dataConsentConfirmed: consentGiven }));
      setGymnasts(migrateGymnasts(structuredClone(snapshot.gymnasts || [])));
    } else {
      // No local snapshot — try to fetch from Supabase (e.g. archived events with stripped snapshots)
      const { data: row } = await supabase.from("competitions").select("*").eq("id", ev.compId).maybeSingle();
      if (row?.data) {
        const d = row.data;
        const rawPin = d.compData?.pin || d.pin || null;
        setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
        setCompDataRaw(migrateCompData({ ...structuredClone(d.compData || {}), dataConsentConfirmed: true }));
        setGymnasts(migrateGymnasts(structuredClone(d.gymnasts || [])));
      } else {
        // Truly new — start fresh setup
        setCompPin(null);
        setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
        setGymnasts([]);
        setScores({});
        setPhase(1); setStep(1);
        setSyncStatus("idle");
        setCurrentEventId(ev.id);
        setScreen("active");
        return;
      }
    }
    // Scores come exclusively from the scores table
    const { data: tableRows } = await supabase.from("scores").select("*").eq("comp_id", ev.compId);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      // Check blob for legacy scores and silently migrate
      const blobScores = migrateScoreKeys(structuredClone(snapshot?.scores || {}));
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        // Silent migration — push to scores table in background
        const submittedBy = currentUser ? `organiser:${currentUser.id}` : "migration";
        const rows = flatToScoreRows(blobScores, ev.compId, submittedBy);
        if (rows.length > 0) {
          supabase.from("scores").upsert(rows, { onConflict: "comp_id,round_id,gymnast_id,apparatus" }).then(({ error }) => { if (error) console.warn("[score migration]", error.message); });
        }
      } else {
        setScores({});
      }
    }
    // Draft events open in edit mode; live opens into competition; others to dashboard
    if (ev.status === "draft") { setPhase(1); setStep(1); }
    else if (ev.status === "live") { setPhase(2); setStep(1); }
    else if (ev.status === "completed") { setPhase(2); setStep(2); }
    else { setPhase("dashboard"); setStep(1); }
    setSyncStatus("saved");
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Open an existing event directly into edit mode (phase 1)
  const handleEditEvent = async (ev) => {
    const snapshot = ev.snapshot;
    setCompId(ev.compId);
    if (snapshot) {
      const rawPin = snapshot.compData?.pin || snapshot.pin || null;
      setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
      const consentGiven = ev.status !== "draft";
      setCompDataRaw(migrateCompData({ ...structuredClone(snapshot.compData || {}), dataConsentConfirmed: consentGiven }));
      setGymnasts(migrateGymnasts(structuredClone(snapshot.gymnasts || [])));
    } else {
      const { data: row } = await supabase.from("competitions").select("*").eq("id", ev.compId).maybeSingle();
      if (row?.data) {
        const d = row.data;
        const rawPin = d.compData?.pin || d.pin || null;
        setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
        setCompDataRaw(migrateCompData({ ...structuredClone(d.compData || {}), dataConsentConfirmed: true }));
        setGymnasts(migrateGymnasts(structuredClone(d.gymnasts || [])));
      } else {
        setCompPin(null);
        setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
        setGymnasts([]);
        setScores({});
        setSyncStatus("idle");
        setPhase(1); setStep(1);
        setCurrentEventId(ev.id);
        setScreen("active");
        return;
      }
    }
    // Scores from table only, with silent blob migration
    const { data: tableRows } = await supabase.from("scores").select("*").eq("comp_id", ev.compId);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      const blobScores = migrateScoreKeys(structuredClone(snapshot?.scores || {}));
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        const submittedBy = currentUser ? `organiser:${currentUser.id}` : "migration";
        const rows = flatToScoreRows(blobScores, ev.compId, submittedBy);
        if (rows.length > 0) {
          supabase.from("scores").upsert(rows, { onConflict: "comp_id,round_id,gymnast_id,apparatus" }).then(({ error }) => { if (error) console.warn("[score migration]", error.message); });
        }
      } else {
        setScores({});
      }
    }
    setSyncStatus("saved");
    setPhase(1); setStep(1);
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Open an existing event into the dashboard overview (comp details + PDFs)
  const handleViewEvent = async (ev) => {
    const snapshot = ev.snapshot;
    setCompId(ev.compId);
    if (snapshot) {
      const rawPin = snapshot.compData?.pin || snapshot.pin || null;
      setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
      const consentGiven = ev.status !== "draft";
      setCompDataRaw(migrateCompData({ ...structuredClone(snapshot.compData || {}), dataConsentConfirmed: consentGiven }));
      setGymnasts(migrateGymnasts(structuredClone(snapshot.gymnasts || [])));
    } else {
      const { data: row } = await supabase.from("competitions").select("*").eq("id", ev.compId).maybeSingle();
      if (row?.data) {
        const d = row.data;
        const rawPin = d.compData?.pin || d.pin || null;
        setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
        setCompDataRaw(migrateCompData({ ...structuredClone(d.compData || {}), dataConsentConfirmed: true }));
        setGymnasts(migrateGymnasts(structuredClone(d.gymnasts || [])));
      }
    }
    // Scores from table only, with silent blob migration
    const { data: tableRows } = await supabase.from("scores").select("*").eq("comp_id", ev.compId);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      const blobScores = migrateScoreKeys(structuredClone(snapshot?.scores || {}));
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        const submittedBy = currentUser ? `organiser:${currentUser.id}` : "migration";
        const rows = flatToScoreRows(blobScores, ev.compId, submittedBy);
        if (rows.length > 0) {
          supabase.from("scores").upsert(rows, { onConflict: "comp_id,round_id,gymnast_id,apparatus" }).then(({ error }) => { if (error) console.warn("[score migration]", error.message); });
        }
      } else {
        setScores({});
      }
    }
    setSyncStatus("saved");
    setPhase("dashboard"); setStep(1);
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Duplicate an event as a new competition
  const handleDuplicateEvent = (ev) => {
    const snapshot = ev.snapshot;
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    // Deep copy and regenerate all IDs to fully detach from source
    let baseData;
    if (snapshot?.compData) {
      const src = structuredClone(snapshot.compData);
      const freshCodes = [];
      src.clubs = (src.clubs || []).map(c => {
        const code = generateClubCode(freshCodes);
        freshCodes.push(code);
        return { ...c, id: generateId(), clubCode: code };
      });
      src.rounds = (src.rounds || []).map(r => ({ ...r, id: generateId() }));
      src.levels = (src.levels || []).map(l => ({ ...l, id: generateId() }));
      src.name = `${src.name || "Competition"} (Copy)`;
      src.date = "";
      src.dataConsentConfirmed = false;
      src.judges = [];
      baseData = src;
    } else {
      baseData = { name:"Copy", location:"", date:"", holder:"", organiserName:"", venue:"", allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] };
    }
    setCompDataRaw(migrateCompData(baseData));
    setGymnasts([]);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    if (currentAccount) {
      const newEv = events.create(currentAccount.id, newCompId);
      snapshotWithPin(newEv.id, baseData, []);
      setCurrentEventId(newEv.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  const handlePinSet = (pin) => {
    setCompPin(pin); setShowPinModal(false);
    // Sync PIN to Supabase + local snapshot
    pushToSupabase(compData, gymnasts, pin);
    if (currentEventId) events.snapshot(currentEventId, { ...compData, pin: pin }, gymnasts);
    if (pinModalCallback.current) { pinModalCallback.current(); pinModalCallback.current = null; }
  };

  // Navigate back to org dashboard
  const goBackToDashboard = () => {
    // Auto-save draft before navigating back
    if (currentEventId) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      snapshotWithPin(currentEventId, compData, gymnasts);
      pushToSupabase(compData, gymnasts);
    }
    setScreen("org-dashboard");
  };

  // ---- Sidebar nav callbacks for active screen ----
  const handleSaveSetup = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    pushToSupabase(compData, gymnasts);
    if (currentEventId) snapshotWithPin(currentEventId, compData, gymnasts);
  };

  const setupCanProceed = compData.name && compData.date &&
    (compData.rounds || []).length > 0 &&
    (compData.apparatus || []).length > 0 && (compData.levels || []).length > 0 &&
    compData.dataConsentConfirmed;
  const setupCanSave = !!compData.name;

  const handleMobileSave = () => {
    if (setupCanProceed) {
      // All fields complete — full save & continue (PIN flow + dashboard)
      if (syncTimer.current) clearTimeout(syncTimer.current);
      const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
      const isDraft = ev && ev.status === "draft";
      pushToSupabase(compData, gymnasts, undefined, isDraft ? "active" : undefined);
      if (currentEventId) {
        snapshotWithPin(currentEventId, compData, gymnasts);
        if (isDraft) events.update(currentEventId, { status: "active" });
      }
      if (!compPin) {
        pinModalCallback.current = () => setPhase("dashboard");
        setShowPinModal(true);
      } else {
        setPhase("dashboard");
      }
    } else if (setupCanSave) {
      // Partial save — persist and go back to dashboard
      if (syncTimer.current) clearTimeout(syncTimer.current);
      pushToSupabase(compData, gymnasts);
      if (currentEventId) snapshotWithPin(currentEventId, compData, gymnasts);
      setScreen("org-dashboard");
    }
  };

  const handleStartComp = () => {
    setPhase(2); setStep(1);
    if (currentEventId) {
      events.update(currentEventId, { status: "live" });
      const ev = events.getAll().find(e => e.id === currentEventId);
      if (ev?.compId) {
        supabase.from("competitions").update({ status: "live" }).eq("id", ev.compId);
      }
    }
  };
  const handleCompleteComp = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    if (currentEventId) {
      events.update(currentEventId, { status: "completed" });
      snapshotWithPin(currentEventId, compData, gymnasts);
    }
    pushToSupabase(compData, gymnasts, undefined, "completed");
    setScreen("org-dashboard");
  };
  const handleEditSetup = () => { setPhase(1); setStep(1); };
  const handleManageGymnasts = () => setPhase("gymnasts");
  const handleGoToDashboard = () => { setPhase("dashboard"); setStep(1); };

  // Scroll .app-main to top on phase/screen transitions
  const appMainRef = useRef(null);
  useEffect(() => {
    if (appMainRef.current) appMainRef.current.scrollTop = 0;
  }, [phase, step, screen]);

  // Track which setup section is in view (Phase 1 scroll-spy)
  const [activeSection, setActiveSection] = useState("");
  useEffect(() => {
    if (screen !== "active" || phase !== 1) { setActiveSection(""); return; }
    const ids = ["setup-basic","setup-levels","setup-apparatus","setup-ages","setup-rounds"];
    const root = appMainRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) setActiveSection(visible[0].target.id);
    }, { root, rootMargin: "-10% 0px -60% 0px", threshold: 0 });
    // Small delay so DOM has rendered the cards
    const t = setTimeout(() => {
      ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    }, 100);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [screen, phase]);

  // ---- Resume competition (PIN-only path for judges / no-account users) ----
  const handleResume = async (id, savedData) => {
    setCompId(id);
    const rawPin = savedData.pin || null;
    setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
    setCompDataRaw(savedData.compData || {});
    setGymnasts(savedData.gymnasts || []);
    // Scores exclusively from table
    const { data: tableRows } = await supabase.from("scores").select("*").eq("comp_id", id);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      // Fallback: migrate blob scores silently (judge path — anon key)
      const blobScores = savedData.scores || {};
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        const rows = flatToScoreRows(blobScores, id, "migration:judge");
        if (rows.length > 0) {
          supabase.from("scores").upsert(rows, { onConflict: "comp_id,round_id,gymnast_id,apparatus" }).then(({ error }) => { if (error) console.warn("[score migration]", error.message); });
        }
      } else {
        setScores({});
      }
    }
    // Judges land directly on scoring view, not dashboard
    setPhase(2); setStep(1);
    setSyncStatus("saved");
    setCurrentEventId(null);
    setScreen("active");
  };

  // ---- Share links ----
  const copyOrShare = async (url, title) => {
    // Try native share on mobile first
    if (navigator.share) {
      try { await navigator.share({ title: title || "GymComp", url }); return true; } catch {}
    }
    // Try clipboard API
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(url); return true; } catch {}
    }
    // Fallback: temporary textarea for older browsers
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {}
    return false;
  };
  const handleSharePublic = async () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    await pushToSupabase(compData, gymnasts);
    const url = `${window.location.origin}/results.html?comp=${compId}`;
    setShareUrl(url);
    await copyOrShare(url, `${compData.name || "Competition"} — Live Results`);
    setShareToastType("public");
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 4000);
  };
  const handleShareCoach = async () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    await pushToSupabase(compData, gymnasts);
    const url = `${window.location.origin}/coach.html?comp=${compId}`;
    setShareUrl(url);
    await copyOrShare(url, `${compData.name || "Competition"} — Coach View`);
    setShareToastType("coaches");
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 4000);
  };

  const phase2Steps = [
    { label: "Score Input", done: Object.keys(scores).length > 0 },
    { label: "Results", done: false },
    { label: "Exports & Docs", done: false },
    { label: "MC Mode", done: false },
  ];

  const syncDot = { idle:null, saving:"🟡", saved:"🟢", error:"🔴", pending:"🟠", sandbox:"⚪" }[syncStatus];
  const syncLabel = { idle:"", saving:"Saving…", saved:"Saved ✓", error:"Sync error", pending:`${pendingSyncCount} pending`, sandbox:"Preview mode" }[syncStatus];

  // ---- PUBLIC LEGAL PAGES — no auth required ----
  if (window.location.pathname === "/privacy") {
    return (
      <>
        <style>{css}</style>
        <PrivacyPolicyScreen />
      </>
    );
  }
  if (window.location.pathname === "/terms") {
    return (
      <>
        <style>{css}</style>
        <TermsOfServiceScreen />
      </>
    );
  }

  // ---- LOADING — blank dark screen while session resolves ----
  if (authLoading) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ background: "var(--bg)", minHeight: "100vh" }} />
      </>
    );
  }

  // ---- AUTH SCREEN (Google OAuth + Magic Link) ----
  if (screen === "auth-login") {
    return (
      <>
        <style>{css}</style>
        <ErrorBoundary label="auth">
        <AuthScreen onResume={handleResume} />
        </ErrorBoundary>
      </>
    );
  }

  // ---- PROFILE ONBOARDING (first login only) ----
  if (screen === "profile-onboarding") {
    return (
      <>
        <style>{css}</style>
        <ErrorBoundary label="profile onboarding">
        <div className="app">
          <ProfileOnboardingScreen
            user={currentUser}
            onComplete={(profile) => {
              setCurrentProfile(profile);
              setScreen("org-dashboard");
            }}
          />
        </div>
        </ErrorBoundary>
      </>
    );
  }

  // ---- ORGANISER DASHBOARD ----
  if (screen === "org-dashboard") {
    return (
      <>
        <style>{css}</style>
        <div className="app-shell">
          <AppSidebar screen="org-dashboard" phase={null} step={null} setStep={null}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection=""
            onNew={handleNew} onMyEvents={null} onEditSetup={null} onManageGymnasts={null}
            onStartComp={null} onDashboard={null}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout} />
          <div className="app-main">
            {storageWarning && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", margin: "12px 16px 0",
                background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 8, fontSize: 13, color: "#b45309", fontFamily: "var(--font)"
              }}>
                <span style={{ flex: 1 }}>{storageWarning}</span>
                <button onClick={() => setStorageWarning(null)} style={{
                  background: "none", border: "none", color: "#b45309", cursor: "pointer", fontSize: 16, padding: 4
                }}>&times;</button>
              </div>
            )}
            <ErrorBoundary label="dashboard">
            <OrganizerDashboard
              account={currentAccount}
              onNew={handleNew}
              onOpen={handleOpenEvent}
              onView={handleViewEvent}
              onEdit={handleEditEvent}
              onDuplicate={handleDuplicateEvent}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onFilterCountsChange={setFilterCounts}
            />
            </ErrorBoundary>
          </div>
        </div>
        <MobileLogoHeader onGoHome={() => setScreen("org-dashboard")} />
        <MobileTabBar screen="org-dashboard" phase={null} step={null} setStep={null}
          onNew={handleNew} onMyEvents={null} onEditSetup={null} onManageGymnasts={null}
          onStartComp={null} onDashboard={null}
          onSettings={() => setShowAccountSettings(true)} />
        {showAccountSettings && (
          <AccountSettingsModal
            account={currentAccount}
            profile={currentProfile}
            onSave={handleAccountSave}
            onLogout={handleLogout}
            onClose={() => setShowAccountSettings(false)}
          />
        )}
      </>
    );
  }

  // ---- PIN SETUP ----
  if (screen === "new-pin") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <nav className="nav"><div className="nav-logo">GYMCOMP<span>.</span></div><div /><div /></nav>
          <PinSetupModal onSet={handlePinSet} />
        </div>
      </>
    );
  }

  // ---- ACTIVE COMPETITION ----
  // Organisers get app-shell with sidebar; judges (no account) get minimal nav
  const activeContent = (
    <>
      {/* SHARE TOAST */}
      {showShareToast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          background: "var(--accent)", color: "#fff", borderRadius: 16, padding: "12px 24px",
          fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxWidth: "90vw", textAlign: "center", lineHeight: 1.6
        }}>
          Link copied — share with {shareToastType === "coaches" ? "coaches" : "parents"}<br />
          <span style={{ fontWeight: 400, wordBreak: "break-all", fontSize: 11 }}>{shareUrl}</span>
        </div>
      )}

      {/* Offline banner */}
      {!isOnline && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "8px 16px", background: "#f59e0b", color: "#fff", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1l14 14"/><path d="M4.7 4.7A7 7 0 001 8M7 7a4 4 0 00-3 1.5M8 11a1 1 0 100 .01M11 3.5A7 7 0 0115 8M13 5.5"/></svg>
          You're offline — scores are saved locally and will sync when reconnected
          {pendingSyncCount > 0 && <span style={{ background: "rgba(0,0,0,0.2)", borderRadius: 48, padding: "2px 10px", fontSize: 11 }}>{pendingSyncCount} pending</span>}
        </div>
      )}

      {/* Pending sync indicator (online but queue not empty) */}
      {isOnline && pendingSyncCount > 0 && syncStatus === "pending" && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "6px 16px", background: "var(--brand-01)", color: "#fff", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600
        }}>
          Syncing {pendingSyncCount} pending update{pendingSyncCount !== 1 ? "s" : ""}…
          <button onClick={flushSyncQueue} style={{ background: "rgba(255,255,255,0.25)", border: "none", borderRadius: 48, padding: "3px 12px", color: "#fff", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Retry now</button>
        </div>
      )}

      {/* Nav bar — hidden during setup (phase 1), dashboard, gymnast management, and phase 2 for organisers */}
      {!(currentAccount && (phase === 1 || phase === "dashboard" || phase === "gymnasts" || phase === 2)) && (
        <nav className="nav">
          {!currentAccount && (
            <div className="nav-logo" style={{ cursor: "pointer" }} onClick={() => setScreen("auth-login")}>GYMCOMP<span>.</span></div>
          )}
          {currentAccount && <div style={{ width: 8 }} />}

          <div className="nav-centre" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
            {compData.name && (
              <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                <strong style={{ color: "var(--text)" }}>{compData.name}</strong>
                {compData.date && <> · {new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB")}</>}
              </div>
            )}
            {syncStatus !== "idle" && (
              <div style={{ fontSize: 11, color: syncStatus === "saved" ? "var(--success)" : syncStatus === "pending" ? "#f59e0b" : "var(--muted)", cursor: "pointer" }}
                onClick={() => syncStatus === "pending" ? flushSyncQueue() : setShowCompId(v => !v)}>
                {syncDot} {syncLabel}
                {syncStatus === "saved" && <> · <span style={{ fontFamily: "monospace", fontSize: 10 }}>{showCompId ? compId : "ID"}</span></>}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {phase === 2 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResultsXLSX(compData, gymnasts, scores)}>
                  Export XLSX
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResultsPDF(compData, gymnasts, scores)}>
                  Export PDF
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSharePublic}>
                  Share Results
                </button>
              </>
            )}
            {!currentAccount && phase === 2 && <div style={{ width: 8 }} />}
          </div>
        </nav>
      )}

      {/* DASHBOARD */}
      {phase === "dashboard" && (
        <ErrorBoundary label="competition dashboard">
        <CompDashboard
          compData={compData} gymnasts={gymnasts}
          compId={compId} compPin={compPin}
          eventStatus={eventStatus}
          onStartComp={handleStartComp}
          onEditSetup={handleEditSetup}
          onManageGymnasts={handleManageGymnasts}
          onUpdateCompData={setCompData}
          onUpdateGymnasts={setGymnastsWithSync}
          onSetPin={() => {
            pinModalCallback.current = null;
            setShowPinModal(true);
          }}
          onAcceptSubmissions={(newGymnasts) => {
            setGymnastsWithSync(prev => [...prev, ...newGymnasts]);
          }}
        />
        </ErrorBoundary>
      )}

      {/* SETUP phase 1 */}
      {phase === 1 && (
        <ErrorBoundary label="competition setup">
        <div style={{ flex: 1 }}>
          <Step1_CompDetails data={compData} setData={setCompDataLocal} syncStatus={syncStatus} onSave={handleSaveSetup} isExisting={!!(currentEventId && eventStatus !== "draft")}
            onSaveExit={async () => {
              // Partial save — persist and go back to organiser dashboard (event list)
              if (syncTimer.current) clearTimeout(syncTimer.current);
              if (currentEventId) snapshotWithPin(currentEventId, compData, gymnasts);
              await pushToSupabase(compData, gymnasts);
              setScreen("org-dashboard");
            }}
            onNext={async () => {
              // Full save — all mandatory fields complete
              if (syncTimer.current) clearTimeout(syncTimer.current);
              const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
              const isDraft = ev && ev.status === "draft";
              if (currentEventId) {
                snapshotWithPin(currentEventId, compData, gymnasts);
                if (isDraft) events.update(currentEventId, { status: "active" });
              }
              await pushToSupabase(compData, gymnasts, undefined, isDraft ? "active" : undefined);
              if (!compPin) {
                pinModalCallback.current = () => setPhase("dashboard");
                setShowPinModal(true);
              } else {
                setPhase("dashboard");
              }
            }} />
        </div>
        </ErrorBoundary>
      )}

      {/* GYMNAST MANAGEMENT */}
      {phase === "gymnasts" && (
        <ErrorBoundary label="gymnast management">
        <div style={{ flex: 1 }}>
          <Step2_Gymnasts compData={compData} setCompDataFn={setCompData} data={gymnasts} setData={setGymnastsWithSync}
            onNext={() => setPhase("dashboard")} onBack={() => setPhase("dashboard")} />
        </div>
        </ErrorBoundary>
      )}

      {/* COMPETITION phase 2 — no old sidebar, just content */}
      {phase === 2 && (step === 1 ? (
        <ErrorBoundary label="score input">
        <div style={{ flex: 1 }}>
          <Phase2_Step1 compData={compData} gymnasts={gymnasts} scores={scores} setScores={setScoresWithSync} setStep={setStep}
            onExportPDF={() => exportResultsPDF(compData, gymnasts, scores)} onSharePublic={handleSharePublic} onShareCoach={handleShareCoach}
            isOnline={isOnline} pendingSyncCount={pendingSyncCount} syncStatus={syncStatus} onRetrySync={flushSyncQueue}
            onScoreCommit={pushScoreToTable} onScoreDelete={deleteScoreFromTable} newScoreKeys={newScoreKeys} />
        </div>
        </ErrorBoundary>
      ) : step === 2 ? (
        <ErrorBoundary label="results">
        <div style={{ flex: 1 }}>
          <Phase2_Step2 compData={compData} gymnasts={gymnasts} scores={scores}
            onComplete={currentEventId && eventStatus !== "completed" ? handleCompleteComp : undefined} />
        </div>
        </ErrorBoundary>
      ) : (
        <ErrorBoundary label={step === 3 ? "exports" : "MC mode"}>
        <main className="content" style={{ maxWidth: 1200 }}>
          {step === 3 && <Phase2_Exports compData={compData} gymnasts={gymnasts} scores={scores} onSharePublic={handleSharePublic} onShareCoach={handleShareCoach} />}
          {step === 4 && <MCMode compData={compData} gymnasts={gymnasts} scores={scores} />}
        </main>
        </ErrorBoundary>
      ))}
    </>
  );

  return (
    <>
      <style>{css}</style>
      {currentAccount ? (
        <div className="app-shell">
          <AppSidebar screen="active" phase={phase} step={step} setStep={setStep}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection={activeSection}
            onNew={handleNew} onMyEvents={goBackToDashboard} onEditSetup={handleEditSetup}
            onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
            onDashboard={handleGoToDashboard}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout}
            gymnastsCount={gymnasts.length}
            judgesCount={(compData.judges || []).length}
            eventStatus={eventStatus}
            allGymnastsComplete={allGymnastsComplete}  />
          <div className="app-main" ref={appMainRef}>
            {activeContent}
          </div>
        </div>
      ) : (
        /* Judge mode — no sidebar, current layout */
        <div className="app">
          {activeContent}
        </div>
      )}

      {currentAccount && (<>
        <MobileLogoHeader onGoHome={goBackToDashboard} />
        <MobileTabBar screen="active" phase={phase} step={step} setStep={setStep}
          onNew={handleNew} onMyEvents={goBackToDashboard} onEditSetup={handleEditSetup}
          onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
          onDashboard={handleGoToDashboard}
          onSettings={() => setShowAccountSettings(true)}
          onSave={phase === 1 ? handleMobileSave : handleSaveSetup}
          saveLabel={phase === 1 ? (setupCanProceed ? "Continue" : "Save & Exit") : "Save"}
          eventStatus={eventStatus} />
      </>)}

      {showAccountSettings && (
        <AccountSettingsModal
          account={currentAccount}
          profile={currentProfile}
          onSave={handleAccountSave}
          onLogout={handleLogout}
          onClose={() => setShowAccountSettings(false)}
        />
      )}

      {setupWarn && (
        <ConfirmModal message={setupWarn} confirmLabel="Yes, continue" isDanger={false}
          onConfirm={confirmSetupChange}
          onCancel={() => { setSetupWarn(null); setPendingChange(null); }} />
      )}

      {showPinModal && (
        <PinSetupModal onSet={handlePinSet} />
      )}


    </>
  );
}
