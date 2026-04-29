import GymCompLogotype from "../../assets/Logotype.svg";
import GymCompLogomark from "../../assets/Logomark.svg";

// ============================================================
// APP SIDEBAR (persistent, context-aware)
// ============================================================
function AppSidebar({ screen, phase, step, setStep, collapsed, onToggle, account, statusFilter, setStatusFilter, filterCounts, activeSection, onNew, onMyEvents, onEditSetup, onManageGymnasts, onStartComp, onDashboard, onSettings, onLogout, gymnastsCount, judgesCount, eventStatus, allGymnastsComplete, isAdmin, onAdmin, pinRole, lockedApparatus, rounds, activeRound, setActiveRound, onExit, subscriptionStatus, onManageSubscription }) {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // SVG icon helpers (16x16)
  const icons = {
    plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
    back: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>,
    edit: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>,
    users: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M12 9.5c1.5.3 2.5 1.5 2.5 3"/></svg>,
    play: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>,
    score: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 2v12"/></svg>,
    trophy: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6v5a3 3 0 01-6 0V2zM8 10v3M5 13h6"/><path d="M5 4H3a1 1 0 00-1 1v1a2 2 0 002 2h1M11 4h2a1 1 0 011 1v1a2 2 0 01-2 2h-1"/></svg>,
    doc: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/></svg>,
    mic: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="6" height="8" rx="3"/><path d="M3 8a5 5 0 0010 0M8 13v2"/></svg>,
    account: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>,
    logout: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M6 8h8"/></svg>,
    info: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.5v0"/></svg>,
    palette: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="10" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="9" r="1" fill="currentColor"/></svg>,
    club: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14l2-8h8l2 8M5 2a3 3 0 016 0"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>,
    bars: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10M3 8h10M3 12h10"/></svg>,
    layers: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L2 5.5 8 9l6-3.5L8 2zM2 10.5L8 14l6-3.5M2 8l6 3.5L14 8"/></svg>,
    gauge: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 14A6 6 0 118 2a6 6 0 010 12zM8 5v3l2 1"/></svg>,
    send: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z"/></svg>,
    grid: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>,
    collapse: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4L7 8l4 4"/><path d="M7 4L3 8l4 4"/></svg>,
    expand: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4-4-4-4"/><path d="M9 12l4-4-4-4"/></svg>,
    judge: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14V3a1 1 0 00-1-1H5a1 1 0 00-1 1v11M6 5h4M6 8h4M6 11h2"/></svg>,
    home: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l6-5.5L14 8M3.5 9v4.5a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>,
  };

  const NavItem = ({ icon, label, active, done, onClick, count, title: tip, disabled, badge, primary }) => (
    <button className={`as-nav-item${active ? " active" : ""}${done ? " done" : ""}${disabled ? " disabled" : ""}`}
      onClick={disabled ? undefined : onClick} title={collapsed ? (tip || label) : undefined}
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : primary ? { background: "var(--brand-01)", color: "#fff", padding: "16px 12px" } : undefined}>
      {icon}
      <span className="as-label">{label}</span>
      {badge && <span style={{ fontSize: 9, fontWeight: 700, background: "var(--brand-03)", color: "var(--brand-01)", padding: "2px 8px", borderRadius: 99, marginLeft: "auto", whiteSpace: "nowrap" }}>{badge}</span>}
      {count !== undefined && count > 0 && <span className="as-count">{count}</span>}
    </button>
  );

  const sidebarFilters = [
    { value: "draft", label: "Draft", color: "#f59e0b",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg> },
    { value: "active", label: "Active", color: "var(--brand-01)",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--brand-01)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 1.5"/></svg> },
    { value: "live", label: "Live", color: "#22c55e",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg> },
    { value: "completed", label: "Complete", color: "#15803d",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5L6.5 11.5 12.5 4.5"/></svg> },
    { value: "archived", label: "Archived", color: "#909090",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#909090" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="3" rx="1"/><path d="M3 6v6.5a1 1 0 001 1h8a1 1 0 001-1V6M6.5 9h3"/></svg> },
  ];

  const setupAnchors = [
    { id: "setup-basic", label: "Basic Info", icon: icons.info },
    { id: "setup-levels", label: "Levels", icon: icons.layers },
    { id: "setup-apparatus", label: "Apparatus", icon: icons.bars },
    { id: "setup-ages", label: "Age Ranges", icon: icons.users },
    { id: "setup-rounds", label: "Rounds", icon: icons.clock },
  ];

  const dashAnchors = [
    { id: "card-overview", label: "Comp Overview", icon: icons.info },
    { id: "card-clubs", label: "Manage Clubs", icon: icons.club },
    { id: "card-gymnasts", label: "Manage Gymnasts", icon: icons.users },
    { id: "card-judges", label: "Manage Judges", icon: icons.judge },
    { id: "card-documents", label: "Comp Documents", icon: icons.doc },
    { id: "card-live", label: "Live Results", icon: icons.send },
  ];

  const phase2Steps = [
    { label: "Score Input", icon: icons.score, step: 1 },
    { label: "Results", icon: icons.trophy, step: 2 },
    { label: "Exports", icon: icons.doc, step: 3 },
    { label: "MC Mode", icon: icons.mic, step: 4, disabled: true, badge: "Coming Soon" },
  ];

  const initial = (account?.name || account?.email || "?")[0].toUpperCase();

  return (
    <div className={`app-sidebar${collapsed ? " collapsed" : ""}`}>
      <button className="as-toggle" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {collapsed ? <path d="M3 1l3 3-3 3"/> : <path d="M5 1L2 4l3 3"/>}
        </svg>
      </button>
      <div className="as-top">
        <div className="as-header">
          <div className="as-logo">
            <img src={GymCompLogotype} alt="GymComp" className="as-logo-logotype" />
            <img src={GymCompLogomark} alt="GC" className="as-logo-logomark" />
          </div>
        </div>

        <div className="as-nav">
          {/* ── org-dashboard context ── */}
          {screen === "org-dashboard" && (<>
            <NavItem icon={icons.plus} label="New Competition" onClick={onNew} primary />
            <div className="as-divider" />
            <div className="as-section-title">Filter</div>
            {sidebarFilters.map(f => (
              <NavItem key={f.value} icon={f.icon} label={f.label}
                active={statusFilter === f.value}
                count={filterCounts[f.value]}
                onClick={() => setStatusFilter(prev => prev === f.value ? "all" : f.value)} />
            ))}
            {isAdmin && (<>
              <div className="as-divider" />
              <NavItem icon={icons.gauge} label="Admin" active={false} onClick={onAdmin} />
            </>)}
          </>)}

          {/* ── admin context ── */}
          {screen === "admin" && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <div className="as-divider" />
            <div className="as-section-title">Admin</div>
            <NavItem icon={icons.gauge} label="Dashboard" active />
          </>)}

          {/* ── active / phase 1 (edit setup) ── */}
          {screen === "active" && phase === 1 && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <div className="as-divider" />
            <div className="as-section-title">Setup Sections</div>
            {setupAnchors.map(a => (
              <NavItem key={a.id} icon={a.icon} label={a.label} active={activeSection === a.id} onClick={() => scrollTo(a.id)} />
            ))}
          </>)}

          {/* ── active / dashboard ── */}
          {screen === "active" && phase === "dashboard" && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <div className="as-divider" />
            {eventStatus !== "completed" && (<>
              <NavItem icon={icons.edit} label="Edit Comp Setup" onClick={onEditSetup} />
              <div className="as-divider" />
            </>)}
            <div className="as-section-title">Dashboard</div>
            {dashAnchors.map(a => (
              <NavItem key={a.id} icon={a.icon} label={a.label} onClick={() => scrollTo(a.id)} />
            ))}
            {eventStatus !== "completed" && (<>
              <div className="as-divider" />
              {(() => {
                const ready = gymnastsCount > 0 && judgesCount > 0 && allGymnastsComplete !== false;
                const label = eventStatus === "live" ? "Resume Competition" : "Start Competition";
                return (
                  <div style={ready ? {} : { opacity: 0.4, pointerEvents: "none" }}
                    title={!ready ? [gymnastsCount === 0 && "Add gymnasts", judgesCount === 0 && "Add judges", allGymnastsComplete === false && "Complete incomplete gymnast data"].filter(Boolean).join(", ") + " to start" : undefined}>
                    <NavItem icon={icons.play} label={label} onClick={ready ? onStartComp : undefined} />
                  </div>
                );
              })()}
            </>)}
          </>)}

          {/* ── active / gymnasts ── */}
          {screen === "active" && phase === "gymnasts" && (<>
            <NavItem icon={icons.back} label="Back to Comp" onClick={onDashboard} />
          </>)}

          {/* ── active / phase 2 (competition) ── */}
          {screen === "active" && phase === 2 && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <NavItem icon={icons.home} label="Dashboard" onClick={onDashboard} />
            <div className="as-divider" />
            <div className="as-section-title">Competition</div>
            {phase2Steps.map(s => (
              <NavItem key={s.step} icon={s.icon} label={s.label}
                active={step === s.step}
                disabled={s.disabled} badge={s.badge}
                onClick={() => setStep(s.step)} />
            ))}
          </>)}

          {/* ── PIN judge/scorekeeper context ── */}
          {screen === "pin-judge" && (<>
            <div className="as-section-title">Rounds</div>
            {(rounds || []).map(r => (
              <NavItem key={r.id} icon={icons.clock} label={r.name}
                active={activeRound === r.id}
                onClick={() => setActiveRound(r.id)} />
            ))}
          </>)}
        </div>
      </div>

      <div className="as-bottom">
        {screen === "pin-judge" ? (<>
          <div className="as-account" style={{ cursor: "default" }}>
            <div className="as-account-avatar" style={{ background: "var(--brand-01)" }}>{icons.judge}</div>
            <span className="as-account-label">{lockedApparatus || "Scorekeeper"}</span>
          </div>
          <button className="as-signout" onClick={onExit}>
            {icons.logout}
            <span className="as-label">Exit</span>
          </button>
        </>) : (<>
          {subscriptionStatus && (() => {
            const s = subscriptionStatus;
            const cls = s.isActive ? "sub-active" : s.isPastDue ? "sub-past-due" : "sub-none";
            const tip = collapsed ? (s.isActive ? `Active — ${s.planLabel} plan` : s.isPastDue ? "Payment issue" : "Free setup") : undefined;
            return (
              <button className={`as-sub-pill ${cls}`} onClick={onManageSubscription} title={tip}>
                <span className="as-sub-pill-dot" />
                <span className="as-sub-pill-body as-label">
                  {s.isActive ? (<>
                    <span className="as-sub-pill-title">Active</span>
                    <span className="as-sub-pill-detail">{s.planLabel} plan</span>
                    <span className="as-sub-pill-link">Manage →</span>
                  </>) : s.isPastDue ? (<>
                    <span className="as-sub-pill-title">Payment issue</span>
                    <span className="as-sub-pill-link">Update card →</span>
                  </>) : (<>
                    <span className="as-sub-pill-title">Free setup</span>
                    <span className="as-sub-pill-link">View plans →</span>
                  </>)}
                </span>
              </button>
            );
          })()}
          <button className="as-account" onClick={onSettings} title={collapsed ? "Account" : undefined}>
            <div className="as-account-avatar">{initial}</div>
            <span className="as-account-label">{account?.name || account?.email || "Account"}</span>
          </button>
          <button className="as-signout" onClick={onLogout}>
            {icons.logout}
            <span className="as-label">Sign Out</span>
          </button>
        </>)}
      </div>
    </div>
  );
}


export default AppSidebar;
