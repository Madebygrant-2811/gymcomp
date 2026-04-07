import { useState, useRef, useEffect } from "react";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

function AddressLookup({ value, onChange, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("idle");
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const abortRef = useRef(null);
  const sessionTokenRef = useRef(null);

  // Generate a new session token (groups autocomplete + place details into one billing session)
  const getSessionToken = () => {
    if (!sessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  };

  // Load Google Maps JS API if not already loaded
  useEffect(() => {
    if (!GOOGLE_KEY) return;
    if (window.google?.maps?.places) return;
    if (document.querySelector("script[data-google-places]")) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    script.dataset.googlePlaces = "1";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestions([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      // Use REST endpoint for autocomplete
      const params = new URLSearchParams({
        input: q,
        key: GOOGLE_KEY,
        components: "country:gb",
        language: "en",
      });
      const token = getSessionToken();
      if (token) params.set("sessiontoken", token);

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
        { signal: abortRef.current.signal }
      );

      if (res.ok) {
        const data = await res.json();
        const results = (data.predictions || []).map(p => ({
          label: p.structured_formatting?.main_text || p.description,
          sub: p.structured_formatting?.secondary_text || "",
          full: p.description,
          placeId: p.place_id,
          types: p.types || [],
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

  // Fallback: use JS API AutocompleteService if REST fails (CORS)
  const searchViaJsApi = (val) => {
    const q = val.trim();
    if (q.length < 3) { setSuggestions([]); setStatus("idle"); return; }
    if (!window.google?.maps?.places) { search(val); return; }

    setStatus("searching");
    const service = new window.google.maps.places.AutocompleteService();
    service.getPlacePredictions(
      { input: q, componentRestrictions: { country: "gb" }, sessionToken: getSessionToken() },
      (predictions, gStatus) => {
        if (gStatus === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions.map(p => ({
            label: p.structured_formatting?.main_text || p.description,
            sub: p.structured_formatting?.secondary_text || "",
            full: p.description,
            placeId: p.place_id,
            types: p.types || [],
          })));
        } else {
          setSuggestions([]);
        }
        setStatus("idle");
      }
    );
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchViaJsApi(val), 250);
  };

  const select = (s) => {
    const display = s.full || s.label;
    setQuery(display);
    onChange(display);
    setSuggestions([]);
    // Reset session token after selection (per Google billing best practice)
    sessionTokenRef.current = null;
  };

  const iconFor = (types) => {
    if (types.includes("establishment") || types.includes("point_of_interest")) return "📍";
    if (types.includes("postal_code")) return "🏷";
    return "📍";
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          placeholder={placeholder || "Search by venue name, address or postcode\u2026"}
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 3 && searchViaJsApi(query)}
          autoComplete="off"
        />
        {status === "searching" && (
          <div style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "var(--muted)"
          }}>{"\u23F3"}</div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="pc-dropdown" style={{ maxHeight: 280, overflowY: "auto" }}>
          {suggestions.map((s, i) => (
            <div key={i} className="pc-option" onClick={() => select(s)}
              style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{iconFor(s.types)}</span>
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

export default AddressLookup;
