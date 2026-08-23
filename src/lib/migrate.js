import { APPARATUS_OPTIONS, APPARATUS_MIGRATE, DEFAULT_ROUND_AGENDA, sortApparatus } from "./constants.js";
import { generateId, normalizeStr, generateClubCode } from "./utils.js";

export function migrateApparatus(list) {
  if (!list || !list.length) return list;
  return list.map(a => APPARATUS_OPTIONS.includes(a) ? a : (APPARATUS_MIGRATE[a] || a));
}

export function migrateCompData(cd) {
  if (!cd) return cd;
  const migrated = { ...cd };
  if (!migrated.scoringMode) migrated.scoringMode = 'fig';
  // Execution baseline for FIG scoring (E = eScoreStart − deduction)
  if (migrated.eScoreStart === undefined) migrated.eScoreStart = 10;
  // Vault mode replaces the old "Excel level => dual vault" auto-detection.
  // Absent => single; an existing comp with any Excel level => average (its
  // prior dual-vault behaviour). Reuses the same "excel" name heuristic.
  if (!migrated.vaultMode) {
    const hasExcelLevel = (migrated.levels || []).some(l => (l.name || "").toLowerCase().includes("excel"));
    migrated.vaultMode = hasExcelLevel ? 'average' : 'single';
  }
  // Apparatus always follow the standard competition order (WAG: Vault, Beam,
  // Bars, Floor, Range; MAG: Olympic order) — the order is fixed, whatever
  // subset is selected.
  if (migrated.apparatus) migrated.apparatus = sortApparatus(migrateApparatus(migrated.apparatus));
  // Rests are per-round slots now (restsByRound: roundId → count), each adding
  // one rotation beyond the apparatus count. The old competition-wide "Rest"
  // apparatus entry migrates to one rest slot on every round.
  if ((migrated.apparatus || []).includes("Rest")) {
    migrated.apparatus = migrated.apparatus.filter(a => a !== "Rest");
    if (!migrated.restsByRound) {
      migrated.restsByRound = {};
      (migrated.rounds || []).forEach(r => { migrated.restsByRound[r.id] = 1; });
    }
  }
  if (!migrated.restsByRound) migrated.restsByRound = {};
  // Per-round base cycle order (Rotation 1's sequence; others cascade from it)
  if (!migrated.cycleByRound) migrated.cycleByRound = {};
  // Per-round agenda (ordered { id, label, start, end } entries). Every
  // competition defaults to the standard items — round timings are driven by
  // them, so a round without agenda items has no way to set times. Legacy
  // hand-set round times are backfilled into the items (round start onto the
  // first item, round end onto the last), otherwise the derived window would
  // show times that exist in no editable field.
  if (migrated.rounds) migrated.rounds = migrated.rounds.map(r => {
    let agenda = (r.agenda && r.agenda.length > 0)
      ? r.agenda
      : DEFAULT_ROUND_AGENDA.map(label => ({ id: generateId(), label, start: "", end: "" }));
    const hasItemTimes = agenda.some(e => e.start || e.end);
    if (!hasItemTimes && (r.start || r.end)) {
      agenda = agenda.map(e => ({ ...e }));
      if (r.start) agenda[0].start = r.start;
      if (r.end && agenda.length > 1) agenda[agenda.length - 1].start = r.end;
    }
    return agenda === r.agenda ? r : { ...r, agenda };
  });
  if (migrated.judges) migrated.judges = migrated.judges.map(j => ({
    ...j,
    id: j.id || generateId(),
    apparatus: APPARATUS_OPTIONS.includes(j.apparatus) ? j.apparatus : (APPARATUS_MIGRATE[j.apparatus] || j.apparatus),
    // Qualification level (from JUDGE_LEVELS) and contact email — existing
    // judges migrate with both empty. Email is never exported or published.
    level: j.level ?? "",
    email: j.email ?? "",
  }));
  // Ensure clubs have IDs and clubCodes
  if (migrated.clubs) {
    const existingCodes = migrated.clubs.map(c => c.clubCode).filter(Boolean);
    migrated.clubs = migrated.clubs.map(c => {
      const club = typeof c === "string" ? { id: generateId(), name: c } : { ...c, id: c.id || generateId() };
      if (!club.clubCode) {
        club.clubCode = generateClubCode(existingCodes);
        existingCodes.push(club.clubCode);
      }
      return club;
    });
  }
  // Default allowSubmissions to true for existing comps
  if (migrated.allowSubmissions === undefined) migrated.allowSubmissions = true;
  // Default groupsByRound for existing comps
  if (!migrated.groupsByRound) migrated.groupsByRound = {};
  // Per-group apparatus orders, keyed by round id then group name. Absent for
  // existing comps — rounds with no stored entry fall back to the cascade.
  if (!migrated.rotations) migrated.rotations = {};
  // Default branding fields
  if (migrated.brandColor === undefined) migrated.brandColor = "";
  if (migrated.brandLogoUrl === undefined) migrated.brandLogoUrl = "";
  if (migrated.brandLogoSvgUrl === undefined) migrated.brandLogoSvgUrl = "";
  // Clean stray keys from duplicate
  delete migrated.gymnasts;
  return migrated;
}

export function migrateScoreKeys(sc) {
  if (!sc) return sc;
  const migrated = {};
  for (const [key, val] of Object.entries(sc)) {
    let newKey = key;
    for (const [bare, full] of Object.entries(APPARATUS_MIGRATE)) {
      // Only replace bare name at the end of key segment (after __)
      if (newKey.includes(`__${bare}`) && !newKey.includes(`__${full}`)) {
        newKey = newKey.replace(`__${bare}`, `__${full}`);
      }
    }
    migrated[newKey] = val;
  }
  return migrated;
}

export function migrateGymnasts(list) {
  if (!list || !list.length) return list;
  return list.map(g => ({ ...g, name: normalizeStr(g.name), age: normalizeStr(g.age), group: normalizeStr(g.group), club: normalizeStr(g.club) }));
}
