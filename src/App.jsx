import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ── lib imports ──
import { supabase, touchLastActive } from "./lib/supabase.js";
import { generateId, generateClubCode, hashPin, isHashed, getContrastTextColor } from "./lib/utils.js";
import { scoresToFlat, flatToScoreRows, gymnast_key } from "./lib/scoring.js";
import { events, syncQueue } from "./lib/storage.js";
import { migrateCompData, migrateScoreKeys, migrateGymnasts } from "./lib/migrate.js";
import { printDocument, buildResultsHTML, exportResultsXLSX } from "./lib/pdf.js";
import { css } from "./lib/styles.js";
import { getSubscriptionStatus, getPlanLabel } from "./lib/subscription.js";

// ── component imports ──
import ErrorBoundary from "./components/shared/ErrorBoundary.jsx";
import ConfirmModal from "./components/shared/ConfirmModal.jsx";
import PlanPickerModal from "./components/shared/PlanPickerModal.jsx";
import Step1_CompDetails from "./components/setup/Step1_CompDetails.jsx";
import Step2_Gymnasts from "./components/setup/Step2_Gymnasts.jsx";
import RoundsGroupsPage from "./components/setup/RoundsGroupsPage.jsx";
import Phase2_Exports from "./components/competition/Phase2_Exports.jsx";
import Phase2_Step1 from "./components/competition/Phase2_Step1.jsx";
import Phase2_Step2 from "./components/competition/Phase2_Step2.jsx";
import MCMode from "./components/competition/MCMode.jsx";
import AuthScreen from "./components/auth/AuthScreen.jsx";
import ProfileOnboardingScreen from "./components/auth/ProfileOnboarding.jsx";
import OrganizerDashboard from "./components/dashboard/OrganizerDashboard.jsx";
import CompDashboard from "./components/dashboard/CompDashboard.jsx";
import AdminDashboard from "./components/admin/AdminDashboard.jsx";
import AppSidebar from "./components/layout/AppSidebar.jsx";
import MobileLogoHeader from "./components/layout/MobileLogoHeader.jsx";
import MobileTabBar from "./components/layout/MobileTabBar.jsx";
import PinSetupModal from "./components/pages/PinSetupModal.jsx";
import AccountSettingsModal from "./components/pages/AccountSettingsModal.jsx";
import PrivacyPolicyScreen from "./components/pages/PrivacyPolicyScreen.jsx";
import TermsOfServiceScreen from "./components/pages/TermsOfServiceScreen.jsx";
import DataProcessingAgreementScreen from "./components/pages/DataProcessingAgreementScreen.jsx";
import PaymentSuccessScreen from "./components/pages/PaymentSuccessScreen.jsx";


// Whether two apparatus lists differ in membership (added/removed), ignoring order.
// A pure reorder is data-safe — scores are keyed by apparatus name, not position —
// so it should never trip the destructive-change warning.
const apparatusSetChanged = (prev = [], next = []) =>
  prev.length !== next.length ||
  [...prev].sort().join(" ") !== [...next].sort().join(" ");

// A rotation's number tracks its apparatus position: "Rotation N" is the squad on
// the Nth apparatus. When apparatus are reordered, re-apply that binding: reorder
// each round's rotation list by the same permutation, renumber sequentially (keeping
// the existing cross-round offset), and return a map from each old rotation label to
// its new one. Returns null when the change isn't a pure reorder (same members, same
// count, different order), so callers leave rotations untouched.
function remapRotationsForApparatusReorder(prevApparatus, nextApparatus, compData) {
  const strip = (list) => (list || []).filter((a) => a !== "Rest");
  const prev = strip(prevApparatus);
  const next = strip(nextApparatus);
  if (prev.length === 0 || prev.length !== next.length) return null;
  if ([...prev].sort().join(" ") !== [...next].sort().join(" ")) return null;
  // perm[i] = old index of the apparatus now sitting at new index i (first unused
  // match, so duplicate apparatus names can't collide onto one slot).
  const used = new Array(prev.length).fill(false);
  const perm = next.map((app) => {
    let idx = prev.indexOf(app);
    while (idx !== -1 && used[idx]) idx = prev.indexOf(app, idx + 1);
    if (idx !== -1) used[idx] = true;
    return idx;
  });
  if (perm.some((i) => i < 0)) return null;

  const gbr = compData.groupsByRound || {};
  const newGbr = { ...gbr };
  const labelMap = {};
  let offset = 0;
  (compData.rounds || []).forEach((rd) => {
    const oldGroups = gbr[rd.id] || [];
    // Only permute rounds whose rotation count lines up with the apparatus; otherwise
    // keep their order and just renumber in place from the running offset.
    const reordered = oldGroups.length === prev.length ? perm.map((oi) => oldGroups[oi]) : [...oldGroups];
    const relabelled = reordered.map((_, i) => `Rotation ${offset + i + 1}`);
    reordered.forEach((oldLabel, i) => { if (oldLabel != null) labelMap[String(oldLabel)] = relabelled[i]; });
    if (oldGroups.length) newGbr[rd.id] = relabelled;
    offset += oldGroups.length;
  });
  return { groupsByRound: newGbr, labelMap };
}

