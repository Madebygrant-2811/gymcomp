// ============================================================
// MOBILE TAB BAR
// ============================================================
function MobileTabBar({ screen, phase, step, setStep, onNew, onMyEvents, onEditSetup, onManageGymnasts, onStartComp, onDashboard, onSettings, onSave, saveLabel, eventStatus }) {
  const icons = {
    plus: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
    account: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>,
    home: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l6-5.5L14 8M3.5 9v4.5a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>,
    save: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 14h-9a1 1 0 01-1-1V3a1 1 0 011-1h7l3 3v9a1 1 0 01-1 1z"/><path d="M10 14V9H6v5M6 2v3h5"/></svg>,
    edit: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>,
    users: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/></svg>,
    play: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>,
    score: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 2v12"/></svg>,
    trophy: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6v5a3 3 0 01-6 0V2zM8 10v3M5 13h6"/></svg>,
    doc: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/></svg>,
    mic: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="6" height="8" rx="3"/><path d="M3 8a5 5 0 0010 0M8 13v2"/></svg>,
    back: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>,
  };

  const Tab = ({ icon, label, active, onClick }) => (
    <button className={`mtb-tab${active ? " active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  const D = () => <div className="mtb-divider" />;

  return (
    <div className="mobile-tab-bar">
      {screen === "org-dashboard" && (<>
        <Tab icon={icons.plus} label="New" onClick={onNew} />
        <D />
        <Tab icon={icons.account} label="Account" onClick={onSettings} />
      </>)}

      {screen === "active" && phase === 1 && (<>
        <Tab icon={icons.home} label="My Events" onClick={onMyEvents} />
        <D />
        <Tab icon={icons.save} label={saveLabel || "Save"} onClick={onSave} />
      </>)}

      {screen === "active" && phase === "dashboard" && (<>
        <Tab icon={icons.home} label="My Events" onClick={onMyEvents} />
        {eventStatus !== "completed" && (<>
          <D />
          <Tab icon={icons.edit} label="Edit" onClick={onEditSetup} />
          <D />
          <Tab icon={icons.users} label="Gymnasts" onClick={onManageGymnasts} />
          <D />
          <Tab icon={icons.play} label="Start" onClick={onStartComp} />
        </>)}
      </>)}

      {screen === "active" && phase === "gymnasts" && (<>
        <Tab icon={icons.back} label="Back to Comp" onClick={onDashboard} />
      </>)}

      {screen === "active" && phase === 2 && (<>
        <Tab icon={icons.score} label="Scores" active={step === 1} onClick={() => setStep(1)} />
        <D />
        <Tab icon={icons.trophy} label="Results" active={step === 2} onClick={() => setStep(2)} />
        <D />
        <Tab icon={icons.doc} label="Exports" active={step === 3} onClick={() => setStep(3)} />
      </>)}
    </div>
  );
}


export default MobileTabBar;
