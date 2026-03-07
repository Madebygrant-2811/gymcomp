import { useState, useRef, useEffect } from "react";
import { UK_CLUBS } from "../../lib/constants.js";

function ClubPicker({ value, onChange, onSelect, placeholder, onKeyDown: externalKeyDown, style, autoFocus }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestions([]); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val) => {
    setQuery(val);
    if (onChange) onChange(val);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    const q = val.toLowerCase();
    const startsWith = UK_CLUBS.filter(c => c.name.toLowerCase().startsWith(q));
    const contains = UK_CLUBS.filter(c => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    setSuggestions([...startsWith, ...contains].slice(0, 8));
  };

  const pick = (name) => { setQuery(onSelect ? "" : name); if (onChange) onChange(name); if (onSelect) onSelect(name); setSuggestions([]); };

  return (
    <div ref={wrapRef} style={{ position: "relative", ...(style || {}) }}>
      <input className="input" placeholder={placeholder || "Type to search clubs…"}
        value={query} onChange={e => handleChange(e.target.value)} autoFocus={autoFocus}
        onKeyDown={e => { if (e.key === "Escape") setSuggestions([]); if (externalKeyDown) externalKeyDown(e); }} />
      {suggestions.length > 0 && (
        <div className="pc-dropdown" style={{ maxHeight: 240, overflowY: "auto" }}>
          {suggestions.map(c => (
            <div key={c.name} className="pc-option" onClick={() => pick(c.name)}>
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              {c.locations.length > 0 && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{c.locations.join(", ")}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================

export default ClubPicker;