// Detect a pure apparatus reorder on a comp-data change and, if found, return the
// next comp-data with rotations renumbered plus the gymnast list with each stored
// rotation label remapped. Otherwise returns the inputs unchanged.
function applyApparatusReorder(prev, next, currentGymnasts) {
  const orderChanged = JSON.stringify(prev.apparatus || []) !== JSON.stringify(next.apparatus || []);
  if (!orderChanged || apparatusSetChanged(prev.apparatus, next.apparatus)) {
    return { next, remappedGymnasts: null };
  }
  const remap = remapRotationsForApparatusReorder(prev.apparatus, next.apparatus, next);
  if (!remap) return { next, remappedGymnasts: null };
  const remappedGymnasts = (currentGymnasts || []).map((g) =>
    g.group && remap.labelMap[String(g.group)] ? { ...g, group: remap.labelMap[String(g.group)] } : g
  );
  // Stored per-group apparatus orders follow the group relabel unchanged — a
  // pure apparatus reorder never resets them, it only renames their keys.
  const newRotations = {};
  Object.entries(next.rotations || {}).forEach(([rid, byGroup]) => {
    const remappedGroups = {};
    Object.entries(byGroup || {}).forEach(([grp, order]) => {
      remappedGroups[remap.labelMap[grp] || grp] = order;
    });
    newRotations[rid] = remappedGroups;
  });
  return { next: { ...next, groupsByRound: remap.groupsByRound, rotations: newRotations }, remappedGymnasts };
}

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
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterCounts, setFilterCounts] = useState({ draft: 0, active: 0, completed: 0, archived: 0 });
  // Current event record (from events store) — links comp to account
  const [currentEventId, setCurrentEventId] = useState(null);
  // PIN role state (judge / scorekeeper / collaborator — PIN-only sessions)
  const [pinRole, setPinRole] = useState(null);           // "judge" | "scorekeeper" | "collaborator" | null
  const [lockedApparatus, setLockedApparatus] = useState(null); // string | null
  const [activeRound, setActiveRound] = useState(null);  // lifted for PIN sidebar
  // Shared collaborator session — { authHash, status, ownerId, ownerSub, pinFields }.
  // authHash is the collaborator PIN hash the session entered with; pinFields
  // mirrors the server-held score-lock fields so collaborator writes can never
  // change them; ownerSub is the competition owner's subscription state.
  const [collabSession, setCollabSession] = useState(null);
  const [collabNotice, setCollabNotice] = useState(null);
  const isCollaborator = pinRole === "collaborator";

  // Derived account shape — keeps all downstream component code unchanged
  const currentAccount = currentUser ? {
    id:       currentUser.id,
    email:    currentUser.email,
    name:     currentProfile?.full_name || currentUser.email?.split("@")[0] || "",
    clubName: currentProfile?.club_name || "",
  } : null;
  // Organiser-level UI/capabilities: a signed-in organiser or a collaborator session
  const canOrganise = !!currentAccount || isCollaborator;

  // Derived subscription status for UI
  const subscriptionStatus = useMemo(() => {
    if (!currentProfile) return null;
    const sub = getSubscriptionStatus(currentProfile);
    return { ...sub, planLabel: getPlanLabel(sub.plan) };
  }, [currentProfile]);

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
  const [exportPicker, setExportPicker] = useState(null); // { type: "xlsx" | "pdf" } | null — round chooser
  const [exportRoundSel, setExportRoundSel] = useState("all");
  const [showCompId, setShowCompId] = useState(false);
  const syncTimer = useRef(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => syncQueue.size());
  const flushingRef = useRef(false);

  const [compData, setCompDataRaw] = useState({
    name: "", location: "", date: "", holder: "",
    organiserName: "", venue: "", scoringMode: "fig",
    allowSubmissions: true, dataConsentConfirmed: false,
    clubs: [], rounds: [], apparatus: [], levels: [], judges: [], ageRanges: []
  });
  const [gymnasts, setGymnasts] = useState([]);
  const gymnastsRef = useRef([]); // for realtime handlers that must not go stale
  useEffect(() => { gymnastsRef.current = gymnasts; }, [gymnasts]);
  const [scores, setScores] = useState({});
  const scoresRef = useRef({}); // current scores for realtime handlers (no stale closure)
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  const [newScoreKeys, setNewScoreKeys] = useState(new Set());
  // Scores whose write to the scores table FAILED (offline, timeout, error).
  // Keyed by base key (roundId__gymnastId__apparatus) → { kind: "save"|"delete",
  // roundId, gymnastId, apparatus, flatSubset?, failedAt }. A score lives in
  // React state only — nothing here is persisted — so an entry means the value
  // on screen is NOT in the database and will be lost on reload. Cleared when
  // the same key later saves, or when the user knowingly discards.
  const [unsavedScores, setUnsavedScores] = useState({});
  const unsavedScoresRef = useRef({});
  useEffect(() => { unsavedScoresRef.current = unsavedScores; }, [unsavedScores]);
  const unsavedCount = Object.keys(unsavedScores).length;
  // Confirm-before-discard for actions that replace score state (open another
  // competition, new competition, exit a PIN session). { message, proceed }
  const [discardScoresPrompt, setDiscardScoresPrompt] = useState(null);
  // Notices about unsaved scores overwritten by another device (realtime)
  const [scoreNotices, setScoreNotices] = useState([]);
  // scores-table row id → base key. Realtime DELETE events on an RLS-enabled
  // table carry ONLY the primary key in the old record (even with REPLICA
  // IDENTITY FULL — Supabase strips the rest because RLS cannot be evaluated
  // against a deleted row), so this map is the only way to know which score a
  // delete refers to. Filled from every table load, every INSERT/UPDATE event
  // and our own upserts.
  const scoreRowIdsRef = useRef({});
  const rememberRowIds = useCallback((rows) => {
    for (const r of rows || []) {
      if (r?.id) scoreRowIdsRef.current[r.id] = gymnast_key(r.round_id, r.gymnast_id, r.apparatus);
    }
  }, []);

  // Drop every local key for one score (base key + all sub keys). Used by the
  // confirmed-delete path and by realtime DELETE events from other devices.
  const removeScoreLocally = useCallback((bk) => {
    setScores(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key === bk || key.startsWith(bk + "__")) delete next[key];
      }
      return next;
    });
  }, []);
  const effectiveActiveRound = activeRound ?? compData?.rounds?.[0]?.id ?? "";

  // ── Draft buffer for Setup — isolates edits until explicit save ──
  const [draftCompData, setDraftCompData] = useState(null);
  const [draftGymnasts, setDraftGymnasts] = useState(null);
  const [setupSnapshot, setSetupSnapshot] = useState(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const discardCallbackRef = useRef(null);

  // Derived values — avoid redundant events.getAll().find() in render path
  const currentEvent = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
  // Collaborator sessions have no local event record — the row status stands in
  const eventStatus = currentEvent?.status ?? (isCollaborator ? collabSession?.status : undefined);
  const allGymnastsComplete = useMemo(() => {
    const rf = ["name","club","level","round","age"];
    return gymnasts.length === 0 || gymnasts.every(g => rf.every(f => g[f] && g[f].toString().trim()));
  }, [gymnasts]);

  const inSetupMode = phase === 1 || phase === "gymnasts" || phase === "rounds-groups";
  const isDirty = inSetupMode && setupSnapshot !== null && (
    JSON.stringify(draftCompData) !== JSON.stringify(setupSnapshot.compData) ||
    JSON.stringify(draftGymnasts) !== JSON.stringify(setupSnapshot.gymnasts)
  );

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));
  // Sessions that write scores: judges/scorekeepers always, anyone on the
  // competition (score entry) phase. Drives the offline banner wording.
  const sessionEntersScores = pinRole === "judge" || pinRole === "scorekeeper" || phase === 2;

  // ── Auth initialisation ──────────────────────────────────────────────────
  const loadUserProfile = async (user) => {
    try {
      const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) {
        // The fetch FAILED (network/RLS) — that is not the same as "no profile
        // exists". Never route to onboarding here: it would trap the user and,
        // if they filled it in, overwrite their real profile with blanks. Land
        // on the dashboard; the account name falls back to their email.
        console.error("Profile load failed:", error.message);
        setCurrentProfile(null);
        setAuthLoading(false);
        if (!hasAuthed.current) {
          hasAuthed.current = true;
          setScreen("org-dashboard");
        }
        return;
      }
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
        setPinRole(null);
        setLockedApparatus(null);
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch last_active_at once per session ────────────────────────────
  useEffect(() => {
    if (currentProfile?.id && currentUser?.id) touchLastActive(currentUser.id);
  }, [currentProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const pushToSupabase = useCallback(async (nextCompData, nextGymnasts, pin, status, extraFields) => {
    if (inSandbox) { setSyncStatus("sandbox"); return; }
    if (!currentUser) {
      if (pinRole !== "collaborator") return; // Judge/scorer mode — no Supabase auth, skip silently
      // Collaborator session: update the owner's existing row via the anon key
      // (same trust model as judge score writes). The competition's PINs and
      // score-lock fields are pinned to the server-held values from entry, so
      // nothing in a collaborator session can change or clear them.
      setSyncStatus("saving");
      const resolvedCollabPin = pin ?? compPin;
      const guardedCompData = {
        ...nextCompData,
        pin: resolvedCollabPin,
        collabPin: collabSession?.authHash || null,
        scoreEditPin: collabSession?.pinFields?.scoreEditPin ?? null,
        scoreLockEnabled: !!collabSession?.pinFields?.scoreLockEnabled,
      };
      const patch = {
        data: { compData: guardedCompData, gymnasts: nextGymnasts, pin: resolvedCollabPin },
        status: status || collabSession?.status || "active",
        ...(extraFields || {}),
      };
      try {
        // Anon-key update: a row-security filter returns no error and 0 rows,
        // so the count is checked too.
        const { error, count } = await supabase.from("competitions").update(patch, { count: "exact" }).eq("id", compId);
        if (error) throw new Error(error.message);
        if (count === 0) throw new Error("update affected 0 rows — blocked by row security or competition missing");
        setSyncStatus("saved");
      } catch (e) {
        console.error("Collaborator sync failed:", e.message);
        setSyncStatus("error");
      }
      return;
    }
    setSyncStatus("saving");
    const resolvedPin = pin ?? compPin;
    const payload = { compData: { ...nextCompData, pin: resolvedPin }, gymnasts: nextGymnasts, pin: resolvedPin };
    const record = { id: compId, data: payload, user_id: currentUser.id, ...extraFields };
    const localEv = events.getAll().find(e => e.compId === compId);
    record.status = status || localEv?.status || "draft";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("no active session");
      console.log("[pushToSupabase] upsert payload keys:", Object.keys(record), "status:", record.status);
      const { data: respData, error } = await supabase.from("competitions").upsert(record);
      if (error) throw new Error(error.message);
      console.log("[pushToSupabase] upsert response:", { data: respData, error });
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
  }, [compId, compPin, inSandbox, currentUser, pinRole, collabSession]);

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

    // INSERT / UPDATE: merge the new row into state
    const onUpsert = (payload) => {
      const row = payload.new;
      const bk = gymnast_key(row.round_id, row.gymnast_id, row.apparatus);
      console.debug("[scores realtime]", payload.eventType, bk); // verbose level — hidden unless enabled
      rememberRowIds([row]);
      const flat = scoresToFlat([row]);
      // The database is the truth: if this device had an UNSAVED value for
      // the same score, it is now replaced — say so rather than silently
      // swapping what the judge typed.
      if (unsavedScoresRef.current[bk]) {
        const name = gymnastsRef.current.find(g => g.id === row.gymnast_id)?.name || "a gymnast";
        const app = (row.apparatus || "").replace(/\s*\([A-Z]+\)\s*$/, "");
        setUnsavedScores(prev => { const n = { ...prev }; delete n[bk]; return n; });
        setScoreNotices(prev => [...prev, `Your unsaved ${app} score for ${name} was replaced by a value saved from another device.`]);
      }
      // Merge into scores state directly (NOT via setScoresWithSync to avoid re-pushing)
      setScores(prev => ({ ...prev, ...flat }));
      // Flash animation — add base key, remove after 2s
      setNewScoreKeys(prev => new Set(prev).add(bk));
      const t = setTimeout(() => { setNewScoreKeys(prev => { const n = new Set(prev); n.delete(bk); return n; }); flashTimers.delete(t); }, 2000);
      flashTimers.add(t);
    };

    // Remove one score locally in response to a remote delete, honouring the
    // unsaved-score markers.
    const applyRemoteDelete = (bk) => {
      const unsaved = unsavedScoresRef.current[bk];
      if (unsaved?.kind === "save") {
        // This device holds a value for the score that never reached the
        // database. The row someone else deleted was the old one; the
        // local value is still unsaved, so keep both it and its marker.
        return;
      }
      if (unsaved?.kind === "delete") {
        // Our own blocked delete has now been done elsewhere — resolved.
        setUnsavedScores(prev => { const n = { ...prev }; delete n[bk]; return n; });
      }
      removeScoreLocally(bk);
    };

    // DELETE: the server matches the comp_id filter against the full old row
    // (REPLICA IDENTITY FULL) and delivers the event — verified live — but
    // because RLS is enabled on scores, the old record it sends contains ONLY
    // the primary key. So the score is identified through the id → key map;
    // if the id is unknown (a row this client never saw), reconcile against
    // the table instead of guessing.
    const onDelete = async (payload) => {
      const id = payload.old?.id;
      if (!id) {
        console.warn("[scores realtime] DELETE without a primary key in old record", payload.old);
        return;
      }
      const bk = scoreRowIdsRef.current[id];
      if (bk) {
        console.debug("[scores realtime] DELETE", bk);
        delete scoreRowIdsRef.current[id];
        applyRemoteDelete(bk);
        return;
      }
      console.debug("[scores realtime] DELETE for unknown row id — reconciling from table", id);
      try {
        const { data: rows, error } = await supabase.from("scores").select("id,round_id,gymnast_id,apparatus").eq("comp_id", compId);
        if (error) throw new Error(error.message);
        rememberRowIds(rows);
        const present = new Set((rows || []).map(r => gymnast_key(r.round_id, r.gymnast_id, r.apparatus)));
        // Base keys are exactly three segments; sub keys hang off them
        const localBase = new Set(Object.keys(scoresRef.current).map(k => k.split("__").slice(0, 3).join("__")));
        for (const lb of localBase) if (!present.has(lb)) applyRemoteDelete(lb);
      } catch (e) {
        console.warn("[scores realtime] reconcile after DELETE failed:", e.message);
      }
    };

    // ── TEMPORARY DIAGNOSTIC LOGGING ── remove once the DELETE event has been
    // observed directly. Logs every event exactly as received, before any
    // handler runs, and the full channel configuration on subscribe.
    const bindings = [
      { event: "INSERT", schema: "public", table: "scores", filter: `comp_id=eq.${compId}`, handler: onUpsert },
      { event: "UPDATE", schema: "public", table: "scores", filter: `comp_id=eq.${compId}`, handler: onUpsert },
      { event: "DELETE", schema: "public", table: "scores", filter: `comp_id=eq.${compId}`, handler: onDelete },
    ];
    const logRaw = (payload) => {
      let raw;
      try { raw = JSON.stringify(payload, null, 2); } catch { raw = String(payload); }
      console.log(`[scores realtime RAW] ${payload?.eventType} at ${new Date().toISOString()}\n${raw}`);
    };
    const channelName = `scores:${compId}`;
    let channel = supabase.channel(channelName);
    for (const b of bindings) {
      const { handler, ...config } = b;
      channel = channel.on("postgres_changes", config, (payload) => { logRaw(payload); handler(payload); });
    }
    channel = channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[scores realtime] SUBSCRIBED channel "${channelName}" with bindings:\n${JSON.stringify(bindings.map(({ event, schema, table, filter }) => ({ event, schema, table, filter })), null, 2)}`);
      } else {
        console.log(`[scores realtime] channel "${channelName}" status: ${status}${err ? " — " + err.message : ""}`);
      }
      // Surfaced so a dead channel is diagnosable from the console
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[scores realtime] channel", status, err?.message || "");
    });

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
      const raw = typeof updater === "function" ? updater(prev) : updater;
      // A pure apparatus reorder renumbers rotations to follow the new order.
      const { next, remappedGymnasts } = applyApparatusReorder(prev, raw, gymnasts);
      if (gymnasts.length > 0) {
        const apparatusChanged = apparatusSetChanged(prev.apparatus, next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      const nextGymnasts = remappedGymnasts || gymnasts;
      if (remappedGymnasts) setGymnasts(remappedGymnasts);
      scheduleSync(next, nextGymnasts);
      return next;
    });
  }, [gymnasts, scheduleSync]);

  // Local-only version of setCompData — updates React state without syncing to Supabase.
  // Used in Phase 1 setup so edits aren't auto-saved.
  const setCompDataLocal = useCallback((updater) => {
    setCompDataRaw(prev => {
      const raw = typeof updater === "function" ? updater(prev) : updater;
      // A pure apparatus reorder renumbers rotations to follow the new order.
      const { next, remappedGymnasts } = applyApparatusReorder(prev, raw, gymnasts);
      if (gymnasts.length > 0) {
        const apparatusChanged = apparatusSetChanged(prev.apparatus, next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      if (remappedGymnasts) setGymnasts(remappedGymnasts);
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

  // ── Unsaved-score bookkeeping ────────────────────────────────────────────
  const markScoreUnsaved = useCallback((bk, entry) => {
    setUnsavedScores(prev => ({ ...prev, [bk]: { ...entry, failedAt: Date.now() } }));
  }, []);
  const clearScoreUnsaved = useCallback((bk) => {
    setUnsavedScores(prev => {
      if (!(bk in prev)) return prev;
      const next = { ...prev };
      delete next[bk];
      return next;
    });
  }, []);

  // ── Score table push ────────────────────────────────────────────────────
  // A failed write is a failure the judge must see: the score stays on screen
  // but is NOT in the database, so it is marked unsaved (and can be retried).
  // The row count is checked as well as the error: a write filtered by row
  // security returns no error and touches nothing.
  const pushScoreToTable = useCallback(async (roundId, gymnastId, apparatus, flatSubset) => {
    if (inSandbox) return true;
    const bk = `${roundId}__${gymnastId}__${apparatus}`;
    try {
      const submittedBy = currentUser
        ? `organiser:${currentUser.id}`
        : pinRole === "collaborator" ? "collaborator" : "judge";
      const rows = flatToScoreRows(flatSubset, compId, submittedBy);
      if (!rows.length) return true;
      const { data: saved, error, count } = await supabase.from("scores")
        .upsert(rows, { onConflict: "comp_id,round_id,gymnast_id,apparatus", count: "exact" })
        .select("id,round_id,gymnast_id,apparatus");
      if (error) throw new Error(error.message);
      if (count != null && count < rows.length) throw new Error(`upsert affected ${count} of ${rows.length} rows`);
      rememberRowIds(saved); // so a later DELETE event (id only) can be matched
      clearScoreUnsaved(bk);
      return true;
    } catch (e) {
      console.error("[pushScoreToTable]", e.message);
      markScoreUnsaved(bk, { kind: "save", roundId, gymnastId, apparatus, flatSubset });
      return false;
    }
  }, [compId, currentUser, inSandbox, pinRole, clearScoreUnsaved, markScoreUnsaved, rememberRowIds]);

  // Delete a score row and, ONLY once the database confirms it, remove it from
  // local state. Resolves true on success, false on failure. A delete filtered
  // by row security returns no error and 0 rows — so 0 rows is checked against
  // the table: if the row is still there the delete was blocked and the score
  // is marked "delete not saved" (mark: false skips the marker for callers
  // that handle the failure themselves).
  const deleteScoreFromTable = useCallback(async (roundId, gymnastId, apparatus, { mark = true } = {}) => {
    const bk = `${roundId}__${gymnastId}__${apparatus}`;
    if (inSandbox) { removeScoreLocally(bk); return true; }
    const match = (q) => q.eq("comp_id", compId).eq("round_id", roundId).eq("gymnast_id", gymnastId).eq("apparatus", apparatus);
    try {
      const { error, count } = await match(supabase.from("scores").delete({ count: "exact" }));
      if (error) throw new Error(error.message);
      if (count === 0) {
        // Nothing deleted: fine if there was nothing to delete (never saved, or
        // already removed elsewhere); a failure if the row still exists.
        const { data: still, error: selErr } = await match(supabase.from("scores").select("id")).limit(1);
        if (selErr) throw new Error(selErr.message);
        if (still && still.length > 0) throw new Error("delete affected 0 rows but the score still exists — blocked by row security");
      }
      removeScoreLocally(bk);
      clearScoreUnsaved(bk);
      return true;
    } catch (e) {
      console.error("[deleteScoreFromTable]", e.message);
      if (mark) markScoreUnsaved(bk, { kind: "delete", roundId, gymnastId, apparatus });
      return false;
    }
  }, [compId, inSandbox, removeScoreLocally, clearScoreUnsaved, markScoreUnsaved]);

  // Re-attempt every unsaved write with the payload captured at failure time.
  // In-memory only (a persistent score queue is a separate change) — a retry
  // that fails simply leaves the score marked unsaved.
  const retryUnsavedScores = useCallback(async () => {
    const entries = Object.values(unsavedScoresRef.current);
    for (const u of entries) {
      if (u.kind === "delete") await deleteScoreFromTable(u.roundId, u.gymnastId, u.apparatus);
      else await pushScoreToTable(u.roundId, u.gymnastId, u.apparatus, u.flatSubset || {});
    }
  }, [deleteScoreFromTable, pushScoreToTable]);

  // Retry automatically when the connection comes back
  useEffect(() => {
    const onOnline = () => { if (Object.keys(unsavedScoresRef.current).length > 0) retryUnsavedScores(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retryUnsavedScores]);

  // Warn before browser close / refresh while any score is unsaved — the
  // scores exist only in this page's memory.
  useEffect(() => {
    if (unsavedCount === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsavedCount]);

  // Human-readable list of what would be lost, for the discard prompts
  const describeUnsaved = useCallback(() => {
    const list = Object.values(unsavedScoresRef.current);
    const nameOf = (id) => gymnastsRef.current.find(g => g.id === id)?.name || "Unknown gymnast";
    const shortApp = (a) => (a || "").replace(/\s*\([A-Z]+\)\s*$/, "");
    const lines = list.slice(0, 6).map(u => `${nameOf(u.gymnastId)} · ${shortApp(u.apparatus)}${u.kind === "delete" ? " (deletion)" : ""}`);
    if (list.length > 6) lines.push(`…and ${list.length - 6} more`);
    return lines;
  }, []);

  // Run `proceed` now if nothing is unsaved; otherwise ask first. Confirming
  // clears the markers (the user has been told) and then proceeds.
  const guardUnsavedScores = useCallback((proceed, actionLabel) => {
    if (Object.keys(unsavedScoresRef.current).length === 0) { proceed(); return; }
    setDiscardScoresPrompt({ actionLabel, lines: describeUnsaved(), proceed });
  }, [describeUnsaved]);

  // Remove all leftover (empty/zero) score rows for one gymnast under one round —
  // used after a "move to round" so the old round leaves no orphaned rows behind.
  // Scoped to comp_id + round_id + gymnast_id only; never touches other gymnasts.
  // Zero rows is the normal case here (the move is blocked if any positive
  // score exists), so it only counts as a failure when rows are still present
  // afterwards — i.e. the delete was filtered. Resolves true/false.
  const clearRoundScoresForGymnast = useCallback(async (roundId, gymnastId) => {
    if (inSandbox) return true;
    const match = (q) => q.eq("comp_id", compId).eq("round_id", roundId).eq("gymnast_id", gymnastId);
    try {
      const { error, count } = await match(supabase.from("scores").delete({ count: "exact" }));
      if (error) throw new Error(error.message);
      if (count === 0) {
        const { data: still, error: selErr } = await match(supabase.from("scores").select("id")).limit(1);
        if (selErr) throw new Error(selErr.message);
        if (still && still.length > 0) throw new Error("delete affected 0 rows but leftover score rows still exist — blocked by row security");
      }
      return true;
    } catch (e) {
      console.error("[clearRoundScoresForGymnast]", e.message);
      return false;
    }
  }, [compId, inSandbox]);

  // ── Draft-only setters for Setup ──
  const setDraftCompDataLocal = useCallback((updater) => {
    setDraftCompData(prev => {
      if (prev === null) return prev;
      const raw = typeof updater === "function" ? updater(prev) : updater;
      // A pure apparatus reorder renumbers rotations to follow the new order.
      const { next, remappedGymnasts } = applyApparatusReorder(prev, raw, draftGymnasts);
      if ((draftGymnasts || []).length > 0) {
        const apparatusChanged = apparatusSetChanged(prev.apparatus, next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      if (remappedGymnasts) setDraftGymnasts(remappedGymnasts);
      return next;
    });
  }, [draftGymnasts]);

  const setDraftGymnastsLocal = useCallback((updater) => {
    setDraftGymnasts(prev => typeof updater === "function" ? updater(prev) : updater);
  }, []);

  const clearDraft = () => {
    setDraftCompData(null);
    setDraftGymnasts(null);
    setSetupSnapshot(null);
  };

  const commitDraft = () => {
    const cd = draftCompData || compData;
    const g = draftGymnasts || gymnasts;
    setCompDataRaw(cd);
    setGymnasts(g);
    clearDraft();
    return { compData: cd, gymnasts: g };
  };

  const confirmSetupChange = () => {
    if (draftCompData !== null) {
      setDraftCompData(pendingChange);
    } else {
      setCompDataRaw(pendingChange);
    }
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

  // ---- Subscription handlers ----
  const handleSubscribe = () => setShowPlanPicker(true);

  const handlePlanSelected = async (planId) => {
    if (!currentUser) throw new Error("Not signed in");
    const res = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, plan: planId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error || "Failed to create checkout session");
  };

  const handleManageSubscription = async () => {
    if (!currentUser) return;
    if (subscriptionStatus?.isFree) { setShowPlanPicker(true); return; }
    try {
      const res = await fetch("/.netlify/functions/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else console.error("[handleManageSubscription] No URL:", data.error);
    } catch (e) { console.error("[handleManageSubscription] error:", e.message); }
  };

  // ---- New competition flow ----
  const handleNew = () => guardUnsavedScores(doHandleNew, "start a new competition");
  const doHandleNew = () => {
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    const freshCompData = { name:"", location:"", date:"", holder: currentProfile?.full_name || "", organiserName: currentProfile?.club_name || "", venue:"", allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] };
    const freshGymnasts = [];
    setCompDataRaw(freshCompData);
    setGymnasts(freshGymnasts);
    setScores({});
    // Initialize draft buffer
    setSetupSnapshot({ compData: structuredClone(freshCompData), gymnasts: [] });
    setDraftCompData(structuredClone(freshCompData));
    setDraftGymnasts([]);
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    // Create event record if logged in
    if (currentAccount) {
      const ev = events.create(currentAccount.id, newCompId);
      setCurrentEventId(ev.id);

      // Fire-and-forget: notify Loops of new competition
      if (currentUser?.email) {
        fetch("/.netlify/functions/loops-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: currentUser.email,
            eventName: "comp_created",
            eventProperties: { compId: newCompId },
          }),
        }).catch(e => console.error("[loops-event] comp_created failed:", e.message));
      }
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  // Open an existing event from the organiser dashboard. Opening replaces
  // score state from the scores table, so anything unsaved here would vanish —
  // confirm first.
  const handleOpenEvent = (ev) => guardUnsavedScores(() => doOpenEvent(ev), "open another competition");
  const doOpenEvent = async (ev) => {
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
      rememberRowIds(tableRows);
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
      rememberRowIds(tableRows);
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
      rememberRowIds(tableRows);
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
  // mode: "setup" = config only, "full" = config + clubs + gymnasts
  const handleDuplicateEvent = (ev, mode = "setup") => guardUnsavedScores(() => doDuplicateEvent(ev, mode), "duplicate a competition");
  const doDuplicateEvent = (ev, mode = "setup") => {
    const snapshot = ev.snapshot;
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    // Deep copy and regenerate all IDs to fully detach from source
    let baseData;
    let newGymnasts = [];
    if (snapshot?.compData) {
      const src = structuredClone(snapshot.compData);
      // Build ID maps so gymnast references stay consistent
      const levelMap = {};
      src.levels = (src.levels || []).map(l => {
        const newId = generateId();
        levelMap[l.id] = newId;
        return { ...l, id: newId };
      });
      const roundMap = {};
      src.rounds = (src.rounds || []).map(r => {
        const newId = generateId();
        roundMap[r.id] = newId;
        return { ...r, id: newId, agenda: (r.agenda || []).map(e => ({ ...e, id: generateId() })) };
      });
      // Remap groupsByRound keys
      if (src.groupsByRound) {
        const newGbr = {};
        Object.entries(src.groupsByRound).forEach(([oldRid, groups]) => {
          const newRid = roundMap[oldRid];
          if (newRid) newGbr[newRid] = groups;
        });
        src.groupsByRound = newGbr;
      }
      // Remap per-round cycle orders the same way
      if (src.cycleByRound) {
        const newCycles = {};
        Object.entries(src.cycleByRound).forEach(([oldRid, order]) => {
          const newRid = roundMap[oldRid];
          if (newRid) newCycles[newRid] = order;
        });
        src.cycleByRound = newCycles;
      }
      // Remap per-round rest slots the same way
      if (src.restsByRound) {
        const newRests = {};
        Object.entries(src.restsByRound).forEach(([oldRid, n]) => {
          const newRid = roundMap[oldRid];
          if (newRid) newRests[newRid] = n;
        });
        src.restsByRound = newRests;
      }
      // Remap stored rotation keys the same way
      if (src.rotations) {
        const newRot = {};
        Object.entries(src.rotations).forEach(([oldRid, byGroup]) => {
          const newRid = roundMap[oldRid];
          if (newRid) newRot[newRid] = byGroup;
        });
        src.rotations = newRot;
      }
      const freshCodes = [];
      if (mode === "full") {
        src.clubs = (src.clubs || []).map(c => {
          const code = generateClubCode(freshCodes);
          freshCodes.push(code);
          return { ...c, id: generateId(), clubCode: code };
        });
      } else {
        src.clubs = [];
      }
      src.name = `${src.name || "Competition"} (Copy)`;
      src.date = "";
      src.dataConsentConfirmed = false;
      src.judges = [];
      src.collabPin = null; // shared access never carries over to a copy
      baseData = src;

      // Full mode: duplicate gymnasts with new IDs + remapped level/round
      if (mode === "full" && snapshot.gymnasts?.length) {
        newGymnasts = snapshot.gymnasts.map(g => ({
          ...structuredClone(g),
          id: generateId(),
          level: levelMap[g.level] || g.level,
          round: roundMap[g.round] || "",
          dns: false,
          withdrawn: false,
        }));
      }
    } else {
      baseData = { name:"Copy", location:"", date:"", holder:"", organiserName:"", venue:"", allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] };
    }
    setCompDataRaw(migrateCompData(baseData));
    setGymnasts(newGymnasts);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    if (currentAccount) {
      const newEv = events.create(currentAccount.id, newCompId);
      snapshotWithPin(newEv.id, baseData, newGymnasts);
      setCurrentEventId(newEv.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  const handlePinSet = (pin) => {
    // Collaborator sessions can never change a competition PIN
    if (isCollaborator) { setShowPinModal(false); return; }
    setCompPin(pin); setShowPinModal(false);
    // Sync PIN to Supabase + local snapshot
    pushToSupabase(compData, gymnasts, pin);
    if (currentEventId) events.snapshot(currentEventId, { ...compData, pin: pin }, gymnasts);
    if (pinModalCallback.current) { pinModalCallback.current(); pinModalCallback.current = null; }
  };

  // Navigate back to org dashboard
  const goBackToDashboard = () => guardUnsavedScores(doGoBackToDashboard, "leave this competition");
  const doGoBackToDashboard = () => {
    // If in setup with unsaved changes, prompt before discarding
    if (inSetupMode && isDirty) {
      discardCallbackRef.current = () => {
        clearDraft();
        if (currentEventId) {
          if (syncTimer.current) clearTimeout(syncTimer.current);
          snapshotWithPin(currentEventId, compData, gymnasts);
          pushToSupabase(compData, gymnasts);
        }
        setScreen("org-dashboard");
      };
      setShowDiscardModal(true);
      return;
    }
    clearDraft();
    if (currentEventId) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      snapshotWithPin(currentEventId, compData, gymnasts);
      pushToSupabase(compData, gymnasts);
    }
    setScreen("org-dashboard");
  };

  // ---- Sidebar nav callbacks for active screen ----
  const handleSaveSetup = () => {
    const { compData: cd, gymnasts: g } = commitDraft();
    if (syncTimer.current) clearTimeout(syncTimer.current);
    pushToSupabase(cd, g);
    if (currentEventId) snapshotWithPin(currentEventId, cd, g);
  };

  const setupCheckData = draftCompData || compData;
  const setupCanProceed = setupCheckData.name && setupCheckData.date &&
    (setupCheckData.rounds || []).length > 0 &&
    (setupCheckData.apparatus || []).length > 0 && (setupCheckData.levels || []).length > 0 &&
    setupCheckData.dataConsentConfirmed;
  const setupCanSave = !!setupCheckData.name;

  const handleMobileSave = () => {
    if (setupCanProceed) {
      // All fields complete — commit draft, full save & continue
      const { compData: cd, gymnasts: g } = commitDraft();
      if (syncTimer.current) clearTimeout(syncTimer.current);
      const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
      const isDraft = ev && ev.status === "draft";
      pushToSupabase(cd, g, undefined, isDraft ? "active" : undefined);
      if (currentEventId) {
        snapshotWithPin(currentEventId, cd, g);
        if (isDraft) events.update(currentEventId, { status: "active" });
      }
      if (!compPin && !isCollaborator) {
        pinModalCallback.current = () => setPhase("dashboard");
        setShowPinModal(true);
      } else {
        setPhase("dashboard");
      }
    } else if (setupCanSave) {
      // Partial save — commit draft, persist and go back to dashboard
      const { compData: cd, gymnasts: g } = commitDraft();
      if (syncTimer.current) clearTimeout(syncTimer.current);
      pushToSupabase(cd, g);
      if (currentEventId) snapshotWithPin(currentEventId, cd, g);
      setScreen("org-dashboard");
    }
  };

  const handleStartComp = () => {
    if (isCollaborator) {
      // Entitlement follows the competition OWNER's subscription, never the
      // collaborator session — and a collaborator is never shown the plan
      // picker (subscriptions are excluded from shared access).
      const ownerSub = collabSession?.ownerSub;
      if (collabSession?.status !== "live" && !ownerSub?.isActive && !ownerSub?.isPastDue) {
        setCollabNotice("This competition can't be started from shared access: the organiser's subscription isn't active. Ask the competition owner to update their plan, then try again.");
        return;
      }
      setPhase(2); setStep(1);
      if (collabSession?.status !== "live") {
        const nowIso = new Date().toISOString();
        const autoCompleteIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        setCollabSession(s => (s ? { ...s, status: "live" } : s));
        pushToSupabase(compData, gymnasts, undefined, "live", { started_at: nowIso, auto_complete_at: autoCompleteIso });
      }
      return;
    }
    // Paywall gate — only on fresh start (not resume of already-live comp)
    if (eventStatus !== "live" && !subscriptionStatus?.isActive && !subscriptionStatus?.isPastDue) {
      setShowPlanPicker(true);
      return;
    }
    setPhase(2); setStep(1);
    if (currentEventId) {
      events.update(currentEventId, { status: "live" });
    }
    const now = new Date().toISOString();
    const autoComplete = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const lifecycleFields = { started_at: now, auto_complete_at: autoComplete };
    console.log("[start-comp] update payload:", { status: "live", ...lifecycleFields });
    pushToSupabase(compData, gymnasts, undefined, "live", lifecycleFields).then(
      () => console.log("[start-comp] pushToSupabase completed"),
      (err) => console.error("[start-comp] pushToSupabase error:", err)
    );
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
  const handleEditSetup = () => {
    setSetupSnapshot({ compData: structuredClone(compData), gymnasts: structuredClone(gymnasts) });
    setDraftCompData(structuredClone(compData));
    setDraftGymnasts(structuredClone(gymnasts));
    setPhase(1); setStep(1);
  };
  const handleManageGymnasts = () => {
    // If not already in setup (coming from dashboard), init draft buffer
    if (phase !== 1) {
      setSetupSnapshot({ compData: structuredClone(compData), gymnasts: structuredClone(gymnasts) });
      setDraftCompData(structuredClone(compData));
      setDraftGymnasts(structuredClone(gymnasts));
    }
    setPhase("gymnasts");
  };
  const handleManageRoundsGroups = () => {
    setPhase("rounds-groups");
  };
  const handleGoToDashboard = () => {
    if (inSetupMode && isDirty) {
      discardCallbackRef.current = () => {
        clearDraft();
        setPhase("dashboard"); setStep(1);
      };
      setShowDiscardModal(true);
      return;
    }
    clearDraft();
    setPhase("dashboard"); setStep(1);
  };

  // Scroll .app-main to top on phase/screen transitions
  const appMainRef = useRef(null);
  useEffect(() => {
    if (appMainRef.current) appMainRef.current.scrollTop = 0;
  }, [phase, step, screen]);

  // Track which setup section is in view (Phase 1 scroll-spy)
  const [activeSection, setActiveSection] = useState("");
  useEffect(() => {
    if (screen !== "active" || phase !== 1) { setActiveSection(""); return; }
    const ids = ["setup-basic","setup-config","setup-levels","setup-apparatus","setup-ages"];
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

  // Track which dashboard section is in view (dashboard scroll-spy)
  useEffect(() => {
    if (screen !== "active" || phase !== "dashboard") return;
    const ids = ["card-overview","card-clubs","card-rounds-groups","card-gymnasts","card-judges","card-documents","card-readiness"];
    const root = appMainRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) setActiveSection(visible[0].target.id);
    }, { root, rootMargin: "-10% 0px -60% 0px", threshold: 0 });
    const t = setTimeout(() => {
      ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    }, 100);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [screen, phase]);

  // Warn before browser close/refresh with unsaved setup changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ---- Resume competition (PIN-only path for judges / collaborators / no-account users) ----
  const handleResume = async (id, savedData, role, apparatus, rowMeta) => {
    setCompId(id);
    const rawPin = savedData.pin || null;
    setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
    if (role === "collaborator") {
      // Collaborators do organiser-level work — run the same migrations an
      // organiser open would, and mirror its consent handling.
      const cd = structuredClone(savedData.compData || {});
      const rowStatus = rowMeta?.status || "active";
      setCompDataRaw(migrateCompData({ ...cd, dataConsentConfirmed: rowStatus !== "draft" ? true : !!cd.dataConsentConfirmed }));
      setGymnasts(migrateGymnasts(structuredClone(savedData.gymnasts || [])));
      let ownerSub = null;
      if (rowMeta?.ownerId) {
        try {
          const { data: ownerProfile } = await supabase.from("profiles").select("*").eq("id", rowMeta.ownerId).maybeSingle();
          if (ownerProfile) ownerSub = getSubscriptionStatus(ownerProfile);
        } catch (e) {
          console.warn("[collab] owner profile fetch failed:", e.message);
        }
      }
      setCollabSession({
        authHash: savedData.compData?.collabPin || null,
        status: rowStatus,
        ownerId: rowMeta?.ownerId || null,
        ownerSub,
        pinFields: {
          scoreEditPin: savedData.compData?.scoreEditPin || null,
          scoreLockEnabled: !!savedData.compData?.scoreLockEnabled,
        },
      });
    } else {
      setCompDataRaw(savedData.compData || {});
      setGymnasts(savedData.gymnasts || []);
      setCollabSession(null);
    }
    // Set PIN role state
    setPinRole(role || null);
    setLockedApparatus(apparatus || null);
    // Scores exclusively from table
    const { data: tableRows } = await supabase.from("scores").select("*").eq("comp_id", id);
    if (tableRows && tableRows.length > 0) {
      rememberRowIds(tableRows);
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
    // Judges land directly on scoring view; collaborators get the full dashboard
    if (role === "collaborator") { setPhase("dashboard"); setStep(1); }
    else { setPhase(2); setStep(1); }
    setSyncStatus("saved");
    setCurrentEventId(null);
    setScreen("active");
  };

  // ---- Collaborator session exit + live revocation ----
  const exitCollabSession = useCallback((message) => {
    // A forced exit (revocation) cannot be cancelled, but the collaborator is
    // still told what was lost.
    const lost = Object.keys(unsavedScoresRef.current).length;
    setUnsavedScores({});
    setPinRole(null);
    setLockedApparatus(null);
    setCollabSession(null);
    if (message) setCollabNotice(lost > 0 ? `${message} ${lost} score${lost !== 1 ? "s" : ""} entered on this device had not been saved and ${lost !== 1 ? "were" : "was"} lost.` : message);
    setScreen("auth-login");
  }, []);

  // Clearing the collaborator PIN on the competition revokes any shared
  // session: re-check the server-held PIN every 30s and on tab focus, and
  // refresh the protected score-lock fields + row status while we're there.
  useEffect(() => {
    if (!isCollaborator || !compId || inSandbox) return;
    let cancelled = false;
    const check = async () => {
      try {
        const { data } = await supabase.from("competitions").select("*").eq("id", compId).maybeSingle();
        if (cancelled || !data) return;
        const cd = data.data?.compData || {};
        if ((cd.collabPin || null) !== (collabSession?.authHash || null) || !cd.collabPin) {
          exitCollabSession("Shared collaborator access to this competition has been revoked by the organiser.");
          return;
        }
        setCollabSession(s => {
          if (!s) return s;
          const nextStatus = data.status || s.status;
          const nextPinFields = { scoreEditPin: cd.scoreEditPin || null, scoreLockEnabled: !!cd.scoreLockEnabled };
          if (s.status === nextStatus &&
              s.pinFields?.scoreEditPin === nextPinFields.scoreEditPin &&
              s.pinFields?.scoreLockEnabled === nextPinFields.scoreLockEnabled) return s;
          return { ...s, status: nextStatus, pinFields: nextPinFields };
        });
      } catch {}
    };
    const iv = setInterval(check, 30000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [isCollaborator, compId, inSandbox, collabSession?.authHash, exitCollabSession]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---- Result exports ----
  // The builders are untouched: a single-round export pre-filters the data
  // passed in — gymnasts by g.round, scores by their roundId__ key prefix,
  // compData.rounds to the one round — and suffixes the round name so both
  // the document title and filename identify the round. "all" passes
  // everything through exactly as before.
  const runExport = (type, roundId) => {
    let cd = compData, g = gymnasts, sc = scores;
    let pdfName = "gymcomp-results.pdf";
    if (roundId && roundId !== "all") {
      const round = (compData.rounds || []).find(r => r.id === roundId);
      if (round) {
        cd = { ...compData, rounds: [round], name: `${compData.name || "Competition"} — ${round.name}` };
        g = gymnasts.filter(x => x.round === roundId);
        sc = {};
        for (const [k, v] of Object.entries(scores)) {
          if (k.startsWith(roundId + "__")) sc[k] = v;
        }
        const slug = (round.name || "round").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "round";
        pdfName = `gymcomp-results-${slug}.pdf`;
      }
    }
    if (type === "xlsx") {
      exportResultsXLSX(cd, g, sc);
    } else {
      const brandBg = compData.brandColor || "#000dff";
      const brandText = getContrastTextColor(brandBg);
      printDocument(buildResultsHTML(cd, g, sc), pdfName, { skipBaseCss: true, footerOpts: { brandBg, brandText } });
    }
  };

  // Single-round comps skip the chooser and export immediately (current behaviour).
  const requestExport = (type) => {
    if ((compData.rounds || []).length <= 1) { runExport(type, "all"); return; }
    setExportRoundSel("all");
    setExportPicker({ type });
  };

  const handleExportXLSX = () => requestExport("xlsx");
  const handleExportPDF = () => requestExport("pdf");

  const phase2Steps = [
    { label: "Score Input", done: Object.keys(scores).length > 0 },
    { label: "Results", done: false },
    { label: "Exports & Docs", done: false },
    { label: "MC Mode", done: false },
  ];

  const syncDot = { idle:null, saving:"🟡", saved:"🟢", error:"🔴", pending:"🟠", sandbox:"⚪" }[syncStatus];
  const syncLabel = { idle:"", saving:"Saving…", saved:"Saved ✓", error:"Sync error", pending:`${pendingSyncCount} pending`, sandbox:"Preview mode" }[syncStatus];

  // Collaborator notices (blocked start, revoked access) — also shown over the
  // auth screen, where a revoked session lands.
  const collabNoticeModal = collabNotice ? (
    <div className="modal-backdrop" onClick={() => setCollabNotice(null)}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, fontFamily: "var(--font-display)" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginBottom: 20 }}>{collabNotice}</div>
        <button className="btn btn-primary" onClick={() => setCollabNotice(null)} style={{ width: "100%", justifyContent: "center" }}>OK</button>
      </div>
    </div>
  ) : null;

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
  if (window.location.pathname === "/dpa") {
    return (
      <>
        <style>{css}</style>
        <DataProcessingAgreementScreen />
      </>
    );
  }

  // ---- PAYMENT SUCCESS — Stripe redirect ----
  if (window.location.pathname === "/payment-success") {
    return (
      <>
        <style>{css}</style>
        <PaymentSuccessScreen onContinue={() => {
          window.history.replaceState({}, "", "/");
          // Re-fetch profile to pick up new subscription status
          if (currentUser) loadUserProfile(currentUser);
          setScreen("org-dashboard");
        }} />
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
        {collabNoticeModal}
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
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout}
            isAdmin={currentProfile?.is_admin} onAdmin={() => setScreen("admin")}
            subscriptionStatus={subscriptionStatus} onManageSubscription={handleManageSubscription} />
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
              subscriptionStatus={subscriptionStatus}
              onSubscribe={() => handleSubscribe()}
              onManageSubscription={handleManageSubscription}
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
        <PlanPickerModal
          isOpen={showPlanPicker}
          onClose={() => setShowPlanPicker(false)}
          onPlanSelected={handlePlanSelected}
        />
      </>
    );
  }

  // ---- ADMIN DASHBOARD ----
  if (screen === "admin") {
    return (
      <>
        <style>{css}</style>
        <div className="app-shell">
          <AppSidebar screen="admin" phase={null} step={null} setStep={null}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection=""
            onNew={handleNew} onMyEvents={() => setScreen("org-dashboard")} onEditSetup={null} onManageGymnasts={null}
            onStartComp={null} onDashboard={null}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout}
            isAdmin={currentProfile?.is_admin} onAdmin={() => setScreen("admin")}
            subscriptionStatus={subscriptionStatus} onManageSubscription={handleManageSubscription} />
          <div className="app-main">
            <ErrorBoundary label="admin dashboard">
            <AdminDashboard onBack={() => setScreen("org-dashboard")} />
            </ErrorBoundary>
          </div>
        </div>
        <MobileLogoHeader onGoHome={() => setScreen("org-dashboard")} />
        {showAccountSettings && (
          <AccountSettingsModal
            account={currentAccount}
            profile={currentProfile}
            onSave={handleAccountSave}
            onLogout={handleLogout}
            onClose={() => setShowAccountSettings(false)}
          />
        )}
        <PlanPickerModal
          isOpen={showPlanPicker}
          onClose={() => setShowPlanPicker(false)}
          onPlanSelected={handlePlanSelected}
        />
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
      {/* Persistent shared-access indicator — names the comp and the fact this
          is collaborator access, on every collaborator screen */}
      {isCollaborator && (
        <div style={{
          position: "sticky", top: 0, zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10, padding: "8px 16px", flexWrap: "wrap",
          background: "var(--brand-01)", color: "var(--text-alternate)",
          fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M12 9.5c1.5.3 2.5 1.5 2.5 3"/></svg>
          <span>Shared collaborator access — <strong>{compData.name || "Competition"}</strong></span>
          <button onClick={() => exitCollabSession()} style={{
            background: "none", border: "1px solid var(--text-alternate)", borderRadius: 48,
            padding: "3px 12px", color: "var(--text-alternate)", fontFamily: "var(--font-display)",
            fontSize: 11, fontWeight: 600, cursor: "pointer"
          }}>Exit</button>
        </div>
      )}

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
          {sessionEntersScores
            // Scores go straight to the scores table — there is no local
            // store and no queue, so never promise one.
            ? "You're offline — scores cannot be saved while offline. Anything entered now is not stored and will be lost if this page reloads."
            : "You're offline — setup changes are saved locally and will sync when reconnected"}
          {sessionEntersScores && unsavedCount > 0 && <span style={{ background: "var(--danger)", borderRadius: 48, padding: "2px 10px", fontSize: 11, whiteSpace: "nowrap" }}>{unsavedCount} score{unsavedCount !== 1 ? "s" : ""} not saved</span>}
          {!sessionEntersScores && pendingSyncCount > 0 && <span style={{ background: "rgba(0,0,0,0.2)", borderRadius: 48, padding: "2px 10px", fontSize: 11 }}>{pendingSyncCount} pending</span>}
        </div>
      )}

      {/* Unsaved scores — prominent, persistent until every one saves or the
          judge knowingly discards. Shown online too: a write can fail on a
          timeout or server error with the connection nominally up. */}
      {unsavedCount > 0 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
          padding: "8px 16px", background: "var(--danger)", color: "var(--text-alternate)", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
        }}>
          <span>{unsavedCount} score{unsavedCount !== 1 ? "s" : ""} not saved to the database — {isOnline ? "each is marked in the score table" : "they will be lost if this page reloads"}</span>
          <button onClick={retryUnsavedScores} disabled={!isOnline}
            style={{ background: "rgba(255,255,255,0.25)", border: "none", borderRadius: 48, padding: "3px 12px", color: "var(--text-alternate)", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600, cursor: isOnline ? "pointer" : "default", opacity: isOnline ? 1 : 0.5 }}>
            {isOnline ? "Retry now" : "Retry when online"}
          </button>
        </div>
      )}

      {/* Notices: an unsaved score overwritten by another device's saved value */}
      {scoreNotices.length > 0 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100, display: "flex", flexDirection: "column", gap: 4,
          padding: "8px 16px", background: "var(--warn)", color: "var(--text-alternate)", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600
        }}>
          {scoreNotices.map((n, i) => <div key={i}>{n}</div>)}
          <button onClick={() => setScoreNotices([])}
            style={{ alignSelf: "center", background: "rgba(255,255,255,0.25)", border: "none", borderRadius: 48, padding: "3px 12px", color: "var(--text-alternate)", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            Dismiss
          </button>
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

      {/* Nav bar — hidden during setup, dashboard, gymnast management, and phase 2 for ALL users.
          Collaborators count as organiser UI here: the shared-access banner replaces the nav. */}
      {phase !== 2 && !(canOrganise && (phase === 1 || phase === "dashboard" || phase === "gymnasts" || phase === "rounds-groups")) && (
        <nav className="nav">
          {!currentAccount && (
            <div className="nav-logo" style={{ cursor: "pointer" }} onClick={() => { setPinRole(null); setLockedApparatus(null); setScreen("auth-login"); }}>GYMCOMP<span>.</span></div>
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
            {phase === 2 && pinRole !== "judge" && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={handleExportXLSX}>
                  Export XLSX
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportPDF}>
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
          onManageRoundsGroups={handleManageRoundsGroups}
          onUpdateCompData={setCompData}
          onUpdateGymnasts={setGymnastsWithSync}
          canManagePins={!isCollaborator}
          onSetPin={isCollaborator ? undefined : () => {
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
          <Step1_CompDetails data={draftCompData || compData} setData={draftCompData !== null ? setDraftCompDataLocal : setCompDataLocal} syncStatus={syncStatus} onSave={handleSaveSetup} isExisting={!!((currentEventId || isCollaborator) && eventStatus !== "draft")} eventStatus={eventStatus} compId={compId} currentUser={currentUser} scores={scores} restrictPins={isCollaborator}
            gymnasts={draftGymnasts || gymnasts} setGymnasts={draftGymnasts !== null ? setDraftGymnastsLocal : setGymnastsWithSync}
            onSaveExit={async () => {
              // Partial save — commit draft, persist and go back
              const { compData: cd, gymnasts: g } = commitDraft();
              if (syncTimer.current) clearTimeout(syncTimer.current);
              if (currentEventId) snapshotWithPin(currentEventId, cd, g);
              await pushToSupabase(cd, g);
              setScreen("org-dashboard");
            }}
            onNext={async () => {
              // Full save — commit draft, all mandatory fields complete
              const { compData: cd, gymnasts: g } = commitDraft();
              if (syncTimer.current) clearTimeout(syncTimer.current);
              const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
              const isDraft = ev && ev.status === "draft";
              if (currentEventId) {
                snapshotWithPin(currentEventId, cd, g);
                if (isDraft) events.update(currentEventId, { status: "active" });
              }
              await pushToSupabase(cd, g, undefined, isDraft ? "active" : undefined);
              if (!compPin && !isCollaborator) {
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
          <Step2_Gymnasts compData={draftCompData || compData} setCompDataFn={draftCompData !== null ? setDraftCompDataLocal : setCompData} data={draftGymnasts || gymnasts} setData={draftGymnasts !== null ? setDraftGymnastsLocal : setGymnastsWithSync} scores={scores}
            onNext={() => {
              const { compData: cd, gymnasts: g } = commitDraft();
              if (syncTimer.current) clearTimeout(syncTimer.current);
              pushToSupabase(cd, g);
              if (currentEventId) snapshotWithPin(currentEventId, cd, g);
              setPhase("dashboard");
            }}
            onBack={() => {
              const { compData: cd, gymnasts: g } = commitDraft();
              if (syncTimer.current) clearTimeout(syncTimer.current);
              pushToSupabase(cd, g);
              if (currentEventId) snapshotWithPin(currentEventId, cd, g);
              setPhase("dashboard");
            }} />
        </div>
        </ErrorBoundary>
      )}

      {/* ROUNDS & GROUPS MANAGEMENT */}
      {phase === "rounds-groups" && (
        <ErrorBoundary label="rounds & groups">
        <div style={{ flex: 1 }}>
          <RoundsGroupsPage
            compData={compData}
            gymnasts={gymnasts}
            setCompData={setCompData}
            setGymnasts={setGymnastsWithSync}
            scores={scores}
            eventStatus={eventStatus}
            onBack={(nextGymnasts) => {
              // Save may hand us a list with freshly assigned numbers — the state
              // update hasn't committed yet, so push that rather than the stale
              // closure value.
              const g = Array.isArray(nextGymnasts) ? nextGymnasts : gymnasts;
              if (syncTimer.current) clearTimeout(syncTimer.current);
              pushToSupabase(compData, g);
              if (currentEventId) snapshotWithPin(currentEventId, compData, g);
              setPhase("dashboard");
            }}
          />
        </div>
        </ErrorBoundary>
      )}

      {/* COMPETITION phase 2 — no old sidebar, just content */}
      {phase === 2 && (step === 1 ? (
        <ErrorBoundary label="score input">
        <div style={{ flex: 1 }}>
          <Phase2_Step1 compData={compData} gymnasts={gymnasts} scores={scores} setScores={setScoresWithSync} setStep={setStep}
            onSharePublic={handleSharePublic} onShareCoach={handleShareCoach}
            isOnline={isOnline} pendingSyncCount={pendingSyncCount} syncStatus={syncStatus} onRetrySync={flushSyncQueue}
            onScoreCommit={pushScoreToTable} onScoreDelete={deleteScoreFromTable} newScoreKeys={newScoreKeys}
            setGymnasts={canOrganise ? setGymnastsWithSync : undefined}
            onMoveScoreCleanup={canOrganise ? clearRoundScoresForGymnast : undefined}
            pinRole={pinRole} lockedApparatus={lockedApparatus}
            activeRound={!canOrganise ? effectiveActiveRound : undefined}
            setActiveRound={!canOrganise ? setActiveRound : undefined}
            unsavedScores={unsavedScores} onRetryUnsaved={retryUnsavedScores}
            onExit={!canOrganise ? () => guardUnsavedScores(() => { setPinRole(null); setLockedApparatus(null); setScreen("auth-login"); }, "exit") : undefined} />
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
          {step === 3 && <Phase2_Exports compData={compData} gymnasts={gymnasts} scores={scores} onSharePublic={handleSharePublic} onShareCoach={handleShareCoach} onExportXLSX={handleExportXLSX} onExportPDF={handleExportPDF} />}
          {step === 4 && <MCMode compData={compData} gymnasts={gymnasts} scores={scores} />}
        </main>
        </ErrorBoundary>
      ))}
    </>
  );

  return (
    <>
      <style>{css}</style>
      {canOrganise ? (
        <div className="app-shell">
          <AppSidebar screen="active" phase={phase} step={step} setStep={setStep}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection={activeSection}
            collabMode={isCollaborator} compName={compData.name}
            onNew={isCollaborator ? undefined : handleNew}
            onMyEvents={isCollaborator ? handleGoToDashboard : goBackToDashboard}
            onEditSetup={handleEditSetup}
            onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
            onDashboard={handleGoToDashboard}
            onSettings={isCollaborator ? undefined : () => setShowAccountSettings(true)}
            onLogout={isCollaborator ? undefined : handleLogout}
            onExit={isCollaborator ? () => guardUnsavedScores(() => exitCollabSession(), "exit") : undefined}
            gymnastsCount={gymnasts.length}
            judgesCount={(compData.judges || []).length}
            eventStatus={eventStatus}
            allGymnastsComplete={allGymnastsComplete}
            subscriptionStatus={isCollaborator ? null : subscriptionStatus}
            onManageSubscription={isCollaborator ? undefined : handleManageSubscription} />
          <div className="app-main" ref={appMainRef}>
            {activeContent}
          </div>
        </div>
      ) : phase === 2 ? (
        /* Judge/scorekeeper PIN mode — sidebar with rounds + apparatus identity */
        <div className="app-shell">
          <AppSidebar
            screen="pin-judge"
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(c => !c)}
            pinRole={pinRole}
            lockedApparatus={lockedApparatus}
            rounds={compData.rounds || []}
            activeRound={effectiveActiveRound}
            setActiveRound={setActiveRound}
            onExportXLSX={handleExportXLSX}
            onExportPDF={handleExportPDF}
            onExit={() => { setPinRole(null); setLockedApparatus(null); setScreen("auth-login"); }}
          />
          <div className="app-main" ref={appMainRef}>
            {activeContent}
          </div>
        </div>
      ) : (
        /* Other non-account screens */
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

      {/* Collaborator mobile nav — phase 2 step tabs only (no account actions) */}
      {isCollaborator && phase === 2 && (
        <MobileTabBar screen="active" phase={2} step={step} setStep={setStep} />
      )}

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

      {discardScoresPrompt && (
        <ConfirmModal
          icon="⚠️"
          isDanger={true}
          message={
            <span style={{ fontFamily: "var(--font-display)" }}>
              {discardScoresPrompt.lines.length} score{discardScoresPrompt.lines.length !== 1 ? "s" : ""} on this device {discardScoresPrompt.lines.length !== 1 ? "have" : "has"} not been saved to the database.
              If you {discardScoresPrompt.actionLabel} now {discardScoresPrompt.lines.length !== 1 ? "they" : "it"} will be lost and must be re-entered.
              <span style={{ display: "block", marginTop: 12, textAlign: "left", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                {discardScoresPrompt.lines.map((l, i) => <span key={i} style={{ display: "block" }}>• {l}</span>)}
              </span>
            </span>
          }
          confirmLabel="Discard and continue"
          cancelLabel="Go back"
          onConfirm={() => { const p = discardScoresPrompt; setDiscardScoresPrompt(null); setUnsavedScores({}); p.proceed(); }}
          onCancel={() => setDiscardScoresPrompt(null)}
        />
      )}

      {showDiscardModal && (
        <ConfirmModal
          icon="⚠️"
          isDanger={true}
          message="You have unsaved changes to this competition setup. Leaving now will discard all changes made since your last save."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={() => { setShowDiscardModal(false); if (discardCallbackRef.current) discardCallbackRef.current(); }}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}

      {/* Export round chooser — mirrors ConfirmModal's layout */}
      {exportPicker && (
        <div className="modal-backdrop" onClick={() => setExportPicker(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, fontFamily: "var(--font-display)" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{exportPicker.type === "xlsx" ? "📊" : "📄"}</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, fontFamily: "var(--font-display)" }}>
              Export Results — {exportPicker.type === "xlsx" ? "Spreadsheet" : "PDF"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6, fontFamily: "var(--font-display)" }}>
              Choose which round to export.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {[{ id: "all", name: "All Rounds" }, ...(compData.rounds || [])].map(r => {
                const active = exportRoundSel === r.id;
                return (
                  <button key={r.id} onClick={() => setExportRoundSel(r.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      borderRadius: "var(--radius)", cursor: "pointer", textAlign: "left",
                      background: active ? "rgba(0,13,255,0.04)" : "var(--surface)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      color: active ? "var(--accent)" : "var(--text)",
                      fontFamily: "var(--font-display)", fontSize: 13, fontWeight: active ? 600 : 500,
                      transition: "all 0.15s",
                    }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                      border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      background: active ? "var(--accent)" : "transparent",
                      boxShadow: active ? "inset 0 0 0 3px var(--surface)" : "none",
                    }} />
                    {r.name}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary"
                onClick={() => { const p = exportPicker; setExportPicker(null); runExport(p.type, exportRoundSel); }}>
                {exportPicker.type === "xlsx" ? "Export Spreadsheet" : "Export PDF"}
              </button>
              <button className="btn btn-secondary" onClick={() => setExportPicker(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPinModal && (
        <PinSetupModal onSet={handlePinSet} />
      )}

      <PlanPickerModal
        isOpen={showPlanPicker}
        onClose={() => setShowPlanPicker(false)}
        onPlanSelected={handlePlanSelected}
      />

      {collabNoticeModal}

    </>
  );
}
