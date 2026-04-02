// ============================================================
// PIN HASHING (SHA-256 via Web Crypto API — no dependencies)
// ============================================================
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.toString().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
export const isHashed = (pin) => typeof pin === "string" && pin.length === 64 && /^[0-9a-f]+$/.test(pin);

// ============================================================
// UTILITIES
// ============================================================
export const generateId = () => Math.random().toString(36).substr(2, 9);

export const todayStr = () => new Date().toISOString().split("T")[0];
export const isFutureOrToday = (dateStr) => !!dateStr && dateStr >= todayStr();

// Round to 2dp half-up
export const round2dp = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

// Collapse multiple spaces and trim
export const normalizeStr = (s) => (s || "").replace(/\s+/g, " ").trim();

// Auto-rotate apparatus for all groups: group gi starts at offset gi
export function buildRotations(groups, apparatus, existingRotations) {
  if (!groups.length || !apparatus.length) return existingRotations;
  // Use Group 1's order as the base; cascade remaining groups by shifting
  const base = existingRotations[groups[0]] || apparatus.map((_, ai) => apparatus[ai % apparatus.length]);
  const updated = {};
  groups.forEach((group, gi) => {
    updated[group] = base.map((_, ai) => base[(ai + gi) % base.length]);
  });
  return updated;
}

// Parse CSV text into array of objects
export function parseCSV(text) {
  const lines = text.trim().split("\n").map(l =>
    l.split(",").map(c => normalizeStr(c.replace(/^"|"$/g, "")))
  );
  if (lines.length < 2) return [];
  const headers = lines[0].map(h => h.toLowerCase());
  return lines.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
}

export function downloadTemplate() {
  const headers = ["Name", "Number", "Club", "Level", "Round", "Age", "Group"];
  const rows = [
    ["Jane Smith", "1", "Club Alpha", "Development 1", "Round 1", "9 years", "1"],
    ["Emily Jones", "2", "Club Beta", "Development 2", "Round 1", "10 years", "2"],
  ];
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "gymnast_template.csv"; a.click();
  URL.revokeObjectURL(url);
}
