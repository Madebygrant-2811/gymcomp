import { useState, useRef, useEffect } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;


function AddressLookup({ value, onChange, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("idle");
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestions([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cleanup debounce timer and in-flight fetch on unmount
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const search = async (val) => {
    const q = val.trim();
    if (q.length < 3) { setSuggestions([]); setStatus("idle"); return; }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setStatus("searching");

    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=gb&limit=6&types=address,poi,place,postcode,locality&language=en`,
        { signal: abortRef.current.signal }
      );
      if (res.ok) {
        const data = await res.json();
        const results = (data.features || []).map(f => ({
          label: f.place_name.replace(/, United Kingdom$/, ""),
          sub: f.place_type?.[0]?.replace(/_/g, " ") || "",
          type: f.place_type?.[0] || "address",
        }));
        setSuggestions(results);
      } else {
        setSuggestions([]);
      }
      setStatus("idle");
    } catch (e) {
      if (e.name !== "AbortError") {
        setSuggestions([]);
        setStatus("idle");
      }
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  const select = (s) => {
    setQuery(s.label);
    onChange(s.label);
    setSuggestions([]);
  };

  const iconFor = (type) => type === "poi" ? "📍" : type === "postcode" ? "🏷" : "📍";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          placeholder={placeholder || "Search by venue name, address or postcode\u2026"}
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 3 && search(query)}
          autoComplete="off"
        />
        {status === "searching" && (
          <div style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "var(--muted)"
          }}>\u23F3</div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="pc-dropdown" style={{ maxHeight: 280, overflowY: "auto" }}>
          {suggestions.map((s, i) => (
            <div key={i} className="pc-option" onClick={() => select(s)}
              style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{iconFor(s.type)}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================

export default AddressLookup;
