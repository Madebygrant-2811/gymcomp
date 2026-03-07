import { useState, useRef, useEffect } from "react";
import { UK_CLUBS } from "../../lib/constants.js";

function ClubSearch({ value, onChange, onAdd }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [expanded, setExpanded] = useState(null); // club name being expanded for location pick
  const wrapRef = useRef(null);

  useEffect(() => {
    if (value === "") { setQuery(""); setSuggestions([]); setExpanded(null); }
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setSuggestions([]);
        setExpanded(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val) => {
    setQuery(val);
    onChange(val);
    setExpanded(null);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    const q = val.toLowerCase();
    const startsWith = UK_CLUBS.filter(c => c.name.toLowerCase().startsWith(q));
    const contains = UK_CLUBS.filter(c => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    setSuggestions([...startsWith, ...contains].slice(0, 10));
  };

  const selectWithLocation = (name, location) => {
    const display = location ? `${name} (${location})` : name;
    setQuery(display);
    onChange(display);
    setSuggestions([]);
    setExpanded(null);
  };

  const handleClubClick = (club) => {
    if (club.locations.length === 1) {
      selectWithLocation(club.name, club.locations[0]);
    } else {
      // Toggle expansion to show location sub-options
      setExpanded(prev => prev === club.name ? null : club.name);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { onAdd(); setQuery(""); setSuggestions([]); setExpanded(null); }
    if (e.key === "Escape") { setSuggestions([]); setExpanded(null); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1 }}>
      <input
        className="input"
        placeholder="Type to search clubs…"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {suggestions.length > 0 && (
        <div className="pc-dropdown">
          {suggestions.map(c => (
            <div key={c.name}>
              <div
                className="pc-option"
                onClick={() => handleClubClick(c)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {c.locations.length === 1
                      ? c.locations[0]
                      : <span style={{ color: "var(--accent)", fontWeight: 500 }}>{c.locations.length} locations — select one ›</span>
                    }
                  </div>
                </div>
                {c.locations.length > 1 && (
                  <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
                    {expanded === c.name ? "▲" : "▼"}
                  </span>
                )}
              </div>
              {expanded === c.name && (
                <div style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
                  {c.locations.map(loc => (
                    <div
                      key={loc}
                      className="pc-option"
                      onClick={() => selectWithLocation(c.name, loc)}
                      style={{ paddingLeft: 24, fontSize: 13, color: "var(--text)" }}
                    >
                      <span style={{ marginRight: 6, color: "var(--muted)" }}>📍</span>{loc}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ClubSearch;
