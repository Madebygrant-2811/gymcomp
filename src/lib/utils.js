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

// Club access code: 3 uppercase letters (no I/O) + hyphen + 4 digits → "ABC-1234"
export function generateClubCode(existingCodes = []) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const used = new Set(existingCodes);
  let code;
  do {
    let c = "";
    for (let i = 0; i < 3; i++) c += letters[Math.floor(Math.random() * letters.length)];
    c += "-";
    for (let i = 0; i < 4; i++) c += Math.floor(Math.random() * 10);
    code = c;
  } while (used.has(code));
  return code;
}

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

// WCAG relative-luminance contrast → black or white text
export function getContrastTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.179 ? "#000000" : "#ffffff";
}

// Convert SVG file → PNG blob via Canvas (browser-native, no deps)
export function svgToPng(svgFile, maxWidth = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Failed to load SVG as image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read SVG file"));
    reader.readAsDataURL(svgFile);
  });
}

export function downloadTemplate() {
  const headers = ["Name", "Number", "Club", "Level", "Age"];
  const rows = [
    ["Jane Smith", "1", "Club Alpha", "Development 1", "9 years"],
    ["Emily Jones", "2", "Club Beta", "Development 2", "10 years"],
  ];
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "gymnast_template.csv"; a.click();
  URL.revokeObjectURL(url);
}
