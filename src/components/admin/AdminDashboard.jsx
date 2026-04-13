import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";

// ============================================================
// ADMIN DASHBOARD — platform-wide stats & management
// ============================================================
function AdminDashboard({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [tab, setTab] = useState("overview"); // overview | users | comps

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, compsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("competitions").select("*").order("created_at", { ascending: false }),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (compsRes.error) throw compsRes.error;
      setProfiles(profilesRes.data || []);
      setCompetitions(compsRes.data || []);
    } catch (e) {
      console.error("[AdminDashboard] fetch error:", e.message);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived stats ──
  const totalUsers = profiles.length;
  const totalComps = competitions.length;

  const statusCounts = competitions.reduce((acc, c) => {
    const s = c.status || "active";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const totalGymnasts = competitions.reduce((acc, c) => {
    const gymnasts = c.data?.gymnasts || [];
    return acc + gymnasts.length;
  }, 0);

  const totalClubs = new Set(
    competitions.flatMap(c => (c.data?.compData?.clubs || []).map(cl => typeof cl === "string" ? cl : cl.name)).filter(Boolean)
  ).size;

  // Upcoming comps: date >= today, not completed/archived
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = competitions
    .filter(c => c.data?.compData?.date >= today && c.status !== "completed" && c.status !== "archived")
    .sort((a, b) => (a.data?.compData?.date || "").localeCompare(b.data?.compData?.date || ""))
    .slice(0, 10);

  // Recent comps: last 10 created
  const recentComps = competitions.slice(0, 10);

  // Recent signups: last 10 profiles
  const recentUsers = profiles.slice(0, 10);

  // Activity stats
  const now = Date.now();
  const activeToday = profiles.filter(p => p.last_active_at && (now - new Date(p.last_active_at).getTime()) < 86400000).length;
  const activeThisWeek = profiles.filter(p => p.last_active_at && (now - new Date(p.last_active_at).getTime()) < 7 * 86400000).length;

  // ── Format helpers ──
  const formatRelativeTime = (iso) => {
    if (!iso) return "Never";
    const diff = now - new Date(iso).getTime();
    if (diff < 0) return "Just now";
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch { return d; }
  };

  const fmtDateTime = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  };

  const statusDot = (status) => {
    const colors = { draft: "#f59e0b", active: "var(--brand-01)", live: "#22c55e", completed: "#15803d", archived: "#909090" };
    return colors[status] || "#ccc";
  };

  if (loading) {
    return (
      <div className="admin-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-tertiary)", fontSize: 14 }}>
          Loading admin data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-main">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12 }}>
          <div style={{ color: "#e53e3e", fontSize: 14 }}>Failed to load admin data: {error}</div>
          <button className="admin-btn" onClick={fetchAll}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .admin-main{flex:1;display:flex;flex-direction:column;gap:24px;padding:40px;overflow-y:auto;min-width:0;}
        .admin-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
        .admin-title{font-size:32px;font-weight:600;color:var(--text-primary);line-height:1.2;}
        .admin-subtitle{font-size:14px;color:var(--text-tertiary);margin-top:4px;}
        .admin-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;}
        .admin-stat{background:var(--background-light);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:8px;}
        .admin-stat-value{font-size:32px;font-weight:700;color:var(--text-primary);line-height:1;}
        .admin-stat-label{font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;}
        .admin-section{display:flex;flex-direction:column;gap:12px;}
        .admin-section-title{font-size:16px;font-weight:600;color:var(--text-primary);}
        .admin-status-row{display:flex;gap:12px;flex-wrap:wrap;}
        .admin-status-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:48px;background:var(--background-light);font-size:13px;font-weight:600;color:var(--text-primary);font-family:var(--font-display);}
        .admin-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .admin-tabs{display:flex;gap:4px;background:var(--background-neutral);padding:3px;border-radius:10px;align-self:flex-start;}
        .admin-tab{padding:7px 18px;border-radius:8px;border:none;cursor:pointer;font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-tertiary);background:none;}
        .admin-tab.active{background:var(--background-light);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.08);}
        .admin-table-wrap{background:var(--background-light);border-radius:12px;overflow:hidden;}
        .admin-table{width:100%;border-collapse:collapse;font-size:13px;font-family:var(--font-display);}
        .admin-table th{text-align:left;padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-tertiary);border-bottom:1px solid var(--border);background:var(--background-neutral);}
        .admin-table td{padding:10px 16px;border-bottom:1px solid var(--border);color:var(--text-primary);vertical-align:middle;}
        .admin-table tr:last-child td{border-bottom:none;}
        .admin-table tr:hover td{background:rgba(0,0,0,0.015);}
        .admin-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:8px;border:1.5px solid var(--border);background:var(--background-light);font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);cursor:pointer;}
        .admin-btn:hover{background:var(--background-neutral);}
        .admin-empty{padding:32px;text-align:center;color:var(--text-tertiary);font-size:13px;}
        @media(max-width:768px){
          .admin-main{padding:24px 16px;}
          .admin-title{font-size:24px;}
          .admin-stats{grid-template-columns:repeat(2,1fr);}
          .admin-table-wrap{overflow-x:auto;}
        }
      `}</style>

      <div className="admin-main">
        {/* Header */}
        <div className="admin-header">
          <div>
            <div className="admin-title">Admin Dashboard</div>
            <div className="admin-subtitle">Platform-wide overview and management</div>
          </div>
          <button className="admin-btn" onClick={fetchAll}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8a6 6 0 0111.3-2.8M14 8a6 6 0 01-11.3 2.8"/><path d="M14 2v4h-4M2 14v-4h4"/></svg>
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="admin-stats">
          <div className="admin-stat">
            <div className="admin-stat-value">{totalUsers}</div>
            <div className="admin-stat-label">Total Users</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{totalComps}</div>
            <div className="admin-stat-label">Total Competitions</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{totalGymnasts}</div>
            <div className="admin-stat-label">Total Gymnasts</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{totalClubs}</div>
            <div className="admin-stat-label">Unique Clubs</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{activeToday}</div>
            <div className="admin-stat-label">Active Today</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{activeThisWeek}</div>
            <div className="admin-stat-label">Active This Week</div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="admin-section">
          <div className="admin-section-title">Competition Status Breakdown</div>
          <div className="admin-status-row">
            {["draft", "active", "live", "completed", "archived"].map(s => (
              <div key={s} className="admin-status-pill">
                <span className="admin-status-dot" style={{ background: statusDot(s) }} />
                {s.charAt(0).toUpperCase() + s.slice(1)}: {statusCounts[s] || 0}
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button className={`admin-tab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
          <button className={`admin-tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>Users ({totalUsers})</button>
          <button className={`admin-tab${tab === "comps" ? " active" : ""}`} onClick={() => setTab("comps")}>Competitions ({totalComps})</button>
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <>
            {/* Upcoming competitions */}
            <div className="admin-section">
              <div className="admin-section-title">Upcoming Competitions</div>
              {upcoming.length === 0 ? (
                <div className="admin-table-wrap"><div className="admin-empty">No upcoming competitions</div></div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Competition</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Gymnasts</th>
                        <th>Clubs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.map(c => {
                        const cd = c.data?.compData || {};
                        const gCount = (c.data?.gymnasts || []).length;
                        const cCount = (cd.clubs || []).length;
                        return (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{cd.name || "Untitled"}</td>
                            <td>{fmtDate(cd.date)}</td>
                            <td>{cd.location || "—"}</td>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusDot(c.status) }} />
                                {c.status}
                              </span>
                            </td>
                            <td>{gCount}</td>
                            <td>{cCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent signups */}
            <div className="admin-section">
              <div className="admin-section-title">Recent Signups</div>
              {recentUsers.length === 0 ? (
                <div className="admin-table-wrap"><div className="admin-empty">No users yet</div></div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Club</th>
                        <th>Last Active</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentUsers.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.full_name || "—"}</td>
                          <td>{p.club_name || "—"}</td>
                          <td>{formatRelativeTime(p.last_active_at)}</td>
                          <td>{fmtDateTime(p.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="admin-section">
            <div className="admin-section-title">All Users</div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Club</th>
                    <th>Admin</th>
                    <th>Last Active</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.full_name || "—"}</td>
                      <td>{p.club_name || "—"}</td>
                      <td>{p.is_admin ? "Yes" : "—"}</td>
                      <td>{formatRelativeTime(p.last_active_at)}</td>
                      <td>{fmtDateTime(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Competitions tab */}
        {tab === "comps" && (
          <div className="admin-section">
            <div className="admin-section-title">All Competitions</div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Competition</th>
                    <th>Organiser</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Gymnasts</th>
                    <th>Clubs</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {competitions.map(c => {
                    const cd = c.data?.compData || {};
                    const gCount = (c.data?.gymnasts || []).length;
                    const cCount = (cd.clubs || []).length;
                    const owner = profiles.find(p => p.id === c.user_id);
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{cd.name || "Untitled"}</td>
                        <td>{owner?.full_name || owner?.email || c.user_id?.slice(0, 8) || "—"}</td>
                        <td>{fmtDate(cd.date)}</td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusDot(c.status) }} />
                            {c.status || "active"}
                          </span>
                        </td>
                        <td>{gCount}</td>
                        <td>{cCount}</td>
                        <td>{fmtDateTime(c.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminDashboard;
