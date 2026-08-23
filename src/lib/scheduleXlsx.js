// XLSX schedule export/import for the Rounds & Groups page. One sheet per
// round, named after the round, holding three sections marked by a keyword in
// column A: AGENDA (label, start, end), ROTATIONS (group name against
// apparatus position) and GYMNASTS (name, club, level, age in per-rotation
// blocks — the block a row sits under is its group, and row order within a
// group is the running order, from which numbers are allocated on save). The
// parser locates sections by scanning column A for the keywords, so inserted
// rows and resized columns don't break it; GYMNASTS columns are resolved from
// the section's header row when present. Nothing here writes state:
// parseScheduleXLSX returns a plan the page previews and applies only on
// confirmation.

import * as XLSX from "xlsx";
import { generateId, normalizeStr } from "./utils.js";
import { roundGroups, effectiveRotations, roundRunningOrderCompare } from "./rotations.js";

const normKey = (s) => normalizeStr(String(s ?? "")).toLowerCase();

// Reference sheet listing every uploaded gymnast; never parsed on import.
export const DETAILS_SHEET = "Gymnasts Details";

// Excel sheet names: max 31 chars, no \ / ? * [ ] :
const sanitizeSheetName = (name) =>
  String(name || "").replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);

function uniqueSheetName(name, used) {
  const base = sanitizeSheetName(name) || "Round";
  let candidate = base;
  let n = 2;
  while (used.has(normKey(candidate))) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(normKey(candidate));
  return candidate;
}

// ── Export ──────────────────────────────────────────────────────────────────
// Writes the competition's current schedule so the file is an editable copy.
// Requires gymnasts to have been uploaded first — returns false (writing
// nothing) when the competition has none.
// Note: section titles stay uppercase for emphasis; real bold styling is not
// supported by the SheetJS community build this app bundles.
export function exportScheduleXLSX(compData, gymnasts) {
  if (!gymnasts || gymnasts.length === 0) return false;
  const wb = XLSX.utils.book_new();
  const used = new Set();
  used.add(normKey(DETAILS_SHEET)); // reserved for the Gymnasts Details sheet
  const levelName = (id) => (compData.levels || []).find((l) => l.id === id)?.name || id || "";

  (compData.rounds || []).forEach((round, ri) => {
    const rows = [];
    const sectionBreak = () => { rows.push([]); rows.push([]); };

    rows.push(["AGENDA"]);
    rows.push(["Label", "Time"]);
    (round.agenda || []).forEach((e) => rows.push([e.label || "", e.start || ""]));
    sectionBreak();

    const groups = roundGroups(compData, round.id);
    const eff = effectiveRotations(compData, round.id);
    rows.push(["ROTATIONS"]);
    const maxLen = Math.max(0, ...groups.map((g) => (eff[g] || []).length));
    rows.push(["Rotation", ...Array.from({ length: maxLen }, (_, i) => String(i + 1))]);
    groups.forEach((g) => rows.push([g, ...(eff[g] || [])]));
    sectionBreak();

    rows.push(["GYMNASTS"]);
    // One block per rotation: the rotation name as a banner, its starting
    // apparatus on its own "Starts on:" line, then a header and the running
    // order. The block a row sits under drives the gymnast's group — there is
    // no Group column, and no Number column either: numbers are allocated
    // from the running order (row order) on save. Banners, "Starts on:" lines
    // and repeated headers are recognised by the parser and never read as
    // gymnast data.
    const gymnastHeader = ["Name", "Club", "Level", "Age"];
    const roundGymnasts = gymnasts
      .filter((g) => g.round === round.id)
      .sort(roundRunningOrderCompare(compData, round.id));
    const pushBlock = (banner, startApp, members) => {
      rows.push([]);
      rows.push([]);
      rows.push([banner]);
      if (startApp) rows.push([`Starts on: ${startApp}`]);
      rows.push(gymnastHeader);
      members.forEach((g) => rows.push([g.name || "", g.club || "", levelName(g.level), g.age || ""]));
    };
    groups.forEach((g) => {
      pushBlock(g, (eff[g] || [])[0], roundGymnasts.filter((x) => x.group === g));
    });
    const stray = roundGymnasts.filter((x) => !groups.includes(x.group || ""));
    if (stray.length) pushBlock("Unassigned", null, stray);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 26 }, { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(round.name || `Round ${ri + 1}`, used));
  });

  // Gymnasts Details — every uploaded gymnast, matching the columns collected
  // at upload. Reference only: the importer ignores this sheet.
  const detailRows = [["GYMNASTS DETAILS"], ["Name", "Club", "Level", "Age"]];
  [...gymnasts]
    .sort((a, b) => (a.club || "").localeCompare(b.club || "") || (a.name || "").localeCompare(b.name || ""))
    .forEach((g) => detailRows.push([g.name || "", g.club || "", levelName(g.level), g.age || ""]));
  const detailsWs = XLSX.utils.aoa_to_sheet(detailRows);
  detailsWs["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 14 }];
  // Filter dropdowns on the header row (row 2), spanning all data rows
  detailsWs["!autofilter"] = { ref: `A2:D${detailRows.length}` };
  XLSX.utils.book_append_sheet(wb, detailsWs, DETAILS_SHEET);

  const fname = `${(compData.name || "competition").replace(/[^a-zA-Z0-9]/g, "_")}_schedule.xlsx`;
  XLSX.writeFile(wb, fname);
  return true;
}

