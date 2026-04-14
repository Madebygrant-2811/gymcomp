export const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f5f5f5; --surface: #ffffff; --surface2: #efefef; --border: #e4e4e4;
    --accent: #000dff; --accent2: #7178f4; --text: #2e2e2e; --muted: #909090;
    --danger: #e53e3e; --success: #22c55e; --warn: #f59e0b;
    --radius: 16px; --font-display: 'Saans', sans-serif; --font-body: 'Saans', sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 100; border-radius: 16px 16px 0 0; }
  .nav-logo { font-family: var(--font-display); font-size: 28px; letter-spacing: 2px; color: var(--accent); }
  .nav-logo span { color: var(--text); }

  .main { flex: 1; display: flex; }

  /* ── App Shell (persistent sidebar layout) ── */
  .app-shell { position: fixed; inset: 0; display: flex; gap: 24px; padding: 24px; background: #f5f5f5; font-family: var(--font-display); box-sizing: border-box; }
  .app-sidebar { width: 266px; flex-shrink: 0; background: var(--background-light); border-radius: 16px; display: flex; flex-direction: column; justify-content: space-between; overflow: visible; padding: 15px 13px; transition: width 0.2s ease; position: relative; }
  .app-sidebar.collapsed { width: 60px; padding: 10px 6px; }
  .app-sidebar.collapsed .as-label,
  .app-sidebar.collapsed .as-account-label,
  .app-sidebar.collapsed .as-logo-text { opacity: 0; width: 0; overflow: hidden; white-space: nowrap; pointer-events: none; position: absolute; }
  .app-sidebar.collapsed .as-section-title { display: none; }
  .app-sidebar.collapsed .as-header { justify-content: center; }
  .app-sidebar.collapsed .as-logo { justify-content: center; flex: none; }
  .app-sidebar.collapsed .as-logo-logotype { display: none; }
  .app-sidebar.collapsed .as-logo-logomark { margin-left: 0; }
  .app-sidebar.collapsed .as-nav-item { justify-content: center; padding: 10px 0; }
  .app-sidebar.collapsed .as-count { display: none; }
  .app-sidebar.collapsed .as-divider { margin: 4px 0; }
  .app-sidebar.collapsed .as-bottom { align-items: center; }
  .app-sidebar.collapsed .as-account { justify-content: center; padding: 8px 0; }
  .app-sidebar.collapsed .as-signout { font-size: 0; padding: 10px 0; justify-content: center; }
  .app-sidebar.collapsed .as-signout svg { margin: 0; }
  .app-sidebar.collapsed .as-signout .as-label { display: none; }
  .as-top { display: flex; flex-direction: column; gap: 24px; flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; }
  .as-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; }
  .as-logo { display: flex; align-items: center; flex: 1; min-width: 0; }
  .as-logo-logotype { height: 18px; flex-shrink: 1; min-width: 0; }
  .as-logo-logomark { height: 24px; flex-shrink: 0; margin-left: auto; }
  .as-toggle { position: absolute; top: 20px; right: -20px; width: 20px; height: 16px; border: none; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); padding: 0; border-radius: 0 8px 8px 0; z-index: 2; box-shadow: 2px 0 4px rgba(0,0,0,0.04); }
  .as-toggle:hover { color: var(--text-primary); }
  .as-nav { display: flex; flex-direction: column; gap: 2px; }
  .as-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 56px; cursor: pointer; border: none; background: none; font-family: var(--font-display); font-size: 14px; font-weight: 500; color: var(--text-secondary); transition: all 0.15s; text-align: left; width: 100%; }
  .as-nav-item:hover { background: var(--background-neutral); color: var(--text-primary); }
  .as-nav-item.active { background: rgba(0,13,255,0.06); color: var(--brand-01); font-weight: 600; }
  .as-nav-item.done { color: var(--success); }
  .as-nav-item svg { flex-shrink: 0; }
  .as-label { transition: opacity 0.2s, width 0.2s; white-space: nowrap; }
  .as-divider { height: 1px; background: var(--border); margin: 8px 4px; }
  .as-section-title { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-tertiary); padding: 8px 12px 2px; transition: opacity 0.2s; }
  .as-count { min-width: 18px; height: 18px; border-radius: 36px; background: var(--background-neutral); color: var(--text-tertiary); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0; margin-left: auto; }
  .as-bottom { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
  .as-account { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 56px; border: none; background: none; cursor: pointer; font-family: var(--font-display); width: 100%; text-align: left; }
  .as-account:hover { background: var(--background-neutral); }
  .as-account-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--brand-01); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .as-account-label { font-size: 13px; font-weight: 600; color: var(--text-primary); transition: opacity 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .as-signout { width: 100%; height: 40px; border: 1px solid var(--border); border-radius: 56px; display: flex; align-items: center; justify-content: center; gap: 6px; background: none; cursor: pointer; font-family: var(--font-display); font-size: 13px; font-weight: 600; color: var(--text-secondary); transition: all 0.15s; }
  .as-signout:hover { background: var(--background-neutral); border-color: var(--text-tertiary); }
  .app-main { flex: 1; overflow-y: auto; min-width: 0; border-radius: 16px; }

  /* ── Mobile Logo Header ── */
  .mobile-logo-header { display: none; }

  /* ── Mobile Tab Bar ── */
  .mobile-tab-bar { display: none; }

  @media (max-width: 768px) {
    .app-shell { padding: 0; gap: 0; }
    .app-sidebar { display: none; }
    .app-main { border-radius: 0; padding-bottom: 80px; padding-top: 78px; }

    /* ── Mobile logo header (pill, hides on scroll) ── */
    .mobile-logo-header {
      display: flex; align-items: center; justify-content: space-between;
      position: fixed; top: 16px; left: 16px; right: 16px; z-index: 210;
      background: white; border-radius: 64px; padding: 12px 20px; height: 54px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .mobile-logo-header.hidden { transform: translateY(-100px); opacity: 0; pointer-events: none; }
    .mobile-logo-header .mlh-logotype { height: 18px; }
    .mobile-logo-header .mlh-logomark { height: 26px; }

    /* ── Mobile tab bar (pill) ── */
    .mobile-tab-bar {
      display: flex; position: fixed; bottom: 16px; left: 16px; right: 16px; z-index: 200;
      height: 56px; background: white; border-radius: 64px; align-items: stretch;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08); padding: 0 8px;
    }
    .mtb-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: none; background: none; cursor: pointer; font-family: var(--font-display); font-size: 10px; font-weight: 600; color: var(--text-tertiary); padding: 4px 2px; transition: color 0.15s; position: relative; }
    .mtb-tab.active { color: var(--brand-01); }
    .mtb-tab svg { flex-shrink: 0; }
    .mtb-divider { width: 1px; align-self: center; height: 28px; background: var(--border); flex-shrink: 0; }
  }

  .content { flex: 1; padding: 40px; max-width: 1200px; }
  .page-header { margin-bottom: 32px; }
  .page-title { font-family: var(--font-display); font-size: 32px; font-weight: 600; color: var(--text); line-height: 1.2; letter-spacing: 0; }
  .page-title span { color: var(--accent); }
  .page-sub { color: var(--muted); margin-top: 6px; font-size: 14px; line-height: 1.4; }

  /* ── Setup Topbar ── */
  .setup-topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; margin-bottom: 28px; background: var(--brand-01); border: none; border-radius: 16px; transition: transform 0.25s ease, opacity 0.25s ease; flex-wrap: wrap; }
  .setup-topbar.topbar-hidden { transform: translateY(-120%); opacity: 0; pointer-events: none; }
  .setup-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; flex-wrap: wrap; }
  .setup-topbar-name { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--text-alternate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
  .setup-topbar-meta { font-size: 12px; color: rgba(255,255,255,0.7); white-space: nowrap; }
  .setup-topbar-meta::before { content: "·"; margin-right: 12px; color: rgba(255,255,255,0.35); }
  .setup-topbar-right { flex-shrink: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .setup-topbar-sync { font-size: 12px; font-weight: 600; font-family: var(--font-display); color: rgba(255,255,255,0.7); }
  @media (max-width: 768px) {
    .setup-topbar { margin-bottom: 16px; padding: 10px 12px; gap: 8px; border-radius: 12px; }
    .setup-topbar-left { gap: 6px; }
    .setup-topbar-name { max-width: 140px; font-size: 13px; }
    .setup-topbar-meta { display: none; }
    .setup-topbar-right { flex-shrink: 1; width: auto; }
    .setup-topbar-right .btn { font-size: 11px !important; padding: 5px 10px !important; white-space: nowrap; }
  }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; margin-bottom: 20px; }
  .card-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }

  .field { margin-bottom: 18px; min-width: 0; }
  .label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 7px; }
  .input, .select { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; color: var(--text); font-family: var(--font-body); font-size: 14px; padding: 11px 20px; transition: border-color 0.2s, box-shadow 0.2s; outline: none; }
  .select { appearance: none; -webkit-appearance: none; padding-right: 40px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b6b85' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; }
  .input:focus, .select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,13,255,0.08); }
  .input::placeholder { color: var(--muted); }
  .input.error { border-color: var(--danger); }
  .select option { background: var(--surface); }
  .field-error { font-size: 11px; color: var(--danger); margin-top: 6px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }

  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 11px 22px; border-radius: 56px; border: none; font-family: var(--font-body); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px; white-space: nowrap; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #1a2aff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,13,255,0.2); }
  .btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  .btn-tertiary { background: var(--brand-03); color: var(--brand-01); border: none; }
  .btn-tertiary:hover { opacity: 0.85; }
  .btn-danger { background: rgba(229,62,62,0.08); color: var(--danger); border: 1px solid rgba(229,62,62,0.25); }
  .btn-danger:hover { background: rgba(229,62,62,0.15); }
  .btn-warn { background: rgba(245,158,11,0.08); color: var(--warn); border: 1px solid rgba(245,158,11,0.25); }
  .btn-ghost { background: transparent; color: var(--muted); border: none; }
  .btn-ghost:hover { color: var(--text); }
  .btn-sm { padding: 6px 14px; font-size: 12px; }
  .btn-icon { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 56px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.2s; font-size: 15px; line-height: 1; }
  .btn-icon:hover { color: var(--danger); border-color: var(--danger); background: rgba(229,62,62,0.06); }

  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; font-size: 13px; font-weight: 500; }
  .chip button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; }
  .chip button:hover { color: var(--danger); }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 24px; flex-wrap: wrap; }
  .tab-btn { padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-family: var(--font-body); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; border-radius: 0; }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

  .list-item { display: flex; align-items: center; gap: 10px; padding: 11px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; margin-bottom: 6px; }
  .list-item-content { flex: 1; font-size: 14px; }

  .table-wrap { overflow-x: auto; border-radius: 16px; border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: var(--surface2); padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 9px 14px; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(0,0,0,0.02); }

  .score-input { width: 76px; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 7px 10px; outline: none; text-align: center; transition: border-color 0.2s; }
  .score-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,13,255,0.08); }
  .score-input.de { width: 58px; }

  /* ── Score Input Table ── */
  .si-body { padding: 0 40px 40px; max-width: 1200px; }
  .si-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  .si-table th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .si-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .si-table tr:last-child td { border-bottom: none; }
  .si-col-num { width: 48px; }
  .si-col-name { width: 160px; }
  .si-col-club { width: 130px; }
  .si-col-age { width: 50px; }
  .si-col-app { width: 100px; }
  .si-col-total { width: 80px; }
  .si-col-flag { width: 60px; }
  .si-add-btn { background: #fff; border: 1px dashed var(--border); border-radius: 6px; padding: 4px 10px; font-size: 11px; color: var(--accent); cursor: pointer; font-weight: 600; transition: all 0.15s; white-space: nowrap; }
  .si-add-btn:hover { background: rgba(0,13,255,0.04); border-color: var(--accent); }
  .si-score-cell { display: flex; align-items: center; gap: 6px; }
  .si-score-val { font-weight: 700; font-size: 13px; color: var(--text); }
  .si-score-clickable { cursor: pointer; padding: 4px 10px; border-radius: 6px; transition: all 0.15s; }
  .si-score-clickable:hover { background: rgba(0,13,255,0.06); color: var(--accent); }
  .si-search { max-width: 600px; margin-bottom: 16px; }
  .si-modal-total { display: flex; align-items: center; justify-content: center; margin: 32px auto 32px; width: fit-content; min-width: 140px; padding: 14px 28px 20px; font-size: 36px; font-weight: 800; font-family: var(--font-display); letter-spacing: 1px; color: var(--text); background: #fff; border: 2px solid var(--text); border-radius: 6px; box-shadow: 0 4px 0 var(--text), 0 6px 12px rgba(0,0,0,0.12); position: relative; }
  .si-modal-total::before { content: "SCORE"; position: absolute; top: -9px; left: 50%; transform: translateX(-50%); font-size: 9px; font-weight: 700; letter-spacing: 2px; color: var(--muted); background: var(--surface); padding: 0 8px; }
  .si-modal-fields { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .si-modal-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 0; min-width: 0; }
  .si-modal-field label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--brand-01); }
  .si-modal-field input { width: 100%; font-size: 20px; padding: 14px 20px; font-weight: 700; text-align: center; border-radius: 12px; }
  .si-modal-readonly { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--surface2); border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
  .si-modal-readonly strong { font-weight: 700; }
  .si-modal-readonly span { color: var(--muted); }
  @media (max-width: 768px) {
    .si-body { padding: 0 12px 24px; }
    .si-table th, .si-table td { padding: 6px 6px; font-size: 12px; }
    .si-add-btn { padding: 3px 6px; font-size: 10px; }
  }

  .pin-mobile-only { display: none !important; }
  @media (max-width: 768px) { .pin-mobile-only { display: flex !important; } }

  .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #e0e0e0; border-radius: 24px; transition: 0.2s; }
  .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
  .toggle-switch input:checked + .toggle-slider { background: var(--brand-01); }
  .toggle-switch input:checked + .toggle-slider:before { transform: translateX(18px); }

  .group-header { display: flex; align-items: center; gap: 10px; padding: 6px 0; margin: 16px 0 8px; }
  .group-label { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent2); white-space: nowrap; }
  .group-line { flex: 1; height: 1px; background: var(--border); }
  .sub-group-label { font-size: 16px; font-weight: 500; color: var(--accent); margin: 10px 0 16px; }

  .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 56px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap; }
  .badge-gold { background: rgba(255,200,0,0.12); color: #b8860b; }
  .badge-silver { background: rgba(140,140,160,0.12); color: #6b6b85; }
  .badge-bronze { background: rgba(180,100,40,0.12); color: #a0522d; }
  .badge-medal { background: rgba(0,13,255,0.07); color: #4a50c7; }
  .badge-rank { background: var(--surface2); color: var(--muted); }

  .summary-box { background: rgba(0,13,255,0.04); border: 1px solid rgba(0,13,255,0.15); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: var(--accent); }
  .warn-box { background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.2); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: var(--warn); margin-bottom: 12px; }
  .error-box { background: rgba(229,62,62,0.06); border: 1px solid rgba(229,62,62,0.2); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: var(--danger); margin-bottom: 12px; }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px; max-width: 460px; width: 90%; max-height: 90vh; overflow-y: auto; }

  .pc-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; margin-top: 4px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .pc-option { padding: 8px 14px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; color: var(--text); line-height: 1.3; }
  .pc-option:last-child { border-bottom: none; }
  .pc-option:hover { background: var(--surface2); color: var(--accent); }

  .step-nav { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }

  .inline-row { display: flex; gap: 8px; align-items: flex-end; }
  .inline-row .field { margin-bottom: 0; }

  .club-edit-input { background: var(--surface); border: 1px solid var(--accent); border-radius: 56px; color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 5px 14px; outline: none; min-width: 120px; }

  .csv-zone { border: 2px dashed var(--border); border-radius: 16px; padding: 24px; text-align: center; color: var(--muted); font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .csv-zone:hover { border-color: var(--accent); color: var(--accent); }

  .empty { text-align: center; padding: 32px; color: var(--muted); font-size: 13px; }

  .apparatus-section { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; margin-bottom: 12px; }
  .apparatus-section-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--surface2); border-bottom: 1px solid var(--border); border-radius: 16px 16px 0 0; }
  .apparatus-section-body { padding: 12px 16px; }

  .results-body { padding: 24px 40px 40px; max-width: 1200px; }
  .results-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
  .results-toolbar-views { display: flex; gap: 8px; flex: 1; }
  .results-level-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
  .results-level-header { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .results-level-header span { font-size: 14px; font-weight: 600; color: var(--text-primary); background: rgba(0,13,255,0.06); padding: 4px 12px; border-radius: 99px; letter-spacing: 0.3px; }
  .results-filters { display: flex; gap: 8px; align-items: center; }

  .si-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .si-toolbar .tabs { flex: 1; margin-bottom: 0; border-bottom: none; }
  .si-toolbar .tab-btn { flex: 1; text-align: center; }

  /* ============================================================
     RESPONSIVE
     ============================================================ */

  @media (max-width: 768px) {
    /* Prevent iOS Safari auto-zoom on focus — all interactive elements must be ≥16px */
    .input, .select, textarea, input, select, .btn, .club-edit-input, .score-input { font-size: 16px !important; }
    .input, .select, input, select, textarea { padding: 10px 14px; box-sizing: border-box; max-width: 100%; width: 100%; min-width: 0; }
    input[type="date"], input[type="time"] { -webkit-appearance: none; appearance: none; }

    .nav { padding: 12px 16px; gap: 10px; }
    .nav-logo { font-size: 22px; }

    .main { flex-direction: column; }

    .content { padding: 16px; }
    .round-time-row { flex-direction: column; align-items: stretch !important; gap: 8px; }
    .round-time-row > div:first-child { width: auto !important; text-align: center; }
    .round-time-row .field { flex: 1 1 auto !important; width: 100%; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .card { padding: 16px; overflow: hidden; }

    .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .dash-hero-title { font-size: 40px !important; }
    .page-title { font-size: 36px; }

    .apparatus-section-body { overflow-x: auto; padding: 8px; }
    .apparatus-section-body table { min-width: 480px; }
    .score-input { width: 68px; padding: 8px 6px; font-size: 14px; }

    .results-body { padding: 16px 12px 24px; }
    .results-toolbar { gap: 10px; }
    .results-toolbar-views { flex: none; width: 100%; }
    .results-toolbar-views .btn { flex: 1; justify-content: center; }
    .results-toolbar .tabs { width: 100%; justify-content: stretch; }
    .results-toolbar .tab-btn { flex: 1; text-align: center; }
    .results-level-card { padding: 14px; }
    .results-level-header { flex-wrap: wrap; }
    .results-level-header .results-filters { width: 100%; }
    .si-toolbar .tabs { width: 100%; }
    .si-toolbar .si-search { width: 100%; }

    .setup-content { padding: 16px !important; }
    .cd-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .csv-zone { min-width: 100% !important; }
    .club-pills-row { flex-direction: column; }
    .club-pills-row .btn { width: 100%; justify-content: center; }
    .table-wrap { overflow-x: auto; }

    .inline-row { flex-wrap: wrap; }

    .step-nav { flex-direction: column; gap: 10px; }
    .step-nav .btn { width: 100%; justify-content: center; }

    .modal-box { padding: 24px 18px; }
    .home-logo { font-size: 52px !important; }
  }

  @media (max-width: 480px) {
    .nav-centre { display: none; }
    .nav .btn-sm { padding: 5px 8px; font-size: 11px; }

    .stats-grid { gap: 10px !important; }
    .dash-hero-title { font-size: 32px !important; }

    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .content { padding: 16px; }
    .card { padding: 12px 10px; }

    .home-logo { font-size: 44px !important; letter-spacing: 2px !important; }
    .home-wrap { padding: 20px 16px !important; }
    .home-resume-row { flex-direction: column !important; }
    .home-resume-row .btn { width: 100%; justify-content: center; }

    .tabs { flex-wrap: nowrap; overflow-x: auto; }
    .tab-btn { flex-shrink: 0; padding: 10px 14px; }

    .list-item { flex-wrap: wrap; gap: 6px; }
    .list-item-level .list-item-content { flex: 1 1 100%; }
    .chip { font-size: 12px; padding: 4px 10px; }
  }

  /* ── Score flash animation (real-time sync) ─────────────── */
  @keyframes scoreFlash {
    0% { background: rgba(34, 197, 94, 0.3); }
    100% { background: transparent; }
  }
  .score-flash {
    animation: scoreFlash 2s ease-out;
  }
`;

