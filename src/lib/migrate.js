import { APPARATUS_OPTIONS, APPARATUS_MIGRATE } from "./constants.js";
import { generateId, normalizeStr, generateClubCode } from "./utils.js";

export function migrateApparatus(list) {
  if (!list || !list.length) return list;
  return list.map(a => APPARATUS_OPTIONS.includes(a) ? a : (APPARATUS_MIGRATE[a] || a));
}

export function migrateCompData(cd) {
  if (!cd) return cd;
  const migrated = { ...cd };
  if (!migrated.scoringMode) migrated.scoringMode = 'fig';
  if (migrated.apparatus) migrated.apparatus = migrateApparatus(migrated.apparatus);
  if (migrated.judges) migrated.judges = migrated.judges.map(j => ({
    ...j,
    id: j.id || generateId(),
    apparatus: APPARATUS_OPTIONS.includes(j.apparatus) ? j.apparatus : (APPARATUS_MIGRATE[j.apparatus] || j.apparatus)
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
