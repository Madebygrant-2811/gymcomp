import { useState, useRef, useEffect } from "react";
import { generateId, isFutureOrToday, todayStr, getContrastTextColor, svgToPng } from "../../lib/utils.js";
import { UK_LEVELS, APPARATUS_GROUPS, NGA_LEVELS, sortApparatus } from "../../lib/constants.js";
import { supabase } from "../../lib/supabase.js";

import AddressLookup from "../shared/AddressLookup.jsx";
import CompConfigSections from "./CompConfigSections.jsx";
import ClubPicker from "../shared/ClubPicker.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";

function Step1_CompDetails({ data, setData, onNext, onSaveExit, syncStatus, onSave, isExisting, eventStatus, compId, currentUser, scores = {} }) {
  const [pendingRemove, setPendingRemove] = useState(null);
  const [newLevel, setNewLevel] = useState("");
  const [newAgeRange, setNewAgeRange] = useState("");
  const [editingAgeIdx, setEditingAgeIdx] = useState(null);
  const [editingAgeVal, setEditingAgeVal] = useState("");
  const [showWarnings, setShowWarnings] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const lastScrollY = useRef(0);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef(null);

  useEffect(() => {
    const el = document.querySelector(".app-main");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      if (y > 60) setTopbarHidden(true);
      else setTopbarHidden(false);
      lastScrollY.current = y;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  const [customLevel, setCustomLevel] = useState("");
  const [dateError, setDateError] = useState("");

  const handleDate = (val) => {
    setDateError(!val ? "" : !isFutureOrToday(val) ? "Competition date must be today or a future date." : "");
    setData(d => ({ ...d, date: val }));
  };

  const addAgeRange = () => {
    const val = newAgeRange.trim();
    if (!val) return;
    const existing = data.ageRanges || [];
    if (existing.find(a => a.toLowerCase() === val.toLowerCase())) return;
    setData(d => ({ ...d, ageRanges: [...(d.ageRanges || []), val] }));
    setNewAgeRange("");
  };

  const saveAgeEdit = (idx) => {
    const val = editingAgeVal.trim();
    if (!val) return;
    setData(d => {
      const updated = [...(d.ageRanges || [])];
      updated[idx] = val;
      return { ...d, ageRanges: updated };
    });
    setEditingAgeIdx(null);
  };

  const removeAgeRange = (idx) => {
    setData(d => ({ ...d, ageRanges: (d.ageRanges || []).filter((_, i) => i !== idx) }));
  };

  // Any round with a saved per-group apparatus order? Membership changes
  // (add/remove) invalidate those orders; a pure reorder leaves them intact.
  const hasStoredRotations = Object.values(data.rotations || {}).some(r => r && Object.keys(r).length > 0);
  const rotationResetNote = " Saved rotation orders will be cleared and rotations will fall back to the automatic cascade.";

  const toggleApparatus = (a, currentlyOn) => {
    if (currentlyOn) {
      setPendingRemove({ type: "apparatus", id: a, msg: `Remove apparatus "${a}"? All judges assigned to it will also be removed.${hasStoredRotations ? rotationResetNote : ""}` });
    } else if (hasStoredRotations) {
      setPendingRemove({ type: "apparatus-add", id: a, msg: `Add apparatus "${a}"?${rotationResetNote}` });
    } else {
      setData(d => ({ ...d, apparatus: sortApparatus([...d.apparatus, a]) }));
    }
  };

  const addLevel = (nameOverride) => {
    const name = (nameOverride || customLevel).trim();
    if (!name) return;
    if (data.levels.find(l => l.name.toLowerCase() === name.toLowerCase())) return;
    setData(d => ({ ...d, levels: [...d.levels, { id: generateId(), name, rankBy: "level" }] }));
    setNewLevel("");
    setCustomLevel("");
  };

  const addLevelFromDropdown = (val) => {
    if (!val || val === "__custom__") return;
    addLevel(val);
    setNewLevel("");
  };

  const updateLevelRank = (id, rankBy) =>
    setData(d => ({ ...d, levels: d.levels.map(l => l.id === id ? { ...l, rankBy } : l) }));

  // Ranking scope: "round" (default) ranks within each round; "competition"
  // pools the level across every round it appears in — for a level split
  // across rounds that must rank as one group.
  const updateLevelScope = (id, rankScope) =>
    setData(d => ({ ...d, levels: d.levels.map(l => l.id === id ? { ...l, rankScope } : l) }));

  const rankScopeSelect = (l) => (
    <select className="select" style={{ width: "auto", padding: "4px 32px 4px 12px", fontSize: 12 }}
      value={l?.rankScope || "round"}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); updateLevelScope(l?.id, e.target.value); }}>
      <option value="round">Within round</option>
      <option value="competition">Across rounds</option>
    </select>
  );

  const doRemove = () => {
    const { type, id } = pendingRemove;
    if (type === "apparatus") setData(d => ({ ...d, apparatus: d.apparatus.filter(a => a !== id), judges: d.judges.filter(j => j.apparatus !== id), rotations: {} }));
    if (type === "apparatus-add") setData(d => ({ ...d, apparatus: sortApparatus([...d.apparatus, id]), rotations: {} }));
    if (type === "level") setData(d => ({ ...d, levels: d.levels.filter(l => l.id !== id) }));
    setPendingRemove(null);
  };

  // ── Logo upload ──
  const handleLogoUpload = async (file) => {
    if (!file || !currentUser) return;
    const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
    const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml"];
    if (!ALLOWED.includes(file.type)) { setLogoError("Only PNG, JPEG or SVG files are supported."); return; }
    if (file.size > MAX_SIZE) { setLogoError("File must be under 2 MB."); return; }
    setLogoError("");
    setLogoUploading(true);
    try {
      const isSvg = file.type === "image/svg+xml";
      const ts = Date.now();
      const basePath = `${currentUser.id}/${compId}`;

      // Upload the original file (PNG/JPEG or SVG)
      const origExt = isSvg ? "svg" : file.name.split(".").pop().toLowerCase();
      const origPath = `${basePath}/logo-${ts}.${origExt}`;
      const { error: origErr } = await supabase.storage.from("competition-branding").upload(origPath, file, { upsert: true });
      if (origErr) throw origErr;
      const { data: origUrl } = supabase.storage.from("competition-branding").getPublicUrl(origPath);

      if (isSvg) {
        // Also create PNG fallback from SVG
        const pngBlob = await svgToPng(file, 512);
        const pngPath = `${basePath}/logo-${ts}.png`;
        const { error: pngErr } = await supabase.storage.from("competition-branding").upload(pngPath, pngBlob, { upsert: true });
        if (pngErr) throw pngErr;
        const { data: pngUrl } = supabase.storage.from("competition-branding").getPublicUrl(pngPath);
        setData(d => ({ ...d, brandLogoUrl: pngUrl.publicUrl, brandLogoSvgUrl: origUrl.publicUrl }));
      } else {
        setData(d => ({ ...d, brandLogoUrl: origUrl.publicUrl, brandLogoSvgUrl: "" }));
      }
    } catch (err) {
      console.error("Logo upload failed:", err);
      setLogoError("Upload failed — please try again.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setData(d => ({ ...d, brandLogoUrl: "", brandLogoSvgUrl: "" }));
    setLogoError("");
  };

  const realApparatus = data.apparatus.filter(a => a !== "Rest");

  const canProceed = data.name && data.date && !dateError &&
    realApparatus.length > 0 && data.levels.length > 0 &&
    data.dataConsentConfirmed;

  const missingFields = [
    ...(!data.name ? ["Competition name"] : []),
    ...(!data.date ? ["Date"] : []),
    ...(dateError ? ["Valid date (must be today or future)"] : []),
    ...(realApparatus.length === 0 ? ["At least one apparatus"] : []),
    ...(data.levels.length === 0 ? ["At least one level"] : []),
  ];

  const canSave = !!data.name;

  const handleSaveAndExit = () => {
    if (canProceed) {
      // All fields complete — full save & continue (PIN flow + dashboard)
      setShowWarnings(false);
      onNext();
    } else if (canSave) {
      // Partial save — persist what we have and go back to dashboard
      setShowWarnings(false);
      if (onSaveExit) onSaveExit();
    } else {
      // No name — show what's missing
      setShowWarnings(true);
    }
  };

  const topbar = (
    <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`} style={{ margin: "0 24px" }}>
      <div className="setup-topbar-left">
        {data.name && <span className="setup-topbar-name">{data.name}</span>}
        {data.date && <span className="setup-topbar-meta">{new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
        {data.venue && <span className="setup-topbar-meta">{data.venue}</span>}
        {!data.name && !data.date && !data.venue && <span className="setup-topbar-name" style={{ opacity: 0.6 }}>New Competition</span>}
      </div>
      <div className="setup-topbar-right">
        <span className="setup-topbar-sync">Draft</span>
        <button className="btn btn-sm" onClick={handleSaveAndExit} disabled={!canSave}
          style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.3)" }}>
          {canProceed ? (isExisting ? "Save & Update →" : "Save & Create →") : "Save & Exit →"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {topbar}

      <div className="setup-content" style={{ padding: "40px", maxWidth: 1200 }}>
      {/* Intro */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          Create your competition
        </div>
        <div style={{ fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.6, fontFamily: "var(--font-display)" }}>
          Set up your event details below. Once complete, you'll be able to add gymnasts, assign levels, and get everything ready for competition day.
        </div>
      </div>

      {/* Basic Info */}
      <div className="card" id="setup-basic">
        <div className="card-title">Basic Information</div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Competition Name</label>
            <input className="input" placeholder="e.g. Spring Invitational 2025"
              value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Competition Holder's Name</label>
            <input className="input" placeholder="e.g. Sarah Mitchell"
              value={data.holder || ""} onChange={e => setData(d => ({ ...d, holder: e.target.value }))} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Date</label>
            <input className={`input ${dateError ? "error" : ""}`} type="date" min={todayStr()}
              value={data.date} onChange={e => handleDate(e.target.value)} />
            {dateError && <div className="field-error">{dateError}</div>}
          </div>
          <div className="field">
            <label className="label">Venue</label>
            <AddressLookup
              value={data.venue || ""}
              onChange={v => setData(d => ({ ...d, venue: v, location: v }))}
              placeholder="Search by venue name, address or postcode…"
            />
          </div>
        </div>
        <div className="field">
          <label className="label">Organising Club / Organisation Name</label>
          <ClubPicker
            value={data.organiserName || ""}
            onChange={v => setData(d => ({ ...d, organiserName: v }))}
            placeholder="e.g. Midlands Gymnastics Club"
          />
        </div>
      </div>

      {/* Competition configuration — foundational scoring settings, ahead of
          the level list they shape */}
      <CompConfigSections data={data} setData={setData} scores={scores} eventStatus={eventStatus} />

      {/* Skill Levels */}
      <div className="card" id="setup-levels">
        <div className="card-title">Skill Levels</div>
        {(data.scoringMode || "fig") === "nga" ? (<>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
            NGA mode uses the official NGA UK level hierarchy. Tick the levels your competition will include.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {NGA_LEVELS.map(name => {
              const isSelected = data.levels.some(l => l.name === name);
              return (
                <label key={name} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                  background: isSelected ? "rgba(0,13,255,0.04)" : "var(--bg)",
                  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius)", cursor: "pointer", fontSize: 13,
                  color: isSelected ? "var(--accent)" : "var(--text)", transition: "all 0.2s", userSelect: "none"
                }}>
                  <input type="checkbox" checked={isSelected} onChange={() => {
                    if (isSelected) {
                      setData(d => ({ ...d, levels: d.levels.filter(l => l.name !== name) }));
                    } else {
                      // Insert in NGA_LEVELS order
                      setData(d => {
                        const next = [...d.levels, { id: generateId(), name, rankBy: "level" }];
                        next.sort((a, b) => NGA_LEVELS.indexOf(a.name) - NGA_LEVELS.indexOf(b.name));
                        return { ...d, levels: next };
                      });
                    }
                  }} style={{ display: "none" }} />
                  <span style={{ fontWeight: isSelected ? 600 : 400 }}>{name}</span>
                  {isSelected && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Rank by:</span>
                      <select className="select" style={{ width: "auto", padding: "4px 32px 4px 12px", fontSize: 12 }}
                        value={data.levels.find(l => l.name === name)?.rankBy || "level"}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); updateLevelRank(data.levels.find(l => l.name === name)?.id, e.target.value); }}>
                        <option value="level">Level only</option>
                        <option value="level+age">Level + Age</option>
                      </select>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Ranks:</span>
                      {rankScopeSelect(data.levels.find(l => l.name === name))}
                    </div>
                  )}
                </label>
              );
            })}
          </div>
        </>) : (<>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Add from UK Gymnastics list</label>
            <select className="select" value={newLevel}
              onChange={e => { setNewLevel(e.target.value); if (e.target.value && e.target.value !== "__custom__") addLevelFromDropdown(e.target.value); }}>
              <option value="">— Select a level —</option>
              {UK_LEVELS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.filter(o => !data.levels.find(l => l.name === o)).map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {newLevel !== "__custom__"
            ? <button className="btn btn-ghost" style={{ alignSelf: "flex-start", marginBottom: 12 }} onClick={() => setNewLevel("__custom__")}>＋ Add custom level</button>
            : <div className="inline-row" style={{ marginBottom: 12 }}>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <input className="input" placeholder="Custom level name" value={customLevel}
                    onChange={e => setCustomLevel(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addLevel()}
                    autoFocus />
                </div>
                <button className="btn btn-secondary" onClick={() => addLevel()}>Add</button>
                <button className="btn btn-ghost" onClick={() => { setNewLevel(""); setCustomLevel(""); }}>Cancel</button>
              </div>
          }
          {data.levels.map(l => (
            <div className="list-item list-item-level" key={l.id}>
              <div className="list-item-content" style={{ flex: "1 1 auto", minWidth: 0 }}><strong>{l.name}</strong></div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Rank by:</span>
                <select className="select" style={{ width: "auto", padding: "4px 32px 4px 12px", fontSize: 12 }}
                  value={l.rankBy} onChange={e => updateLevelRank(l.id, e.target.value)}>
                  <option value="level">Level only</option>
                  <option value="level+age">Level + Age</option>
                </select>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Ranks:</span>
                {rankScopeSelect(l)}
              </div>
              <button className="btn-icon" onClick={() => setPendingRemove({ type: "level", id: l.id, msg: `Remove level "${l.name}"? Gymnasts assigned will lose their level.` })}>×</button>
            </div>
          ))}
          {!data.levels.length && <div className="empty">No levels added yet</div>}
        </>)}
      </div>

      {/* Apparatus */}
      <div className="card" id="setup-apparatus">
        <div className="card-title">Apparatus</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {APPARATUS_GROUPS.map(group => {
            const tag = group.label.split(" ")[0]; // WAG or MAG
            return (
              <div key={group.label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", fontFamily: "var(--font-display)", marginBottom: 8 }}>{group.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {group.items.map(a => {
                    const key = `${a} (${tag})`;
                    const checked = data.apparatus.includes(key);
                    return (
                      <label key={key} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                        background: checked ? "rgba(0,13,255,0.04)" : "var(--bg)",
                        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "var(--radius)", cursor: "pointer", fontSize: 13,
                        color: checked ? "var(--accent)" : "var(--text)", transition: "all 0.2s", userSelect: "none"
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleApparatus(key, checked)} style={{ display: "none" }} />
                        {a}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {data.apparatus.length >= 2 && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0", fontFamily: "var(--font-display)" }}>
            Each rotation's apparatus order is set on the Rounds &amp; Rotations page.
          </p>
        )}
        {realApparatus.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0", fontFamily: "var(--font-display)" }}>
            Rest slots are set per round on the Rounds &amp; Rotations page — each rest adds one rotation beyond the apparatus.
          </p>
        )}
      </div>

      {/* Age Ranges */}
      <div className="card" id="setup-ages">
        <div className="card-title">Age Ranges</div>
        <div className="inline-row" style={{ marginBottom: 14 }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <input className="input" placeholder="e.g. Under 9, Junior, 9-10 years"
              value={newAgeRange}
              onChange={e => setNewAgeRange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addAgeRange(); }} />
          </div>
          <button className="btn btn-secondary" onClick={addAgeRange}>Add</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(data.ageRanges || []).map((a, idx) => (
            <div key={idx} className="chip">
              {editingAgeIdx === idx ? (
                <>
                  <input className="club-edit-input" value={editingAgeVal}
                    onChange={e => setEditingAgeVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveAgeEdit(idx); if (e.key === "Escape") setEditingAgeIdx(null); }}
                    autoFocus />
                  <button onClick={() => saveAgeEdit(idx)} style={{ color: "var(--success)" }}>✓</button>
                  <button onClick={() => setEditingAgeIdx(null)}>×</button>
                </>
              ) : (
                <>
                  <span>{a}</span>
                  <button onClick={() => { setEditingAgeIdx(idx); setEditingAgeVal(a); }}
                    style={{ fontSize: 12, color: "var(--muted)" }}>✏️</button>
                  <button onClick={() => removeAgeRange(idx)}>×</button>
                </>
              )}
            </div>
          ))}
          {!(data.ageRanges || []).length && (
            <span style={{ color: "var(--muted)", fontSize: 13 }}>No age ranges added yet</span>
          )}
        </div>
      </div>

      {/* Branding */}
      <div className="card" id="setup-branding">
        <div className="card-title">Branding</div>
        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 16 }}>
          Add your competition logo and brand colour. These will appear on results, exports, and live displays.
        </p>

        {/* Brand colour picker */}
        <div className="field" style={{ marginBottom: 20 }}>
          <label className="label">Brand Colour</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="color" value={data.brandColor || "#000dff"}
              onChange={e => setData(d => ({ ...d, brandColor: e.target.value }))}
              style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", padding: 2 }} />
            <input className="input" placeholder="#000dff" value={data.brandColor || ""}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") setData(d => ({ ...d, brandColor: v }));
              }}
              style={{ width: 120, fontFamily: "monospace", fontSize: 13 }} />
            {data.brandColor && (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => setData(d => ({ ...d, brandColor: "" }))}>Clear</button>
            )}
          </div>
        </div>

        {/* Logo upload */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="label">Competition Logo</label>
          <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.svg" style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); e.target.value = ""; }} />

          {data.brandLogoUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 12, border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                background: "var(--bg)"
              }}>
                <img src={data.brandLogoSvgUrl || data.brandLogoUrl} alt="Logo"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => logoInputRef.current?.click()}>
                  Replace
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "var(--danger, #e53e3e)" }}
                  onClick={handleRemoveLogo}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => !logoUploading && logoInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border)"; if (e.dataTransfer.files?.[0]) handleLogoUpload(e.dataTransfer.files[0]); }}
              style={{
                border: "2px dashed var(--border)", borderRadius: 12, padding: "24px 16px",
                textAlign: "center", cursor: logoUploading ? "wait" : "pointer",
                transition: "border-color 0.2s"
              }}>
              {logoUploading ? (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Uploading…</span>
              ) : (
                <>
                  <div style={{ fontSize: 24, marginBottom: 4, color: "var(--muted)" }}>+</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Click or drag to upload</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>PNG, JPEG or SVG — max 2 MB</div>
                </>
              )}
            </div>
          )}
          {logoError && <div className="field-error" style={{ marginTop: 6 }}>{logoError}</div>}
        </div>

        {/* Live preview */}
        {(data.brandColor || data.brandLogoUrl) && (
          <>
            <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }} />
            <label className="label" style={{ marginBottom: 8 }}>Preview</label>
            <div style={{
              background: data.brandColor || "var(--brand-01)", borderRadius: 12,
              padding: "20px 24px", display: "flex", alignItems: "center", gap: 16,
              transition: "background 0.2s"
            }}>
              {data.brandLogoUrl && (
                <div style={{
                  width: 48, height: 48, borderRadius: 8, overflow: "hidden",
                  background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                  <img src={data.brandLogoSvgUrl || data.brandLogoUrl} alt=""
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
              )}
              <div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
                  color: data.brandColor ? getContrastTextColor(data.brandColor) : "#fff"
                }}>
                  {data.name || "Competition Name"}
                </div>
                {data.date && (
                  <div style={{
                    fontSize: 12, marginTop: 2,
                    color: data.brandColor ? getContrastTextColor(data.brandColor) : "#fff",
                    opacity: 0.8
                  }}>
                    {new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showWarnings && missingFields.length > 0 && (
        <div style={{ margin: "0 0 16px", padding: "14px 18px", borderRadius: 12,
          background: "rgba(229,62,62,0.06)", border: "1px solid rgba(229,62,62,0.25)",
          fontSize: 13, color: "#c53030" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Enter a competition name to save your progress</div>
        </div>
      )}

      {/* Data consent */}
      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "16px 18px",
        background: data.dataConsentConfirmed ? "rgba(0,13,255,0.03)" : "var(--surface2)",
        border: `1px solid ${data.dataConsentConfirmed ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12, cursor: "pointer", userSelect: "none", marginBottom: 16, transition: "all 0.2s"
      }}>
        <input type="checkbox" checked={!!data.dataConsentConfirmed}
          onChange={e => setData(d => ({ ...d, dataConsentConfirmed: e.target.checked }))}
          style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0, width: 16, height: 16 }} />
        <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--font-display)", lineHeight: 1.5 }}>
          I confirm I have obtained permission to enter competitor data for this event in accordance with data protection requirements.
        </span>
      </label>

      <div className="step-nav">
        <div />
        <button className="btn btn-primary" onClick={handleSaveAndExit} disabled={!canSave}>
          {canProceed ? (isExisting ? "Save & Update →" : "Save & Create →") : "Save & Exit →"}
        </button>
      </div>

      {pendingRemove && (
        <ConfirmModal message={pendingRemove.msg} onConfirm={doRemove} onCancel={() => setPendingRemove(null)} />
      )}
      </div>
    </div>
  );
}

export default Step1_CompDetails;