// ── Import ──────────────────────────────────────────────────────────────────

// First-cell spellings that mark a section's header row. Number-first
// spellings stay so older exports that carried a Number column still parse.
const SECTION_HEADS = {
  AGENDA: ["label"],
  ROTATIONS: ["rotation", "group"],
  GYMNASTS: ["name", "number", "no", "no.", "#"],
};

// Split a sheet's rows into keyword-marked sections. A row whose column A is
// exactly a keyword (case/whitespace insensitive) starts that section; blank
// rows are skipped. Each section keeps its header row separately (when
// present) so column positions can be resolved from it.
function splitSections(rows) {
  const sections = {};
  let current = null;
  rows.forEach((row) => {
    const a = normalizeStr(String(row[0] ?? "")).toUpperCase();
    if (SECTION_HEADS[a] !== undefined) {
      current = a;
      if (!sections[current]) sections[current] = { header: null, rows: [] };
      return;
    }
    if (!current || !row.some((c) => normalizeStr(String(c ?? "")))) return;
    const sec = sections[current];
    if (!sec.header && sec.rows.length === 0 && SECTION_HEADS[current].includes(normKey(row[0]))) {
      sec.header = row;
      return;
    }
    sec.rows.push(row);
  });
  return sections;
}

// Column index for one of `names` in a header row; `fallback` when the
// section has no header or none of the names appear.
function colIdx(header, names, fallback) {
  if (header) {
    const i = header.findIndex((c) => names.includes(normKey(c)));
    if (i !== -1) return i;
  }
  return fallback;
}

