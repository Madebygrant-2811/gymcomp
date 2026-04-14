import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { generateId } from "../../lib/utils.js";
import { statusMeta } from "../../lib/constants.js";
import { events } from "../../lib/storage.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";

// ============================================================
// ORGANISER DASHBOARD — list of events for logged-in account
// ============================================================
function OrganizerDashboard({ account, onNew, onOpen, onView, onEdit, onDuplicate, statusFilter, setStatusFilter, onFilterCountsChange }) {
  const [myEvents, setMyEvents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [sortBy, setSortBy] = useState("recent");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Guard: track recently-patched comp IDs so syncFromSupabase won't overwrite them before the PATCH lands
  const recentPatches = useRef({});

  const pushStatusToSupabase = async (cid, newStatus) => {
    recentPatches.current[cid] = { status: newStatus, ts: Date.now() };
    try {
      const { error } = await supabase.from("competitions").update({ status: newStatus }).eq("id", cid);
      if (error) console.error("[pushStatusToSupabase] failed:", error.message);
    } catch (e) { console.error("[pushStatusToSupabase] error:", e.message); }
  };

  const reload = () => {
    const all = events.getForAccount(account.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    setMyEvents(all);
    if (onFilterCountsChange) {
      onFilterCountsChange({
        draft: all.filter(e => e.status === "draft").length,
        active: all.filter(e => e.status === "active").length,
        live: all.filter(e => e.status === "live").length,
        completed: all.filter(e => e.status === "completed").length,
        archived: all.filter(e => e.status === "archived").length,
      });
    }
  };

  const syncFromSupabase = useCallback(() => {
    reload();
    // Clean up expired patch guards (>10s old)
    const now = Date.now();
    Object.keys(recentPatches.current).forEach(k => { if (now - recentPatches.current[k].ts > 10000) delete recentPatches.current[k]; });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("competitions").select("id, data, status, created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).then(({ data: supabaseComps, error }) => {
        if (error) return;
        const all = events.getAll();
        let changed = false;
        const ownedCompIds = new Set((supabaseComps || []).map(c => c.id));
        // Only remove events that have been synced before — keep unsaved drafts
        const toRemove = all.filter(e => e.accountId === account.id && e.compId && !ownedCompIds.has(e.compId) && e.status !== "draft");
        if (toRemove.length > 0) {
          toRemove.forEach(e => { const idx = all.indexOf(e); if (idx !== -1) all.splice(idx, 1); });
          changed = true;
        }
        (supabaseComps || []).forEach(comp => {
          const existing = all.find(e => e.compId === comp.id && e.accountId === account.id);
          const snapshot = comp.data
            ? { compData: comp.data.compData, gymnasts: comp.data.gymnasts }
            : undefined;
          const supaStatus = comp.status || "active";
          if (!existing) {
            all.push({ id: generateId(), accountId: account.id, compId: comp.id, status: supaStatus, createdAt: comp.created_at, updatedAt: comp.created_at, snapshot });
            changed = true;
          } else {
            // If this comp was recently patched locally, trust local status over stale Supabase data
            const patch = recentPatches.current[comp.id];
            const useLocalStatus = patch && (Date.now() - patch.ts < 5000);
            const effectiveStatus = useLocalStatus ? patch.status : supaStatus;
            const needsUpdate = snapshot || existing.status !== effectiveStatus;
            if (needsUpdate) {
              const idx = all.indexOf(existing);
              all[idx] = { ...existing, ...(snapshot ? { snapshot } : {}), status: effectiveStatus };
              changed = true;
            }
          }
        });
        // Strip snapshots from archived events to save localStorage space
        // (data is always available from Supabase on re-open)
        all.forEach((e, i) => {
          if (e.snapshot && e.status === "archived") {
            all[i] = { ...e }; delete all[i].snapshot;
            changed = true;
          }
        });
        if (changed) { events.save(all); reload(); }
      });
    });
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync on mount
  useEffect(() => { syncFromSupabase(); }, [syncFromSupabase]);

  // Re-sync when tab regains focus (cross-device changes)
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "visible") syncFromSupabase(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncFromSupabase]);

  // Reset select mode when leaving archived filter
  useEffect(() => {
    if (statusFilter !== "archived") {
      setSelectMode(false);
      setSelected(new Set());
    }
  }, [statusFilter]);

  const handleStatusChange = (eventId, newStatus) => {
    events.update(eventId, { status: newStatus });
    const ev = events.getAll().find(e => e.id === eventId);
    if (ev?.compId) pushStatusToSupabase(ev.compId, newStatus);
    reload();
  };

  const handleDelete = (ev) => {
    if (ev.status !== "archived") {
      setArchiveConfirm(ev);
      return;
    }
    setDeleteConfirm(ev);
  };

  const confirmDelete = async () => {
    const ev = deleteConfirm;
    setDeleteConfirm(null);
    if (ev.compId) {
      const { error } = await supabase.from("competitions").delete().eq("id", ev.compId);
      if (error) console.error("[confirmDelete] Supabase DELETE failed:", error.message);
    }
    events.remove(ev.id);
    reload();
  };

  const confirmBulkDelete = async () => {
    for (const id of selected) {
      const ev = myEvents.find(e => e.id === id);
      if (ev?.compId) {
        await supabase.from("competitions").delete().eq("id", ev.compId);
      }
      events.remove(id);
    }
    setSelected(new Set());
    setSelectMode(false);
    setBulkDeleteConfirm(false);
    reload();
  };

  const getPublicLink = (ev) => `${window.location.origin}/results.html?comp=${ev.compId}`;

  const copyLink = async (ev) => {
    const link = getPublicLink(ev);
    try { await navigator.clipboard.writeText(link); } catch {}
    setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: true } : e));
    setTimeout(() => setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: false } : e)), 1800);
  };

  const sortEvents = (list) => {
    if (sortBy === "date") {
      return [...list].sort((a, b) => {
        const da = a.snapshot?.compData?.date || "";
        const db = b.snapshot?.compData?.date || "";
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? -1 : da > db ? 1 : 0;
      });
    }
    return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  };

  const filtered = statusFilter === "all"
    ? myEvents.filter(e => e.status !== "archived")
    : myEvents.filter(e => e.status === statusFilter);
  const currentEvents = sortEvents(filtered.filter(e => e.status === "draft" || e.status === "active" || e.status === "live"));
  const completedEvents = sortEvents(filtered.filter(e => e.status === "completed"));

  const firstName = (account.name || account.email?.split("@")[0] || "").split(" ")[0];

  // Left border + dot colours per status
  const statusConfig = {
    draft:     { border: "#f59e0b", dot: "#f59e0b" },
    active:    { border: "var(--brand-01)", dot: "var(--brand-01)" },
    live:      { border: "#22c55e", dot: "#22c55e" },
    completed: { border: "#15803d", dot: "#15803d" },
    archived:  { border: "#acacac", dot: "#acacac" },
  };

  const sidebarFilters = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "live", label: "Live" },
    { value: "completed", label: "Complete" },
    { value: "archived", label: "Archived" },
  ];

  const countFor = (status) => myEvents.filter(e => e.status === status).length;

  const renderCard = (ev) => {
    const cd = ev.snapshot?.compData || {};
    const sc = statusConfig[ev.status] || statusConfig.draft;
    const gymnasts = ev.snapshot?.gymnasts || [];
    const clubs = cd.clubs || [];
    const isCompleted = ev.status === "completed" || ev.status === "archived";

    const isArchived = ev.status === "archived";
    const isDraft = ev.status === "draft";
    const isSelectable = selectMode && isArchived;
    const isSelected = isSelectable && selected.has(ev.id);

    const toggleSelect = () => {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(ev.id)) next.delete(ev.id);
        else next.add(ev.id);
        return next;
      });
    };

    return (
      <div key={ev.id} className="od-card-wrap">
        <div
          className={`od-card${isDraft ? " od-card-draft" : ""}${isSelected ? " od-card-selected" : ""}`}
          style={{ borderLeftColor: isSelected ? "var(--brand-01)" : sc.border, position: "relative", cursor: isSelectable ? "pointer" : undefined }}
          onClick={isSelectable ? toggleSelect : undefined}
        >
          {/* Delete button — top right (hidden for archived since CTA handles it) */}
          {!isArchived && (
            <button onClick={() => handleDelete(ev)}
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-display)", padding: "4px 8px" }}>
              Archive
            </button>
          )}
          <div className="od-card-top">
            {/* Selection checkbox — sits above the status pill */}
            {isSelectable && (
              <div className="od-select-check" style={{ background: isSelected ? "var(--brand-01)" : "transparent", borderColor: isSelected ? "var(--brand-01)" : "var(--text-tertiary)" }}>
                {isSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            )}
            <div className="od-card-status-pill">
              <span className="od-card-status-dot" style={{ background: sc.dot }} />
              <span style={{ fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {statusMeta(ev.status).label}
              </span>
            </div>
            {isDraft && (
              <div className="od-card-draft-banner">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 10.5h.01"/></svg>
                Setup incomplete — finish setting up your competition to get started
              </div>
            )}
            <div style={isDraft ? { opacity: 0.45 } : undefined}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="od-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {cd.name || "Untitled Competition"}
                  {cd.scoringMode === "nga" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--brand-03)", color: "var(--brand-01)", whiteSpace: "nowrap" }}>NGA</span>
                  )}
                </div>
                <div className="od-card-meta">
                  {cd.date && (
                    <div className="od-card-meta-row">
                      <span className="od-card-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>
                      </span>
                      {new Date(cd.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                  {cd.location && (
                    <div className="od-card-meta-row">
                      <span className="od-card-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="7" r="2"/><path d="M8 15S3 10 3 7a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
                      </span>
                      {cd.location}
                    </div>
                  )}
                  {!cd.date && !cd.location && isDraft && (
                    <div className="od-card-meta-row" style={{ fontStyle: "italic" }}>No details added yet</div>
                  )}
                </div>
              </div>
              <div className="od-card-divider" style={{ marginTop: 24 }} />
              <div style={{ marginTop: 24 }}>
                <div className="od-card-clubs-title">Clubs Details</div>
                <div className="od-card-clubs-row">
                  <div className="od-card-clubs-item">
                    <span className="od-card-clubs-badge" style={clubs.length === 0 ? { background: "#efefef", color: "var(--text-tertiary)" } : undefined}>{clubs.length}</span>
                    Clubs Registered
                  </div>
                  <div className="od-card-clubs-item">
                    <span className="od-card-clubs-badge" style={gymnasts.length === 0 ? { background: "#efefef", color: "var(--text-tertiary)" } : undefined}>{gymnasts.length}</span>
                    Gymnasts Registered
                  </div>
                </div>
              </div>
            </div>
          </div>
          {!isSelectable && (
            <div className="od-card-actions">
              {isDraft ? (
                <button className="od-card-btn-open" onClick={() => onOpen(ev)}
                  style={{ background: "#f59e0b" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                  Finish Setup
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              ) : (
                <button className={`od-card-btn-open`} onClick={() => isArchived ? handleDelete(ev) : onOpen(ev)}
                  style={isArchived ? { background: "#e53e3e" } : ev.status === "live" ? { background: "#22c55e" } : undefined}>
                  {ev.status === "live" && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>}
                  {{ active: "Open Comp", live: "Resume Comp", completed: "View Results", archived: "Delete Event" }[ev.status] || "Open Comp"}
                  {ev.status !== "live" && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(-90deg)" }}><path d="M4 6l4 4 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </button>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {ev.status === "live" && (
                  <button className="od-card-btn-open outlined" onClick={() => onView(ev)}
                    style={{ background: "none", border: "1.5px solid var(--border)", color: "var(--text-primary)" }}>
                    View Comp
                  </button>
                )}
                {ev.status === "active" && (
                  <button className="od-card-btn-icon" onClick={() => onEdit(ev)} title="Edit Comp">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                  </button>
                )}
                <button className="od-card-btn-icon" onClick={() => onDuplicate(ev)} title="Duplicate">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V3.5A.5.5 0 013.5 3H11"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .od-main{flex:1;display:flex;flex-direction:column;gap:22px;padding:40px;overflow-y:auto;min-width:0;}
        .od-header{display:flex;flex-direction:column;gap:8px;max-width:434px;}
        .od-greeting{font-size:38px;font-weight:600;color:var(--text-primary);line-height:1.2;}
        .od-subtitle{font-size:14px;color:var(--text-tertiary);line-height:1.4;}
        .od-content{display:flex;flex-direction:column;gap:30px;flex:1;min-height:0;}
        .od-filter-pill{display:inline-flex;align-items:center;justify-content:center;padding:4px 16px;border-radius:48px;background:var(--background-light);font-size:14px;color:var(--text-primary);font-family:var(--font-display);border:none;cursor:pointer;align-self:flex-start;}
        .od-cards-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;max-width:1200px;}
        .od-card-wrap{display:flex;}
        .od-card{flex:1;background:var(--background-light);border-radius:8px;overflow:hidden;padding:16px 18px;display:flex;flex-direction:column;justify-content:space-between;border-left:6px solid transparent;}
        .od-card-top{display:flex;flex-direction:column;gap:24px;}
        .od-card-status-pill{display:inline-flex;align-items:center;gap:8px;padding:4px 16px;border-radius:48px;background:var(--background-neutral);font-size:12px;color:var(--text-primary);font-family:var(--font-display);align-self:flex-start;}
        .od-card-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .od-card-title{font-size:20px;font-weight:600;color:var(--text-primary);line-height:1.2;max-height:48px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-overflow:ellipsis;}
        .od-card-meta{display:flex;flex-direction:column;gap:8px;}
        .od-card-meta-row{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary);font-family:var(--font-display);}
        .od-card-meta-icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);flex-shrink:0;}
        .od-card-divider{height:1px;background:#f5f5f5;}
        .od-card-clubs-title{font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.1;margin-bottom:8px;}
        .od-card-clubs-row{display:flex;flex-wrap:wrap;gap:16px;align-items:center;}
        .od-card-clubs-item{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary);font-family:var(--font-display);}
        .od-card-clubs-badge{min-width:18px;height:18px;padding:0 5px;border-radius:36px;background:var(--brand-01);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0;}
        .od-card-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:40px;}
        .od-card-btn-open{display:inline-flex;align-items:center;gap:6px;height:30px;padding:5px 11px;border-radius:80px;background:var(--brand-01);border:none;cursor:pointer;font-family:var(--font-display);font-size:12px;font-weight:600;color:white;letter-spacing:0.3px;}
        .od-card-btn-open:hover{opacity:0.9;}
        .od-card-btn-open.outlined{background:none;border:1.5px solid var(--brand-01);color:var(--brand-01);}
        .od-card-btn-open.outlined:hover{background:rgba(0,13,255,0.06);}
        .od-card-btn-icon{width:30px;height:30px;border-radius:80px;border:none;background:#efefef;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex-shrink:0;}
        .od-card-btn-icon:hover{background:var(--background-neutral);}
        .od-card-draft{background:var(--background-light);}
        .od-card-draft-banner{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);font-size:12px;color:#92600a;font-family:var(--font-display);line-height:1.4;}
        .od-card-btn-icon.danger{border:1px solid red;background:none;}
        .od-card-btn-icon.danger:hover{background:#fee;}
        .od-select-check{width:20px;height:20px;border-radius:50%;border:2px solid var(--text-tertiary);display:flex;align-items:center;justify-content:center;transition:background 0.15s,border-color 0.15s;align-self:flex-start;}
        .od-card-selected{background:rgba(0,13,255,0.03)!important;}
        .od-bulk-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:48px;border:1.5px solid var(--border);background:var(--background-light);font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);cursor:pointer;white-space:nowrap;}
        .od-bulk-btn:hover{background:#f0f0f0;}
        .od-bulk-btn-danger{background:#e53e3e;color:white;border-color:#e53e3e;}
        .od-bulk-btn-danger:hover{background:#c53030;}
        .od-empty-box{flex:1;min-height:322px;border:1px dashed #080808;background:#f2f2f2;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:16px 18px;}
        .od-empty-box-btn{padding:16px 32px;border-radius:56px;background:var(--brand-01);border:none;cursor:pointer;font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--text-alternate);}
        .od-empty-box-btn:hover{opacity:0.92;}
        .od-section-title{font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;}
        .od-empty-msg{text-align:center;padding:40px 24px;color:var(--text-tertiary);font-size:14px;width:100%;}
        .od-active-filter{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:48px;background:var(--background-light);color:var(--text-primary);font-family:var(--font-display);font-size:13px;font-weight:600;border:1px solid var(--border);cursor:pointer;align-self:flex-start;margin-bottom:-14px;}
        .od-active-filter:hover{background:#f5f5f5;}
        .od-active-filter-x{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.08);font-size:11px;line-height:1;}
        @media(max-width:768px){.od-active-filter{display:none;}}
        .od-mobile-filters{display:none;}
        @media(max-width:768px){
          .od-main{padding:24px 16px;}
          .od-cards-row{flex-direction:column;}
          .od-card-wrap{min-width:0;}
          .od-mobile-filters{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
          .od-mobile-filters::-webkit-scrollbar{display:none;}
          .od-mobile-filter{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:48px;border:1.5px solid var(--border);background:var(--background-light);font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-tertiary);cursor:pointer;white-space:nowrap;}
          .od-mobile-filter.active{background:var(--brand-01);color:white;border-color:var(--brand-01);}
          .od-mobile-filter .od-mf-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
          .od-mobile-filter .od-mf-count{font-size:11px;opacity:0.7;}
        }
      `}</style>
      <div className="od-main">
        <div className="od-header">
          <div className="od-greeting">{`Hello ${firstName}  👋`}</div>
          <div className="od-subtitle">
            This is your Organiser Vault - within here are all of your competitions - you can filter these on your toolbar into the different status of competitions you currently have.
          </div>
        </div>

        {/* Mobile filter pills — visible only ≤768px */}
        <div className="od-mobile-filters">
          {sidebarFilters.map(f => {
            const count = myEvents.filter(e => e.status === f.value).length;
            const isActive = statusFilter === f.value;
            const sc = statusConfig[f.value] || {};
            return (
              <button key={f.value} className={`od-mobile-filter${isActive ? " active" : ""}`}
                onClick={() => setStatusFilter(prev => prev === f.value ? "all" : f.value)}>
                <span className="od-mf-dot" style={{ background: isActive ? "white" : sc.dot }} />
                {f.label}
                {count > 0 && <span className="od-mf-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Cards area */}
        <div className="od-content">
          {/* Filter pill + sort toggle row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: myEvents.length > 0 ? -8 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {statusFilter !== "all" && (
                <button className="od-active-filter" style={{ marginBottom: 0 }} onClick={() => setStatusFilter("all")}>
                  {sidebarFilters.find(f => f.value === statusFilter)?.label || statusFilter}
                  <span className="od-active-filter-x">✕</span>
                </button>
              )}
              {statusFilter === "archived" && filtered.length > 0 && (
                <>
                  <button className="od-bulk-btn" onClick={() => { if (selectMode) { setSelectMode(false); setSelected(new Set()); } else { setSelectMode(true); } }}>
                    {selectMode ? "Cancel" : "Select"}
                  </button>
                  {selectMode && (
                    <>
                      <button className="od-bulk-btn" onClick={() => {
                        const archivedIds = filtered.map(e => e.id);
                        setSelected(prev => prev.size === archivedIds.length ? new Set() : new Set(archivedIds));
                      }}>
                        {selected.size === filtered.length ? "Deselect All" : "Select All"}
                      </button>
                      {selected.size > 0 && (
                        <button className="od-bulk-btn od-bulk-btn-danger" onClick={() => setBulkDeleteConfirm(true)}>
                          Delete ({selected.size})
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {myEvents.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-display)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M4 2v12M4 14l-2.5-3M4 14l2.5-3M12 14V2M12 2L9.5 5M12 2l2.5 3"/></svg>
                <button onClick={() => setSortBy("recent")} style={{
                  padding: "4px 10px", borderRadius: 48, border: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  background: sortBy === "recent" ? "var(--brand-01)" : "var(--background-light)",
                  color: sortBy === "recent" ? "white" : "var(--text-tertiary)"
                }}>Recent</button>
                <button onClick={() => setSortBy("date")} style={{
                  padding: "4px 10px", borderRadius: 48, border: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  background: sortBy === "date" ? "var(--brand-01)" : "var(--background-light)",
                  color: sortBy === "date" ? "white" : "var(--text-tertiary)"
                }}>Event Date</button>
              </div>
            )}
          </div>

          {/* Empty state — no events at all */}
          {myEvents.length === 0 ? (
            <div className="od-empty-box">
              <button className="od-empty-box-btn" onClick={onNew}>+ New Competition</button>
            </div>
          ) : statusFilter !== "all" && filtered.length === 0 ? (
            <div className="od-empty-msg">No {sidebarFilters.find(f => f.value === statusFilter)?.label?.toLowerCase() || statusFilter} competitions</div>
          ) : statusFilter !== "all" ? (
            /* Filtered view — flat list */
            <div className="od-cards-row">
              {sortEvents(filtered).map(ev => renderCard(ev))}
            </div>
          ) : (
            /* Default view — sectioned */
            <>
              {currentEvents.length > 0 ? (
                <div>
                  <div className="od-section-title">Current Events</div>
                  <div className="od-cards-row">
                    {currentEvents.map(ev => renderCard(ev))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="od-section-title">Current Events</div>
                  <div className="od-empty-box">
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                      <div style={{ fontSize: 14, color: "var(--text-tertiary)", fontFamily: "var(--font-display)", textAlign: "center", lineHeight: 1.5 }}>
                        No current competitions — create one to get started
                      </div>
                      <button className="od-empty-box-btn" onClick={onNew}>+ New Competition</button>
                    </div>
                  </div>
                </div>
              )}
              {completedEvents.length > 0 && (
                <div>
                  <div className="od-section-title">Completed Events</div>
                  <div className="od-cards-row">
                    {completedEvents.map(ev => renderCard(ev))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {archiveConfirm && (
        <ConfirmModal
          message={<>Are you sure you want to archive this event?<br/><span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>By archiving this event you can still access it within your Archive filter on your sidebar.</span></>}
          confirmLabel="Archive"
          isDanger={false}
          onConfirm={() => {
            events.update(archiveConfirm.id, { status: "archived" });
            const ev = events.getAll().find(e => e.id === archiveConfirm.id);
            if (ev?.compId) pushStatusToSupabase(ev.compId, "archived");
            setArchiveConfirm(null); reload();
          }}
          onCancel={() => setArchiveConfirm(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          message={`Permanently delete "${deleteConfirm.snapshot?.compData?.name || "this competition"}"? This cannot be undone.`}
          confirmLabel="Delete permanently"
          isDanger={true}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      {bulkDeleteConfirm && (
        <ConfirmModal
          message={`Permanently delete ${selected.size} archived event${selected.size === 1 ? "" : "s"}? This cannot be undone.`}
          confirmLabel={`Delete ${selected.size} event${selected.size === 1 ? "" : "s"}`}
          isDanger={true}
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}
    </>
  );
}


export default OrganizerDashboard;