// "9:00", "09:00:00", "9.00", "9:00 pm" → "HH:MM". "" for empty; null when
// the cell has text that isn't recognisable as a time.
function parseTime(v) {
  const s = normalizeStr(String(v ?? ""));
  if (!s) return "";
  const m = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = (m[3] || "").toLowerCase();
  if (ap.startsWith("p") && h < 12) h += 12;
  if (ap.startsWith("a") && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Parse a schedule workbook against the current competition. Returns a plan:
// { rounds: [{ roundId, roundName, sheetName, blocked, agenda, groups,
//   rotations, assignments, warnings }], unmatchedSheets }. Sections absent
// from a sheet come back null (that aspect stays untouched on apply). Rows
// never create gymnasts — unmatched rows are reported instead.
export function parseScheduleXLSX(data, compData, gymnasts, scores) {
  const wb = XLSX.read(data instanceof ArrayBuffer ? new Uint8Array(data) : data, { type: "array" });
  const rounds = compData.rounds || [];
  const validApparatus = new Set((compData.apparatus || []).filter((a) => a !== "Rest"));

  // This competition's gymnasts by normalised name+club
  const gymByKey = new Map();
  gymnasts.forEach((g) => {
    const k = `${normKey(g.name)}|||${normKey(g.club)}`;
    if (!gymByKey.has(k)) gymByKey.set(k, []);
    gymByKey.get(k).push(g);
  });

  const roundHasScores = (rid) =>
    Object.keys(scores || {}).some((k) => k.startsWith(rid + "__") && parseFloat(scores[k]) > 0);

  const claimedSheets = new Set();
  const claimedGymnasts = new Map(); // gymnast id → sheet that assigned them
  const planRounds = [];

  rounds.forEach((round) => {
    // Match sheets to rounds by name, case and whitespace insensitive (also
    // accepting the sanitised form our own export writes).
    const candidates = new Set([normKey(round.name), normKey(sanitizeSheetName(round.name))]);
    const sheetNm = wb.SheetNames.find((n) => !claimedSheets.has(n) && candidates.has(normKey(n)));
    if (!sheetNm) return;
    claimedSheets.add(sheetNm);

    const warnings = [];
    const blocked = roundHasScores(round.id);
    const entry = {
      roundId: round.id,
      roundName: round.name,
      sheetName: sheetNm,
      blocked,
      agenda: null,
      groups: null,
      rotations: null,
      assignments: null,
      warnings,
    };

    // A blocked round's sheet is not parsed at all — it must not claim
    // gymnasts away from other sheets or surface warnings for changes that
    // will never be applied.
    if (blocked) {
      warnings.push(`Scores have already been submitted for ${round.name} — this sheet will not be applied.`);
      planRounds.push(entry);
      return;
    }

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetNm], { header: 1, raw: false, defval: "" });
    const sections = splitSections(rows);

    // AGENDA — label, start, end per row
    if (sections.AGENDA) {
      const agenda = [];
      sections.AGENDA.rows.forEach((row) => {
        const label = normalizeStr(String(row[0] ?? ""));
        const rawStart = normalizeStr(String(row[1] ?? ""));
        const rawEnd = normalizeStr(String(row[2] ?? ""));
        if (!label && !rawStart && !rawEnd) return;
        const start = parseTime(row[1]);
        const end = parseTime(row[2]);
        if (start === null) warnings.push(`Agenda: unrecognised start time "${rawStart}" for "${label || "(no label)"}" — left empty`);
        if (end === null) warnings.push(`Agenda: unrecognised end time "${rawEnd}" for "${label || "(no label)"}" — left empty`);
        agenda.push({ id: generateId(), label, start: start || "", end: end || "" });
      });
      entry.agenda = agenda;
    }

    // ROTATIONS — one row per group: group name, then apparatus in order
    const existingGroups = roundGroups(compData, round.id);
    if (sections.ROTATIONS) {
      const groups = [];
      const rotations = {};
      sections.ROTATIONS.rows.forEach((row) => {
        const gName = normalizeStr(String(row[0] ?? ""));
        if (!gName) return;
        if (groups.includes(gName)) {
          warnings.push(`Rotations: duplicate rotation "${gName}" — first row kept`);
          return;
        }
        const order = [];
        row.slice(1).forEach((cell) => {
          const app = normalizeStr(String(cell ?? ""));
          if (!app) return;
          // Rest slots are legitimate cycle entries and may repeat
          if (normKey(app) === "rest") { order.push("Rest"); return; }
          if (!validApparatus.has(app)) {
            warnings.push(`Rotations: apparatus "${app}" is not in this competition — skipped`);
            return;
          }
          if (order.includes(app)) {
            warnings.push(`Rotations: "${gName}" lists ${app} twice — duplicate skipped`);
            return;
          }
          order.push(app);
        });
        groups.push(gName);
        rotations[gName] = order;
        if (!existingGroups.includes(gName)) warnings.push(`Rotation "${gName}" is not currently in use in ${round.name} — it will be added`);
      });
      entry.groups = groups;
      entry.rotations = rotations;
    }

    // GYMNASTS — one block per rotation: the block's banner row names the
    // group, an optional "Starts on:" line notes its first apparatus, then a
    // header and data rows (name, club, level, age). The block a row sits
    // under drives its group; a legacy Group column, when present, still
    // takes precedence so older files import unchanged. Row order in a group
    // is the running order — numbers are allocated from it on save, so a
    // legacy Number column is simply ignored.
    if (sections.GYMNASTS) {
      const finalGroups = entry.groups || existingGroups;
      const assignments = [];
      const perGroupCount = {};
      // The export repeats the header above every rotation block — treat any
      // header-lookalike row as decoration, and adopt the first one found as
      // the column map when the section-level detection didn't catch one.
      const isHeaderRow = (row) => {
        const cells = row.map((c) => normKey(c));
        return cells.includes("name") && (cells.includes("club") || cells.includes("group") || cells.includes("level"));
      };
      let h = sections.GYMNASTS.header;
      sections.GYMNASTS.rows.forEach((row) => {
        if (!h && isHeaderRow(row)) h = row;
      });
      const ci = {
        name: colIdx(h, ["name", "gymnast", "gymnast name"], 0),
        club: colIdx(h, ["club"], 1),
      };
      const groupCol = colIdx(h, ["group", "rotation"], -1);
      let currentGroup = "";
      sections.GYMNASTS.rows.forEach((row) => {
        if (isHeaderRow(row)) return;
        const cells = row.map((c) => normalizeStr(String(c ?? "")));
        // A row with content only in column A is block decoration: either the
        // apparatus note or a rotation banner ("Unassigned" clears the group;
        // "Group — Apparatus" banners from older exports still split cleanly).
        if (cells[0] && cells.slice(1).every((c) => !c) && !/^\d+$/.test(cells[0])) {
          if (normKey(cells[0]).startsWith("starts on")) return;
          const banner = normalizeStr(cells[0].split("—")[0]);
          currentGroup = normKey(banner) === "unassigned" ? "" : banner;
          return;
        }
        const name = cells[ci.name] || "";
        const club = cells[ci.club] || "";
        const group = (groupCol !== -1 && cells[groupCol]) || currentGroup;
        if (!name) return;
        const clubLabel = club || "no club";
        const matches = gymByKey.get(`${normKey(name)}|||${normKey(club)}`) || [];
        if (matches.length === 0) {
          warnings.push(`Gymnast "${name}" (${clubLabel}) is not in this competition — row ignored`);
          return;
        }
        if (matches.length > 1) {
          warnings.push(`Gymnast "${name}" (${clubLabel}) matches ${matches.length} competition entries — row ignored`);
          return;
        }
        const g = matches[0];
        if (claimedGymnasts.has(g.id)) {
          warnings.push(`Gymnast "${name}" is already assigned by sheet "${claimedGymnasts.get(g.id)}" — row ignored`);
          return;
        }
        if (!group) {
          warnings.push(`Gymnast "${name}" has no rotation in the sheet — row ignored`);
          return;
        }
        if (!finalGroups.includes(group)) {
          warnings.push(`Gymnast "${name}": rotation "${group}" is not in ${round.name} — row ignored`);
          return;
        }
        claimedGymnasts.set(g.id, sheetNm);
        const idx = perGroupCount[group] || 0;
        perGroupCount[group] = idx + 1;
        assignments.push({ id: g.id, group, orderIndex: idx });
      });
      entry.assignments = assignments;
    }

    planRounds.push(entry);
  });

  // Gymnasts in an imported round but absent from every sheet keep their group
  planRounds.forEach((entry) => {
    if (entry.blocked || !entry.assignments) return;
    const missing = gymnasts.filter((g) => g.round === entry.roundId && !claimedGymnasts.has(g.id));
    if (missing.length) {
      entry.warnings.push(
        `${missing.length} gymnast${missing.length !== 1 ? "s" : ""} currently in ${entry.roundName} ` +
        `${missing.length !== 1 ? "are" : "is"} missing from the sheet and will keep their current rotation: ` +
        missing.map((g) => g.name).join(", ")
      );
    }
  });

  return {
    rounds: planRounds,
    // The Gymnasts Details reference sheet is ours — never flag it as unmatched.
    unmatchedSheets: wb.SheetNames.filter((n) => !claimedSheets.has(n) && normKey(n) !== normKey(DETAILS_SHEET)),
  };
}
