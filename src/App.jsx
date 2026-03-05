import React, { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import GymCompLogo from "./assets/GymComp-Logo.svg";
import GymCompLogotype from "./assets/Logotype.svg";
import GymCompLogomark from "./assets/Logomark.svg";

// ============================================================
// SUPABASE — lightweight REST client (no external imports)
// ============================================================
const SUPABASE_URL = "https://xjuwbgitqsvrmoejvzwb.supabase.co";
const SUPABASE_KEY = "sb_publishable_7jhhejhXAH8hlX-gnsElnA_1ih0G-2f";

// ── Supabase Auth client (official SDK — auth only; data ops use the hand-rolled client below) ──
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_KEY);

const supabase = {
  async upsert(table, record, token = SUPABASE_KEY) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(record),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  async patch(table, id, fields, token = SUPABASE_KEY) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(fields),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  async fetchOne(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { data: null, error: await res.text() };
    const rows = await res.json();
    return { data: rows[0] || null, error: null };
  },
  async fetchList(table, limit = 20) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,data->compData->>name,data->compData->>date,data->compData->>location,created_at&order=created_at.desc&limit=${limit}`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { data: [], error: await res.text() };
    return { data: await res.json(), error: null };
  },
  // Fetch all competitions belonging to the authenticated user
  async fetchListForUser(token, userId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/competitions?user_id=eq.${userId}&select=id,data,status,created_at&order=created_at.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return { data: [], error: await res.text() };
    return { data: await res.json(), error: null };
  },
  // Fetch submissions for a competition
  async fetchSubmissions(compId) {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    console.log("[fetchSubmissions] compId:", compId, "| auth:", session ? "user JWT" : "anon key");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?comp_id=eq.${compId}&order=submitted_at.desc&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[fetchSubmissions] HTTP", res.status, err);
      return { data: [], error: err };
    }
    const data = await res.json();
    console.log("[fetchSubmissions] rows returned:", data.length, data);
    return { data, error: null };
  },
  // Insert a new club submission
  async insertSubmission(submission) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(submission),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  // Update a submission status
  async updateSubmission(id, patch) {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { const err = await res.text(); console.error("[updateSubmission] HTTP error:", err); return { error: err }; }
    const rows = await res.json();
    if (!rows.length) {
      console.error("[updateSubmission] 0 rows updated for id:", id, "— check Supabase RLS policies allow UPDATE on submissions");
      return { error: "No rows updated — the status could not be saved. Check Supabase RLS policies." };
    }
    return { error: null };
  },
  // Fetch a user's profile row — requires session JWT
  async fetchProfile(userId, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) return { data: null, error: await res.text() };
    const rows = await res.json();
    return { data: rows[0] || null, error: null };
  },
  // Delete a competition row — requires session JWT (RLS: auth.uid() = user_id)
  async deleteCompetition(compId, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/competitions?id=eq.${compId}`, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  // Upsert a user's profile row — requires session JWT
  async upsertProfile(profile, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(profile),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
};

// ============================================================
// UTILITIES
// ============================================================
const generateId = () => Math.random().toString(36).substr(2, 9);

// ============================================================
// AUTH HELPERS
// [OLD localStorage auth replaced by Supabase Auth — kept for rollback]
// ============================================================

/* ── OLD AUTH CODE — commented out; replaced by Supabase Auth ──────────────
const AUTH_KEY = "gymcomp_accounts";
const SESSION_KEY = "gymcomp_session";

// Simple hash (not cryptographic — fine for demo/prototype)
const hashPassword = (pwd) => {
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    const char = pwd.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

const auth = {
  getAccounts: () => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "{}"); } catch { return {}; }
  },
  saveAccounts: (accounts) => localStorage.setItem(AUTH_KEY, JSON.stringify(accounts)),

  register: (email, password, name, clubName) => {
    const accounts = auth.getAccounts();
    const key = email.toLowerCase().trim();
    if (accounts[key]) return { error: "An account with this email already exists." };
    const id = generateId();
    accounts[key] = { id, email: key, name, clubName, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    auth.saveAccounts(accounts);
    return { account: accounts[key] };
  },

  login: (email, password) => {
    const accounts = auth.getAccounts();
    const key = email.toLowerCase().trim();
    const account = accounts[key];
    if (!account) return { error: "No account found with that email." };
    if (account.passwordHash !== hashPassword(password)) return { error: "Incorrect password." };
    return { account };
  },

  updateAccount: (email, updates) => {
    const accounts = auth.getAccounts();
    const key = email.toLowerCase().trim();
    if (!accounts[key]) return { error: "Account not found." };
    accounts[key] = { ...accounts[key], ...updates };
    auth.saveAccounts(accounts);
    return { account: accounts[key] };
  },

  deleteAccount: (email) => {
    const accounts = auth.getAccounts();
    const key = email.toLowerCase().trim();
    delete accounts[key];
    auth.saveAccounts(accounts);
  },

  getSession: () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  },
  setSession: (account) => localStorage.setItem(SESSION_KEY, JSON.stringify(account)),
  clearSession: () => localStorage.removeItem(SESSION_KEY),
};
── END OLD AUTH CODE ──────────────────────────────────────────────────── */

const EVENTS_KEY = "gymcomp_events";

const events = {
  getAll: () => {
    try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); } catch { return []; }
  },
  save: (allEvents) => localStorage.setItem(EVENTS_KEY, JSON.stringify(allEvents)),
  clear: () => localStorage.removeItem(EVENTS_KEY),

  getForAccount: (accountId) => events.getAll().filter(e => e.accountId === accountId),

  create: (accountId, compId) => {
    const all = events.getAll();
    const ev = { id: generateId(), accountId, compId, status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    all.push(ev);
    events.save(all);
    return ev;
  },

  update: (eventId, updates) => {
    const all = events.getAll();
    const idx = all.findIndex(e => e.id === eventId);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    events.save(all);
    return all[idx];
  },

  remove: (eventId) => {
    const all = events.getAll().filter(e => e.id !== eventId);
    events.save(all);
  },

  // Snapshot — save a full copy of comp data with the event record
  snapshot: (eventId, compData, gymnasts, scores) => {
    const all = events.getAll();
    const idx = all.findIndex(e => e.id === eventId);
    if (idx === -1) return;
    all[idx] = { ...all[idx], snapshot: { compData, gymnasts, scores }, updatedAt: new Date().toISOString() };
    events.save(all);
  },
};

const EVENT_STATUSES = [
  { value: "draft",     label: "Draft",     color: "var(--muted)" },
  { value: "active",    label: "Active",    color: "var(--accent)" },
  { value: "live",      label: "Live",      color: "#22c55e" },
  { value: "completed", label: "Completed", color: "var(--success)" },
  { value: "archived",  label: "Archived",  color: "#555" },
];
const statusMeta = (val) => EVENT_STATUSES.find(s => s.value === val) || EVENT_STATUSES[0];

// TRUE dense ranking: equal scores share rank, next rank is +1 (never skipped): equal scores share rank, next rank is +1 (never skipped)
const denseRank = (items, scoreKey) => {
  const sorted = [...items].sort((a, b) => b[scoreKey] - a[scoreKey]);
  const result = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][scoreKey] < sorted[i - 1][scoreKey]) rank++;
    result.push({ ...sorted[i], rank });
  }
  return result;
};

const APPARATUS_OPTIONS = ["Beam", "Bar", "Vault", "Floor", "Range"];

// UK Gymnastics levels — grouped by pathway
const UK_LEVELS = [
  { group: "Classic Challenge", options: ["Tin", "Zinc", "Copper", "Bronze", "Silver", "Gold"] },
  { group: "NDP Grades (Club/County)", options: ["Prep Grade 1", "Prep Grade 2", "Prep Grade 3", "Dev Grade 1", "Dev Grade 2", "Dev Grade 3", "Performance Grade 1", "Performance Grade 2", "Performance Grade 3"] },
  { group: "NDP Grades (Regional/National)", options: ["Grade 14", "Grade 13", "Grade 12", "Grade 11", "Grade 10", "Grade 9", "Grade 8", "Grade 7", "Grade 6", "Grade 5"] },
  { group: "Elite / NDP Compulsory", options: ["Level 4", "Level 3", "Level 2", "Espoir", "Junior", "Senior"] },
  { group: "FIG / International", options: ["FIG Dev 1", "FIG Dev 2", "FIG Dev 3", "FIG Junior", "FIG Senior"] },
];
const UK_LEVELS_FLAT = UK_LEVELS.flatMap(g => g.options);

// ============================================================
// UK GYMNASTICS CLUBS — scraped from BG results PDFs 2024
// Sources: British Championships, Adult Championships, English
// Rhythmic Championships, Acrobatic Championships, Disability
// Championships. Covers WAG, MAG, Rhythmic, Acrobatic, Tumbling.
// Add more clubs at the bottom of this array as needed.
// ============================================================
const UK_CLUBS = [
  { name: "1066 Gymnastics", locations: ["Bexhill-on-sea"] },
  { name: "776 Gymnastics", locations: ["Mansfield"] },
  { name: "776 Gymnastics Commercial Road", locations: ["Sunderland"] },
  { name: "776 Gymnastics Front Street", locations: ["Stanley"] },
  { name: "776 Gymnastics Grindon Lane", locations: ["Sunderland"] },
  { name: "776 Gymnastics Newark", locations: ["Newark"] },
  { name: "776 Gymnastics Penshaw", locations: ["Houghton Le Spring"] },
  { name: "776 Gymnastics Shakespeare Street", locations: ["Sunderland"] },
  { name: "776 Gymnastics Southgate", locations: ["Newcastle Upon Tyne"] },
  { name: "776 Gymnastics St. Peters Road", locations: ["Wallsend"] },
  { name: "AB FAB Gymnastics", locations: ["Retford"] },
  { name: "Abbey Gym Club", locations: ["Great Middenden"] },
  { name: "Abbey Gymnastics C.I.C.", locations: ["Belfast"] },
  { name: "Abbey High Fliers", locations: ["Peterborough"] },
  { name: "Aberdeen Acro GC", locations: ["Aberdeen"] },
  { name: "Aberdeen GC", locations: ["Aberdeen"] },
  { name: "Aberdeen University Trampoline Club", locations: ["Aberdeen"] },
  { name: "Aberdeenshire Aspire Trampoline Academy", locations: ["Inverurie"] },
  { name: "Abingdon Gymnastics Club", locations: ["Wallingford"] },
  { name: "Aboyne GC &", locations: ["Aboyne", "Banchory"] },
  { name: "AC Elite Gymnastics Club", locations: ["Dorking"] },
  { name: "Academy Gymnastics", locations: ["Evesham", "Rugby"] },
  { name: "Accelerate Trampoline", locations: ["Taunton", "Wellington", "Willand", "Yeovil"] },
  { name: "Acceleration Trampoline Club", locations: ["Reading"] },
  { name: "ACE Gymnastics Perth", locations: ["Perth"] },
  { name: "Acklam Gym Club", locations: ["Middlesbrough"] },
  { name: "Acrobay", locations: ["Dunfermline"] },
  { name: "Acromax Group (The)", locations: ["St Leonards-On-Sea"] },
  { name: "AcroNova Gymnastics", locations: ["Birkenhead"] },
  { name: "Activ8 Trampoline Club", locations: ["Sutton Coldfield", "Tamworth"] },
  { name: "Active", locations: ["Walsall"] },
  { name: "Active GC", locations: ["ELGIN"] },
  { name: "Active Gymnastics Club", locations: ["London"] },
  { name: "Active Gymnastics Club Dorset", locations: ["Poole"] },
  { name: "Adams Gymnastics", locations: ["Leicester"] },
  { name: "Advance Gymnastics Club", locations: ["Croydon"] },
  { name: "Aerial Gymnastics Academy", locations: ["Liverpool"] },
  { name: "Aerial Tumbling", locations: ["Epsom"] },
  { name: "Aerial Tumbling Club", locations: ["Leatherhead"] },
  { name: "Aerodyne", locations: ["South Shields"] },
  { name: "Aeronauts Trampoline", locations: ["Hartlepool"] },
  { name: "Air Acro Gymnastics", locations: ["HAYWARDS HEATH"] },
  { name: "Air Dynamix", locations: ["Halesowen"] },
  { name: "Air Extreme Trampoline", locations: ["Barnstaple"] },
  { name: "Airborne Gymnastics", locations: ["Stoke health"] },
  { name: "AIRBORNE GYMNASTICS", locations: ["Maidenhead"] },
  { name: "Aire Trampoline", locations: ["Canterbury", "Sandwich"] },
  { name: "Aire Trampoline Club", locations: ["Dover"] },
  { name: "Aireborough Gymnastics", locations: ["Leeds"] },
  { name: "Airies Gymnastics Club", locations: ["Langley"] },
  { name: "Alba Trampoline Club", locations: ["Glasgow", "Kilmarnock"] },
  { name: "Alchemy Trampoline & DMT", locations: ["Nailsea"] },
  { name: "alienZoo", locations: ["LONDON", "London", "Southampton"] },
  { name: "All Star Elite Trampoline & DMT Team", locations: ["East Kilbride"] },
  { name: "Allander Gymnastics Club", locations: ["Glasgow"] },
  { name: "Allegro Gymnastics Academy", locations: ["Scunthorpe"] },
  { name: "Allegro School of Gymnastics", locations: ["Bromley", "Orpington"] },
  { name: "Alloa Amateur GC", locations: ["Alloa"] },
  { name: "Allstarz", locations: ["Croydon"] },
  { name: "Alpha Trampoline Club", locations: ["Alton"] },
  { name: "Altair Trampoline", locations: ["Birmingham"] },
  { name: "Altitude Trampoline", locations: ["Halstead"] },
  { name: "Alton Gymnastics Club", locations: ["Alton"] },
  { name: "Alton Trampoline Club", locations: ["Alton"] },
  { name: "Alvah Gymteam", locations: ["Aberdeen", "Macduff"] },
  { name: "Alvechurch Gymnastics Club", locations: ["Alvechurch"] },
  { name: "Ambitions", locations: ["Crosshills"] },
  { name: "Andover Gymnastics", locations: ["Andover"] },
  { name: "Anima Gymnastics Club", locations: ["London"] },
  { name: "Anna's Gymnastics", locations: ["London"] },
  { name: "Anna's Gymnastics Academy", locations: ["London"] },
  { name: "Antrim Phoenix Gymnastics Club", locations: ["ANTRIM", "Antrim"] },
  { name: "APEX", locations: ["London"] },
  { name: "Apollo Leeds", locations: ["Leeds"] },
  { name: "Apollo Trampoline Club", locations: ["Washington"] },
  { name: "Appley Bridge School of Gymnastics", locations: ["Chorley"] },
  { name: "Aquila Trampoline", locations: ["Swindon"] },
  { name: "Arabesque Gymnastics Limited", locations: ["Belfast"] },
  { name: "Arabian School of Gymnastics", locations: ["Milton Keynes"] },
  { name: "Arbroath", locations: ["Dundee"] },
  { name: "Arbroath GC", locations: ["Arbroath"] },
  { name: "Ascendance School of Gymnastics", locations: ["Downpatrick"] },
  { name: "ASG Community Gymnastics Club", locations: ["London", "Sidcup"] },
  { name: "Ashfield Gymnastics Club", locations: ["Nottingham", "Sutton in Ashfield"] },
  { name: "Ashmole Phoenix Gym Club", locations: ["Southgate"] },
  { name: "Ashton Gymnastics", locations: ["Tadcaster"] },
  { name: "Aspire Gymnastics Academy", locations: ["Romford"] },
  { name: "Aspire Gymnastics Club Hull", locations: ["Hull"] },
  { name: "Aspire Gymnastics NI", locations: ["Armagh"] },
  { name: "Astrid Academy of", locations: ["Spennymoor"] },
  { name: "Athena Gymnastics Academy", locations: ["Coulsdon"] },
  { name: "Athena Gymnastics Club", locations: ["Bexleyheath"] },
  { name: "Athena Sports Academy", locations: ["Newton Aycliffe"] },
  { name: "Atmosphere Trampoline Gymnastics", locations: ["Mansfield"] },
  { name: "Atmosphere Trampoline Gymnastics Academy", locations: ["Alfreton", "Kiveton Park"] },
  { name: "Attercliffe Gymnastics Academy", locations: ["Sheffield"] },
  { name: "Auchterarder", locations: ["Auchterarder"] },
  { name: "Aurora Gymnastics West", locations: ["London"] },
  { name: "AV Greenwich", locations: ["Bexleyheath", "London"] },
  { name: "AV Gymnastics Club", locations: ["Stockport"] },
  { name: "Avonbourne Gym", locations: ["Bournemouth"] },
  { name: "Avondale Acro GC", locations: ["Larkhall"] },
  { name: "Avondale Gym Club", locations: ["Surbiton"] },
  { name: "Axis Trampoline Club", locations: ["Bristol"] },
  { name: "Axminster Gymnastics", locations: ["Axminster"] },
  { name: "Ayrshire GC", locations: ["Kilmarnock"] },
  { name: "Back 2 Back Gymnastics Club", locations: ["Stone"] },
  { name: "Balance & Beam", locations: ["Stoke on Trent"] },
  { name: "Balanced Knights Gymnastics Club", locations: ["London"] },
  { name: "Balmoor", locations: ["Peterhead"] },
  { name: "Balwearie", locations: ["Kirkcaldy"] },
  { name: "Banchory Trampoline & DMT", locations: ["Banchory"] },
  { name: "Barnsley Community Gymnastics Academy", locations: ["Barnsley"] },
  { name: "Barnsley Premier Gymnastics", locations: ["Rotherham"] },
  { name: "Basildon", locations: ["Basildon"] },
  { name: "Basingstoke Gym", locations: ["Basingstoke"] },
  { name: "Bath Trampoline and Gym Academy", locations: ["Bath", "Bristol"] },
  { name: "BDR Gymnastics Club", locations: ["London"] },
  { name: "Be Distinct Gymnastics Academy", locations: ["LONDON"] },
  { name: "Be...Gymnastics", locations: ["Eastbourne"] },
  { name: "Beacon GC", locations: ["Aberdeen"] },
  { name: "Beacon Rhythmic GC", locations: ["Aberdeen"] },
  { name: "Beaming", locations: ["Gravesend", "Longfield"] },
  { name: "Bebington Gymnastics Club", locations: ["Wirral"] },
  { name: "Beccles Royales Gym Club", locations: ["Beccles"] },
  { name: "Beckenham Fliers Trampoline", locations: ["Beckenham"] },
  { name: "Bedford Flyers Tramp Club", locations: ["BEDFORD"] },
  { name: "Belfast Galaxy Trampoline & DMT Club enc Comet Kids", locations: ["Antrim", "Belfast", "N Newtownabbey"] },
  { name: "Believe Gymnastics Club", locations: ["Amersham"] },
  { name: "Belle Vue Trampoline Club", locations: ["Consett"] },
  { name: "Benchmark Gymnastics Club", locations: ["London"] },
  { name: "Berkhamsted Gymnastics Club", locations: ["Berkhamsted"] },
  { name: "Bevendean Gymnastics Club", locations: ["Brighton"] },
  { name: "Billings Rhythmic Gym", locations: ["Northampton"] },
  { name: "Bingham", locations: ["Nottingham"] },
  { name: "Birches Valley Gymnastics", locations: ["CANNOCK"] },
  { name: "Birkenhead Gymnastics Academy", locations: ["Birkenhead"] },
  { name: "Birkenhead Trampoline Club", locations: ["Birkenhead"] },
  { name: "Birmingham Bouncers", locations: ["Birmingham"] },
  { name: "Birmingham Flames O G C", locations: ["Birmingham"] },
  { name: "Birmingham Gymnastics Academy", locations: ["Birmingham"] },
  { name: "Birmingham Tornadoes Gymnastic Club", locations: ["Birmingham"] },
  { name: "Bishopbriggs Acro GC", locations: ["Glasgow"] },
  { name: "Blackburn with Darwen Acrobatic Gymnastic", locations: ["Blackburn"] },
  { name: "Blackfen Gym Club", locations: ["Sidcup"] },
  { name: "Blackpool Tiggers", locations: ["Blackpool"] },
  { name: "Blandford Forum Gymnastics Club", locations: ["Blandford Forum"] },
  { name: "Bolton Gymnastics Club", locations: ["Bolton"] },
  { name: "Bolton Trampoline Gymnastics Academy", locations: ["Bolton"] },
  { name: "Booker Gym Club", locations: ["High Wycombe"] },
  { name: "Boost Trampolining CIC", locations: ["Weston-super-mare"] },
  { name: "Bounce DMT & Trampoline", locations: ["Sheerness"] },
  { name: "Bounce DMT & Trampoline Club", locations: ["Sheerness"] },
  { name: "Bouncing Stars", locations: ["Birmingham"] },
  { name: "Bourne 2 Bounce", locations: ["Christchurch"] },
  { name: "Bourne End Gymnastics Academy", locations: ["Bourne End"] },
  { name: "Bourne Gymnastics", locations: ["Sittingbourne"] },
  { name: "Bourton Gymnastic Club", locations: ["Bourton-on-the-Water"] },
  { name: "Bracknell Gymnastics", locations: ["Bracknell"] },
  { name: "Bradford Gymnastic Club", locations: ["Bradford"] },
  { name: "Bradford Olympian T.C.", locations: ["Bradford"] },
  { name: "Bradworthy Gymnastics Club", locations: ["Bude"] },
  { name: "Brentwood Trampoline Club", locations: ["Brentwood"] },
  { name: "Bridge Gymnastics", locations: ["Enniskillen"] },
  { name: "Bridge Park Gymnastics Club", locations: ["London"] },
  { name: "Brighton Gymnastics", locations: ["Brighton"] },
  { name: "Bristol Hawks Gym Club", locations: ["Easton"] },
  { name: "Bristol School Of Gymnastics", locations: ["Bristol"] },
  { name: "Bristol Trampoline and Gymnastics", locations: ["BRISTOL"] },
  { name: "Broadland Gymnastics Club", locations: ["Great Yarmouth"] },
  { name: "Bromley Valley Gymnastics", locations: ["Orpington"] },
  { name: "Bromsgrove Gymnastics Club", locations: ["Bromsgrove"] },
  { name: "Brumby Gymnastic Club", locations: ["Scunthorpe"] },
  { name: "Bucks Trampoline and Tumbling Academy (BTTA)", locations: ["Wendover"] },
  { name: "Bulmershe Gym", locations: ["Reading"] },
  { name: "Bury Gymnastics", locations: ["Bury"] },
  { name: "Bury Spectrum Gym", locations: ["Bury St. Edmunds"] },
  { name: "Bury Trampoline Club", locations: ["Bury"] },
  { name: "Busybodz Gymnastics", locations: ["Droylsden"] },
  { name: "C C", locations: ["Stockport"] },
  { name: "Cacl Gym Club Eastbourne", locations: ["Eastbourne", "Hailsham"] },
  { name: "Cage Service Ltd", locations: ["Waterlooville"] },
  { name: "Caithness GC", locations: ["Thurso"] },
  { name: "Calverton Gymnastics Club", locations: ["Calverton"] },
  { name: "Cambourne Comets Trampoline Club", locations: ["Cambridge"] },
  { name: "Cambridge Cangaroos", locations: ["Cambridge"] },
  { name: "Cambridge Gymnastics", locations: ["Cambridge"] },
  { name: "Cambridge University Gymnastics Club", locations: ["Bury St. Edmunds", "Cambridge", "Huntingdon", "Milton Keynes", "Stevenage"] },
  { name: "Cambridge University Trampoline", locations: ["Cambridge"] },
  { name: "Camden Gymnastics", locations: ["London"] },
  { name: "Cameo GC", locations: ["Coatbridge"] },
  { name: "Canterbury Rhythmic Gymnastics Ltd", locations: ["Ashford Kent", "Canterbury"] },
  { name: "Carlisle Gymnastics Club", locations: ["Carlisle"] },
  { name: "Carlisle Trampoline Club", locations: ["Carlisle"] },
  { name: "Carnegie Spartan GC", locations: ["Dunfermline"] },
  { name: "Carousel School Of Gymnastics", locations: ["Rochford", "Wickford"] },
  { name: "Carterton Gymnastics Club CIC", locations: ["Carterton"] },
  { name: "Cartwheels Pre-School Gymnastics", locations: ["Harrow", "Loughton", "North Weald", "Northwood"] },
  { name: "Castle Gymnastics", locations: ["Kenilworth"] },
  { name: "Castle Rhythmic Gym Club", locations: ["Bangor"] },
  { name: "Caterham Gymnastics Academy", locations: ["CATERHAM", "Caterham"] },
  { name: "Celebrate Gymnastics Club", locations: ["Billericay"] },
  { name: "Central Galaxy Coventry Trampoline", locations: ["Coventry"] },
  { name: "Central Gymnastics Academy Unit 3 2 Unit Munro Road", locations: ["FK7 7UU"] },
  { name: "Centrum Gymnastics Ltd", locations: ["London"] },
  { name: "CGA Gymnastics", locations: ["Cambridge", "Ely"] },
  { name: "CGC Leisure", locations: ["Canterbury"] },
  { name: "Chalfont Gymnastics Academy Limited", locations: ["GERRARDS CROSS"] },
  { name: "Charnwood Trampoline Club", locations: ["COALVILLE", "Loughborough"] },
  { name: "Cheam Gymnastics Club", locations: ["Sutton"] },
  { name: "Cheam Trampoline Club", locations: ["Cheam"] },
  { name: "Checkers Gymnastic", locations: ["Gloucester"] },
  { name: "Chelmsford Gym Club", locations: ["Chelmsford"] },
  { name: "Cheltenham Academy of Acrobatic Gymnastics", locations: ["Gloucester"] },
  { name: "Cheltenham and Gloucester Gymnastics Club", locations: ["Gloucester"] },
  { name: "Chesterfield Gymnastics & Trampolining Academy", locations: ["Chesterfield"] },
  { name: "Chichester Gymnastics Academy", locations: ["CHICHESTER"] },
  { name: "Chippenham Moonraker Gymnastics", locations: ["Corsham"] },
  { name: "City of Aberdeen", locations: ["ABERDEEN", "Aberdeen"] },
  { name: "City of Birmingham Gym Club", locations: ["Birmingham"] },
  { name: "City of Coventry Trampoline & Gymnastic Club", locations: ["Coventry"] },
  { name: "City of Edinburgh GC", locations: ["Edinburgh"] },
  { name: "City of Edinburgh Trampoline Club", locations: ["Bonnyrigg", "Tranent"] },
  { name: "City of Glasgow GC", locations: ["Glasgow"] },
  { name: "City of Lancaster Gymnastics Club", locations: ["Lancaster"] },
  { name: "City of Lisburn Salto National Gym Centre", locations: ["Lisburn"] },
  { name: "City Of Liverpool Gym Club", locations: ["Liverpool"] },
  { name: "City Of Manchester Institute Of Gymnastics", locations: ["Gorton"] },
  { name: "City of Manchester Rhythmic Academy", locations: ["Manchester"] },
  { name: "City of Newcastle Gym Academy", locations: ["Newcastle Upon Tyne"] },
  { name: "City of Plymouth Trampoline and Gymnastics", locations: ["Plymouth"] },
  { name: "City of Preston Gymnastics Club", locations: ["Preston"] },
  { name: "City Of Salford Gym Club", locations: ["Salford"] },
  { name: "City Of Salford Trampoline", locations: ["Salford"] },
  { name: "City of Salisbury Gymnastics Club", locations: ["Salisbury"] },
  { name: "City Of Sheffield", locations: ["Sheffield"] },
  { name: "City of Stoke Acrobatics Gymnastics", locations: ["Stoke-on-Trent"] },
  { name: "City Of Worcester Gymnastics Club", locations: ["Malvern", "Worcester"] },
  { name: "Clevedon Gymnastics Centre", locations: ["Clevedon"] },
  { name: "Club GymFun", locations: ["N Newtownabbey"] },
  { name: "Clyde Valley Gymnastics Club", locations: ["Dumbarton"] },
  { name: "Coalville Gym Club", locations: ["Coalville"] },
  { name: "Colchester Gymnastics Club", locations: ["Colchester"] },
  { name: "Comberton Gymnastics", locations: ["Cambridge"] },
  { name: "Community Gymnastics", locations: ["Halifax"] },
  { name: "Coney Hall Cosmonauts", locations: ["Bromley"] },
  { name: "Corby Gymnastics", locations: ["Corby", "Northampton"] },
  { name: "Cornish Trampolining", locations: ["St. Austell"] },
  { name: "Cornwall Gymnastics Centre", locations: ["Wadebridge"] },
  { name: "Cosmos Trampoline Club", locations: ["Yate"] },
  { name: "Cotswold Gymnastics Club CASC", locations: ["Cirencester"] },
  { name: "Cottenham Gymnastics", locations: ["Histon"] },
  { name: "Cottenham Gymnastics Club", locations: ["Cambridge"] },
  { name: "Craven Gymnastics Club", locations: ["Skipton"] },
  { name: "Crewe & Nantwich Gym Club", locations: ["Crewe"] },
  { name: "Crossway Gymnastics Club", locations: ["London"] },
  { name: "Croydon Acro", locations: ["Coulsdon"] },
  { name: "Croydon Gymnastics Club", locations: ["Caterham Surrey", "Oxted"] },
  { name: "Crystal Palace Gymnastics Club", locations: ["London"] },
  { name: "Cumbernauld GC", locations: ["Glasgow"] },
  { name: "D.P.S.A Gymnastics Club", locations: ["Daventry"] },
  { name: "Dako 'Flying Angels' Gym Club", locations: ["Sneinton"] },
  { name: "Dan Purvis Gymnastics", locations: ["Liverpool"] },
  { name: "Darlington Gymnastics Club", locations: ["Darlington"] },
  { name: "Dartford Gymnastics Club", locations: ["Dartford"] },
  { name: "Dartford Trampoline Club", locations: ["Dartford"] },
  { name: "Darwin Gymnastics and Dance", locations: ["Shrewsbury"] },
  { name: "DC", locations: ["Ashford", "Canterbury", "Folkestone"] },
  { name: "DC Gymnastics", locations: ["Berwick-upon-tweed"] },
  { name: "Deal Gym Club", locations: ["Deal"] },
  { name: "Deerness Gymnastics Club", locations: ["Durham"] },
  { name: "Delta", locations: ["Swindon"] },
  { name: "Delta Trampoline Club", locations: ["Derby"] },
  { name: "Derby City Gymnastics Club", locations: ["Derby"] },
  { name: "Derbyshire Gymnastics Academy", locations: ["Ripley"] },
  { name: "Derwent Valley Gymnastics Club", locations: ["consett"] },
  { name: "Devotion RGA Ltd", locations: ["London"] },
  { name: "Dexterity Gymnastics Club", locations: ["Beverley", "Hull"] },
  { name: "Dharma Gym for", locations: ["Aylesford", "Maidstone", "Tenterden"] },
  { name: "Diamond Gymnastics (Amersham)", locations: ["Amersham"] },
  { name: "Diamonds Gymnastic Club", locations: ["Halifax"] },
  { name: "Diamonds Trampoline & DMT", locations: ["Inverurie"] },
  { name: "Dimensions Trampoline", locations: ["Colchester"] },
  { name: "DKN", locations: ["Woodford Green"] },
  { name: "DLJ Gymnastics Club", locations: ["Gillingham"] },
  { name: "Dolphina Gym Club", locations: ["Watford"] },
  { name: "Doncaster Gymnastics", locations: ["Doncaster"] },
  { name: "Donside GC", locations: ["Inverurie"] },
  { name: "Dover Gym Club", locations: ["Dover"] },
  { name: "Dragons Trampoline Club", locations: ["Norwich"] },
  { name: "Drayton Gym Club", locations: ["Hanwell"] },
  { name: "Dreamweaver Gymnastics Club", locations: ["Cambridge"] },
  { name: "Dronfield Gymnastics", locations: ["Dronfield"] },
  { name: "Drumchapel GC", locations: ["Drumchapel"] },
  { name: "Dudley Gymnastics Club", locations: ["Brierley Hill"] },
  { name: "Dumfries Y Gymnastics", locations: ["Annan", "Dumfries"] },
  { name: "Dundee Gymnastics Club", locations: ["Dundee"] },
  { name: "Dundee Gymnastics Club 2k", locations: ["Dundee"] },
  { name: "Dundee Uni TC", locations: ["Dundee"] },
  { name: "Dundee University Gymnastics", locations: ["Dundee"] },
  { name: "Dundonald", locations: ["Ayr"] },
  { name: "Dunfermline Zodiak GC", locations: ["Dunfermline"] },
  { name: "Dungannon Gymnastics Club", locations: ["Dungannon"] },
  { name: "Durham City Gymnastics", locations: ["Durham"] },
  { name: "Dynamic Gymnastics Academy", locations: ["Motherwell"] },
  { name: "Dynamite GC", locations: ["Clydebank"] },
  { name: "Dynamix Gymnastics Club", locations: ["Braintree"] },
  { name: "Dynamo School Of Gymnastics", locations: ["Southampton"] },
  { name: "Dyson Gymnastics Club", locations: ["Hove"] },
  { name: "E.J.B Gymnastics Club", locations: ["Amersham", "Borehamwood"] },
  { name: "Eagle GC", locations: ["Paisley"] },
  { name: "Eagles Acrobatic", locations: ["Kingsbridge"] },
  { name: "Eagles Gymnastics", locations: ["King's Lynn", "Wisbech"] },
  { name: "Ealing", locations: ["London"] },
  { name: "Earls Gymnastics Club", locations: ["Halesowen", "Oldbury"] },
  { name: "East Kent Acro Gym Club", locations: ["Deal"] },
  { name: "East Kilbride GC", locations: ["East Kilbride"] },
  { name: "East London Gym Club", locations: ["LONDON"] },
  { name: "East Lothian Gymnastics Academy", locations: ["Prestonpans"] },
  { name: "East Staffs Gym Club", locations: ["Burton-on-Trent"] },
  { name: "East Surrey Acrobatics", locations: ["Redhill", "Reigate"] },
  { name: "Easton Gymnastics Club", locations: ["Norwich"] },
  { name: "Ecco Gymnastics", locations: ["Sheffield"] },
  { name: "Eclipse Gymnastics", locations: ["Fareham", "Grimsby", "Southampton"] },
  { name: "Eclipse Gymnastics Club", locations: ["Oldham"] },
  { name: "Eclipse Gymnastics Club (East Mids)", locations: ["Rushden"] },
  { name: "Eclipse Gymnastics Club Scotland", locations: ["Aberdeen"] },
  { name: "Edgbarrow Trampoline", locations: ["Bracknell"] },
  { name: "Edge Acrobatic", locations: ["Glastonbury", "Street"] },
  { name: "Edge Hill Sport Gymnastics", locations: ["Ormskirk"] },
  { name: "Edinburgh University", locations: ["Dalkeith", "Edinburgh"] },
  { name: "Edinburgh University Trampoline", locations: ["Edinburgh"] },
  { name: "Elements", locations: ["Dartford", "Gravesend"] },
  { name: "Elements Acro", locations: ["Shrewsbury"] },
  { name: "Elevate Acro Gymnastics", locations: ["Larkhall", "Livingston"] },
  { name: "Elevate Elite CIC", locations: ["Loughborough"] },
  { name: "ELITE GYM CLUB", locations: ["Barnet", "LONDON"] },
  { name: "Elite Gymnastics", locations: ["Antrim"] },
  { name: "Ellan Vannin Gymnastics Club", locations: ["Douglas"] },
  { name: "Ellastics Gymnastics Club", locations: ["Horley", "Redhill"] },
  { name: "Ellesmere Port Club of Gymnastics", locations: ["Ellesmere Port"] },
  { name: "Elmfield Gymnastics Club", locations: ["Doncaster"] },
  { name: "Embrace Gymnastics Performance", locations: ["Wigan"] },
  { name: "Emmer Green Gymnastics", locations: ["Reading"] },
  { name: "Empower Gymnastics Club", locations: ["Mansfield"] },
  { name: "Enderby Olympic Gym Club", locations: ["Enderby"] },
  { name: "Enigma GC", locations: ["Leven"] },
  { name: "Epping Gymnastics Club", locations: ["Epping"] },
  { name: "EPTC", locations: ["Nottingham"] },
  { name: "Erewash Valley Gym Club", locations: ["Ilkeston", "Nottingham"] },
  { name: "ESG Academy", locations: ["Borehamwood", "Potters Bar"] },
  { name: "Esprit", locations: ["Swindon"] },
  { name: "Esprit Rhythmic Gymnastics Club", locations: ["Swindon"] },
  { name: "Europa Gym Centre CIC", locations: ["Crayford"] },
  { name: "Everton Park Gymnastics Club", locations: ["Liverpool"] },
  { name: "Evoke Gymnastics", locations: ["Swindon"] },
  { name: "Evolution Rhythmic Gymnastics Academy", locations: ["London"] },
  { name: "Evolution Trampoline Club", locations: ["Frome", "Warminster"] },
  { name: "Evolve Gymnastics Academy", locations: ["Manchester"] },
  { name: "Evolve Gymnastics Club (Scotland)", locations: ["Glasgow"] },
  { name: "EVT Gymnastics", locations: ["Nottingham"] },
  { name: "Exeter Gym Club", locations: ["Exeter"] },
  { name: "Exeter Trampoline", locations: ["Exeter"] },
  { name: "Extension Gymnastics", locations: ["Tonbridge"] },
  { name: "Extreme Trampoline Club", locations: ["Nottingham"] },
  { name: "Falcon S A Gym Club", locations: ["Bedford"] },
  { name: "Falcon Spartak Gym Club", locations: ["Sidcup"] },
  { name: "Falcons Gym", locations: ["Barnstaple"] },
  { name: "Falkirk School of Gymnastics", locations: ["Falkirk"] },
  { name: "Fareham School Of Gym", locations: ["Fareham"] },
  { name: "Farnborough Flyers", locations: ["Aldershot Hampshire"] },
  { name: "Fash Gym Club", locations: ["Chislehurst"] },
  { name: "Faversham Gymnastics Club", locations: ["Faversham"] },
  { name: "Fenland Gymnastics", locations: ["Wisbech"] },
  { name: "Fife GC", locations: ["Dunfermline"] },
  { name: "Finesse Rhythmic Gymnastics Club", locations: ["Speke", "St Helens"] },
  { name: "Five Gymnastics", locations: ["London"] },
  { name: "Flair", locations: ["Glasgow"] },
  { name: "Flare Gymnastics", locations: ["Southampton"] },
  { name: "Flex & Flip Gymnastics", locations: ["Biggleswade"] },
  { name: "Flex Gymnastics Club", locations: ["Petersfield"] },
  { name: "Flexx Gymnastics Club Reading", locations: ["Reading"] },
  { name: "Flic Flac GC", locations: ["St. Andrews"] },
  { name: "Flight Gymnastics", locations: ["N Newtownabbey"] },
  { name: "Flight Trampoline Club", locations: ["Harlow"] },
  { name: "Flip & Twist Acro", locations: ["Stonehouse"] },
  { name: "Flipping Out Gymnastics", locations: ["Birmingham"] },
  { name: "Flips Gymnastics Club", locations: ["Hatfield"] },
  { name: "Flitecrew Trampoline Club", locations: ["Crawley", "Horsham"] },
  { name: "FLIX Gymnastics", locations: ["Bedford"] },
  { name: "Flow Gymnastics", locations: ["Banstead"] },
  { name: "Flyers TC", locations: ["Glenrothes"] },
  { name: "Flying Angels Gymnastics", locations: ["London"] },
  { name: "Flyte Gymnastics", locations: ["Coventry"] },
  { name: "Forest Of Dean Gymnastics Club", locations: ["Coleford"] },
  { name: "Forres", locations: ["Forres"] },
  { name: "Forth Valley Team Gymnastics", locations: ["Larbert"] },
  { name: "Fox Gymnastics Club", locations: ["Farnborough"] },
  { name: "Framtastics Gym Club", locations: ["Norwich"] },
  { name: "Freedom", locations: ["Beckenham", "Bromley", "Croydon"] },
  { name: "Fromeside Gymnastics", locations: ["Bristol"] },
  { name: "Fuego Gymnastics", locations: ["Newick"] },
  { name: "Furness Gymnastics Club", locations: ["Barrow-In-Furness"] },
  { name: "Fusion", locations: ["Birmingham"] },
  { name: "Futunity UK Gymnastics Club", locations: ["Uxbridge"] },
  { name: "Fylde Coast Rhythmic Gymnastic", locations: ["Preston"] },
  { name: "Fyrish GC", locations: ["Alness"] },
  { name: "G’s Gymnastics Academy", locations: ["Lydney"] },
  { name: "Gaia Gymnastics &", locations: ["Westbury"] },
  { name: "Galaxy Rhythmic Gymnastics Club", locations: ["Lytham St. Annes"] },
  { name: "Galaxy Stars Trampoline Club", locations: ["Aylesford"] },
  { name: "Garioch GC", locations: ["Alford", "Ellon", "Insch", "Inverurie"] },
  { name: "Gazelles Gym Club", locations: ["Redruth"] },
  { name: "Gemini Gym Club", locations: ["Nailsea", "Westerham"] },
  { name: "Gemini Gymnastics Club", locations: ["Loughton"] },
  { name: "Generation Gymnastics", locations: ["Camberley"] },
  { name: "Genesis Gymnastics", locations: ["Chessington"] },
  { name: "Giants Gymnastics Company", locations: ["Littlehampton"] },
  { name: "Gibraltar Gymnastics Club", locations: ["Gibraltar"] },
  { name: "Glasgow Gymnastics", locations: ["Glasgow"] },
  { name: "Glasgow Uni", locations: ["Glasgow"] },
  { name: "Glossop Gymnastics Club", locations: ["Glossop"] },
  { name: "Gloucester Gymnastics Club", locations: ["Cheltenham"] },
  { name: "Goldring’s Gymnastics", locations: ["Sherborne"] },
  { name: "Goole Gymnastics Club", locations: ["Goole"] },
  { name: "Goshawks Gym", locations: ["Gosport"] },
  { name: "GR8", locations: ["Warrington"] },
  { name: "Grace Gymnastics School", locations: ["London"] },
  { name: "Grantham Gym", locations: ["Grantham"] },
  { name: "Gravitate Trampoline Club", locations: ["Telford"] },
  { name: "Greater Manchester Trampoline Gymnastics Academy", locations: ["Bury"] },
  { name: "Greenhead Gym", locations: ["Huddersfield"] },
  { name: "Greenhill Gymnastics Club", locations: ["Herne Bay"] },
  { name: "Greenwich Royals Gymnastics Club", locations: ["London"] },
  { name: "Griffin Association Gymnastics and Trampolining", locations: ["Street"] },
  { name: "Griffin Gymnastics", locations: ["Harlow"] },
  { name: "Grimsby & District School of", locations: ["Grimsby"] },
  { name: "Grimsby Twist & Flip Gymnastics Academy", locations: ["Grimsby"] },
  { name: "Grindon Gymnastics Club", locations: ["Sunderland"] },
  { name: "Grove & Didcot Gym Club", locations: ["Grove"] },
  { name: "Grundy Park Gym Club", locations: ["Cheshunt", "Maldon"] },
  { name: "Gryphon West Gym Club", locations: ["Sherborne", "Yeovil"] },
  { name: "GS Gymnastics", locations: ["Prudhoe"] },
  { name: "Guernsey Specials Gym Club LBG", locations: ["Guernsey"] },
  { name: "Guernsey Tumbling Centre", locations: ["Guernsey"] },
  { name: "Gym", locations: ["Edinburgh"] },
  { name: "Gym Mania", locations: ["Fleetwood"] },
  { name: "Gym Rox", locations: ["Brentwood", "Ingatestone"] },
  { name: "Gym Stars Gymnastics NI", locations: ["NEWRY"] },
  { name: "Gym Trix", locations: ["Newry"] },
  { name: "Gymco", locations: ["Worthing"] },
  { name: "Gymfinity Gymnastics Academy", locations: ["Altrincham", "Knutsford"] },
  { name: "Gymfinity Gymnastics Club", locations: ["Telford"] },
  { name: "Gymfit Gymnastics Club", locations: ["Epsom", "Ewell"] },
  { name: "Gymflix", locations: ["Beckenham"] },
  { name: "GymForce", locations: ["Stockport"] },
  { name: "GymMad Gymnastics Academy", locations: ["TS18 3TD"] },
  { name: "Gymmagic", locations: ["Pudsey"] },
  { name: "Gymnastics", locations: ["Bedford"] },
  { name: "Gymnastics &", locations: ["Southport"] },
  { name: "Gymnastics And Dance", locations: ["Manningtree"] },
  { name: "Gymnastics FM", locations: ["dagenham"] },
  { name: "Gymnastics Zone Ltd", locations: ["Leicester"] },
  { name: "Gymstars Gymnastics Academy", locations: ["Wimborne"] },
  { name: "Gymtastix", locations: ["Ellon", "Inverurie"] },
  { name: "Gymtopia Gymnastics CIO", locations: ["Newcastle Upon Tyne"] },
  { name: "Gymworld Gymnastics Club", locations: ["Middlesbrough"] },
  { name: "Gymzkool", locations: ["Preston", "Southport"] },
  { name: "Gyrus Olympic Gym", locations: ["Witham"] },
  { name: "Hadleigh Stars", locations: ["Ipswich"] },
  { name: "Halo Sparks Gymnastics", locations: ["Hereford"] },
  { name: "Hamilton GC", locations: ["Glasgow", "Hamilton"] },
  { name: "Hammersmith & Fulham School of Gymnastics", locations: ["London"] },
  { name: "Hammersmith Gymnastics Club", locations: ["London"] },
  { name: "Hampstead Gymnastics Club C.I.C", locations: ["London"] },
  { name: "Harefield Gymnastics & Dance", locations: ["Uxbridge"] },
  { name: "Harlequin Gym Squad", locations: ["Leighton Buzzard"] },
  { name: "Harlequin Gymnastics Club", locations: ["Romford"] },
  { name: "Harriers Acrobatic Gymnastics Club", locations: ["Bristol"] },
  { name: "Harrogate Gymnastics Club", locations: ["Harrogate"] },
  { name: "Harrow School Of Gym", locations: ["Harrow"] },
  { name: "Harrow Trampoline", locations: ["Edgware", "Harrow"] },
  { name: "Hart Gymnastics", locations: ["Fleet"] },
  { name: "Hartford School Of Gym", locations: ["Anderton"] },
  { name: "Hartlepool Gymnastics Club", locations: ["Hartlepool"] },
  { name: "Haverhill Gymnastics Club", locations: ["Haverhill"] },
  { name: "Havering Gymnastics", locations: ["Romford"] },
  { name: "Hawth Gymnastics", locations: ["Crawley"] },
  { name: "HBS", locations: ["Hitchin"] },
  { name: "Head Over Heels GC", locations: ["Glasgow"] },
  { name: "Head to Toe Gymnastics Club", locations: ["Banbridge"] },
  { name: "Heart of England Trampoline & DMT Club", locations: ["Solihull"] },
  { name: "Heathrow Aerobic Gymnastics", locations: ["Bromley", "Hounslow", "Rochester"] },
  { name: "Heathrow Gym", locations: ["Hounslow"] },
  { name: "Heights Trampoline & Gymnastics Club", locations: ["Abingdon"] },
  { name: "Hendon Gym Club", locations: ["London"] },
  { name: "Hereford Gymnastics Academy", locations: ["Hereford"] },
  { name: "Hertford Gymnastics Academy", locations: ["Ware"] },
  { name: "Hetton Gymnastics Club", locations: ["Houghton Le Spring"] },
  { name: "Hexham Gymnastic Club", locations: ["Hexham"] },
  { name: "Heywood Sparks Gymnastics Academy", locations: ["Heywood"] },
  { name: "HGC", locations: ["Hoddesdon"] },
  { name: "Hi-tension Trampoline", locations: ["Colchester"] },
  { name: "High Green Gymnastics Academy", locations: ["Sheffield"] },
  { name: "High Springers Trampoline & Gymnastics Club", locations: ["Bushey"] },
  { name: "Highgate Newtown Gymnastics Club", locations: ["London"] },
  { name: "Hillfoots", locations: ["Alva"] },
  { name: "Hinckley & Burbage GC", locations: ["Hinckley"] },
  { name: "Hinckley Gymnastics Club", locations: ["Hinckley", "Leicester"] },
  { name: "Hinckley Trampoline Club", locations: ["Hinckley"] },
  { name: "HiTide Gymnastics Club", locations: ["Brighton"] },
  { name: "Holbeach And Fenland Gym Club", locations: ["Spalding"] },
  { name: "Holborn Gymnastics Club", locations: ["London"] },
  { name: "Hollington Gymnastics Club", locations: ["Hastings"] },
  { name: "Honiton Gymnastics Club", locations: ["Honiton"] },
  { name: "Hope Acrobatic Gymnastics Club", locations: ["St Helens"] },
  { name: "HoriZen Academy of Gymnastics", locations: ["Buntingford"] },
  { name: "Horizon", locations: ["Eastleigh", "Southampton"] },
  { name: "Hornsey 8-1 Trampoline", locations: ["London"] },
  { name: "Horsham Gymnastics Club", locations: ["Horsham"] },
  { name: "Huddersfield Trampoline Academy", locations: ["Huddersfield"] },
  { name: "Huntingdon Olympic Gymnastics Club", locations: ["Huntingdon"] },
  { name: "i-star Academy", locations: ["Shoreham by Sea"] },
  { name: "Ibex", locations: ["Bonnyrigg", "Edinburgh"] },
  { name: "Iceni Gymnastics", locations: ["Colchester"] },
  { name: "Iconix Gymnastics Club", locations: ["London"] },
  { name: "Idsall Gymnastics & Trampolining", locations: ["Newport", "Shifnal"] },
  { name: "Ilkley Gym", locations: ["Ilkley"] },
  { name: "Illusion GC", locations: ["Glasgow"] },
  { name: "Impulse Trampoline Club", locations: ["Dunmow"] },
  { name: "Inertia Gymnastics Academy", locations: ["Newry"] },
  { name: "Infinity Gymnastics", locations: ["Horsham"] },
  { name: "Innovate Gymnastics Club", locations: ["Callander", "Glasgow"] },
  { name: "Inspire Excellence", locations: ["Dagenham", "London", "Romford", "Woodford green"] },
  { name: "Inspire Gymnastics", locations: ["Salisbury"] },
  { name: "Inspire Gymnastics Academy", locations: ["Nottingham"] },
  { name: "Inspire Gymnastics Academy SCOTLAND", locations: ["Glasgow"] },
  { name: "Inverness GC", locations: ["Inverness"] },
  { name: "Inverness TC", locations: ["Inverness"] },
  { name: "Invert Gymnastics", locations: ["Birmingham"] },
  { name: "Inverurie Gymnastics Club", locations: ["Inverurie"] },
  { name: "Invictus Yorkshire Gymnastics", locations: ["Sheffield"] },
  { name: "Invoke Gymnastics Club", locations: ["Burntwood"] },
  { name: "Ipswich Four Trampoline Club", locations: ["Ipswich"] },
  { name: "Irvine Bay GC", locations: ["Irvine"] },
  { name: "Isle of Lewis GC", locations: ["Stornaway"] },
  { name: "Isle of Mull GC", locations: ["ISLE OF MULL", "Isle of Mull", "Oban"] },
  { name: "Ivybridge Gym Academy", locations: ["Ivybridge"] },
  { name: "J Star", locations: ["Salisbury"] },
  { name: "J21 Gymnastics Club", locations: ["Weston-Super-Mare"] },
  { name: "Jack Kane GC", locations: ["Edinburgh"] },
  { name: "Jaybee Gymnastics", locations: ["Hornchurch", "Rainham", "Romford"] },
  { name: "Jaybee Havering", locations: ["Hornchurch", "Romford"] },
  { name: "Jays Gymnastics", locations: ["Grays"] },
  { name: "Jersey Gymnastics", locations: ["Jersey"] },
  { name: "Jesters Gymnastics Club", locations: ["Pontefract"] },
  { name: "JGA", locations: ["Beckenham", "Bromley", "Chislehurst", "Croydon", "Eltham", "London", "Norwood", "Orpington", "West Wickham", "Westerham"] },
  { name: "JJ's Gymnastics Academy", locations: ["Pontefract"] },
  { name: "JNB Gymnastics Academy", locations: ["Stratford-upon-avon"] },
  { name: "Joe Fraser", locations: ["Lichfield"] },
  { name: "Jolly Gymnastics", locations: ["Hoveton", "Norwich"] },
  { name: "JS Gymnastics", locations: ["Evesham"] },
  { name: "JUMP GC", locations: ["Cumbernauld"] },
  { name: "Jump Trampoline", locations: ["Hailsham"] },
  { name: "Jump UK", locations: ["Leyland"] },
  { name: "Jumpers Trampoline Club", locations: ["Gillingham"] },
  { name: "Jumping Jacks", locations: ["Barnet"] },
  { name: "Junior Sport Stars School of", locations: ["Stockport"] },
  { name: "Jurassic", locations: ["Weymouth"] },
  { name: "Just Gymnastics", locations: ["Wilmslow"] },
  { name: "JymKidz", locations: ["N Newtownards"] },
  { name: "K-Squared Gymnastics", locations: ["Oxford"] },
  { name: "Kaboom Trampolining Club", locations: ["Beckenham"] },
  { name: "Kaleidoscope Gymnastics Cheer &", locations: ["Belfast"] },
  { name: "KC Gymnastics", locations: ["Glasgow"] },
  { name: "Kendal Gymnastics Club Ltd", locations: ["Kendal"] },
  { name: "Kennylands Gymnastics CIC", locations: ["Reading"] },
  { name: "Kensington & Chelsea Gymnastics Academy", locations: ["London"] },
  { name: "Kent College Gymnastic", locations: ["Tunbridge Wells"] },
  { name: "Kernow", locations: ["Newquay"] },
  { name: "Kestrel Acrobatics &", locations: ["Bristol"] },
  { name: "Kestrel Gymnastics", locations: ["Edinburgh"] },
  { name: "Kestrel Gymnastics Academy K.G.A", locations: ["Ashford"] },
  { name: "Kestrel Trampoline", locations: ["N Newtownards"] },
  { name: "Kettering Gymnastics", locations: ["Kettering"] },
  { name: "Kiani Gymnastics Academy", locations: ["Romford"] },
  { name: "Kilmarnock Acro GC", locations: ["Kilmarnock"] },
  { name: "King Edmund Acro", locations: ["Yate"] },
  { name: "Kingdom Gymnastics Trust", locations: ["Dunfermline"] },
  { name: "Kings Gymnastics Academy", locations: ["Bury St Edmunds", "Newmarket", "Norwich"] },
  { name: "Kings Hill Gymnastics Academy", locations: ["East Peckham"] },
  { name: "Kings Lynn Gymnastic Club", locations: ["King's Lynn"] },
  { name: "Kingsbridge Gymnastics", locations: ["Kingsbridge"] },
  { name: "Kingston GC", locations: ["GLASGOW", "Glasgow"] },
  { name: "Kingston Trampoline", locations: ["Chessington", "Kingston Upon Thames", "New Malden", "Walton on Thames"] },
  { name: "Kingston Vale Gym Club", locations: ["Loughborough"] },
  { name: "Kirkby Trampoline", locations: ["Kirkby in Ashfield"] },
  { name: "Kirkcaldy", locations: ["Kirkcaldy"] },
  { name: "Kirklees Rebound Tramp Club", locations: ["Huddersfield"] },
  { name: "Kirklees Trampoline Gymnastics", locations: ["huddersfield"] },
  { name: "Lace Hill Gymnastics Club", locations: ["Buckingham"] },
  { name: "Lady Hawkins Gymnastics Club", locations: ["Kington"] },
  { name: "Lala Yusifova Gymnastics Academy", locations: ["Brighton", "London"] },
  { name: "Largs", locations: ["Largs"] },
  { name: "Lasswade GC", locations: ["Bonnyrigg"] },
  { name: "Launchpad Trampoline Academy Hull", locations: ["Hull"] },
  { name: "Leamington and Warwick Gymnastics Club", locations: ["Leamington Spa"] },
  { name: "Leaps and Bounds Gymnastics Club Ltd", locations: ["Potters Bar"] },
  { name: "Leatherhead & Dorking Gym", locations: ["Leatherhead"] },
  { name: "Leeds Gymnastics Club", locations: ["Leeds"] },
  { name: "Legacy Gymnastics Club", locations: ["Inverkeithing"] },
  { name: "Lenzie Woodhead GC", locations: ["GLASGOW", "Glasgow"] },
  { name: "Levenmouth GC", locations: ["Levenmouth"] },
  { name: "Levitation", locations: ["Hemel Hempstead", "London"] },
  { name: "Liberty Gymnastics Club", locations: ["Camberley"] },
  { name: "Liberty Gymnastics Club (South West)", locations: ["Frome"] },
  { name: "Lifestyle Gymnastics Academy", locations: ["Ballymena"] },
  { name: "Lightning School of Gymnastics", locations: ["Sevenoaks"] },
  { name: "Lincoln City Gym Club", locations: ["Lincoln"] },
  { name: "Lincoln Gymnastics Club", locations: ["Lincoln"] },
  { name: "Lincoln Imps", locations: ["Lincoln"] },
  { name: "Lings Gymnastics Sports Academy", locations: ["Northampton"] },
  { name: "Links Gymnastics (Berkshire) Ltd", locations: ["Ascot", "Windsor"] },
  { name: "Linlithgow School of Gymnastics", locations: ["Linlithgow"] },
  { name: "Little Socks Gymnastics", locations: ["London"] },
  { name: "Littledown Gymnastics Club", locations: ["Bournemouth"] },
  { name: "Liverpool Trampoline Gymnastics Academy", locations: ["Liverpool"] },
  { name: "LJ Dance & Gymnastics (LJ D&G)", locations: ["Chorley", "Leyland"] },
  { name: "LK Aerobic Gymnastics", locations: ["Rufford", "Southport"] },
  { name: "London Borough of Hillingdon Gymnastics Club", locations: ["Hayes"] },
  { name: "London Falcons Trampoline Club", locations: ["London"] },
  { name: "London Gymnastics School of", locations: ["London"] },
  { name: "London Sport Academy", locations: ["London"] },
  { name: "London Trampoline Academy and London DMT", locations: ["Isleworth", "London"] },
  { name: "Long Eaton", locations: ["Nottingham"] },
  { name: "Longridge Gymnastics Club", locations: ["Preston"] },
  { name: "Lothian Springers TC", locations: ["Edinburgh"] },
  { name: "Loughborough Acrobatics Gymnastics Club", locations: ["Loughborough"] },
  { name: "Loughborough Gymnastics", locations: ["Loughborough"] },
  { name: "LS Gymnastics Crewe Academy", locations: ["Crewe"] },
  { name: "Luminites Gymnastics", locations: ["West Wickham"] },
  { name: "Lunar GC", locations: ["Lanark"] },
  { name: "Luton Gymnastics", locations: ["Luton"] },
  { name: "LX Community Gymnastics Centre CIC", locations: ["Belfast"] },
  { name: "LX Gymnastics Club", locations: ["Belfast"] },
  { name: "Lynx Aylesbury", locations: ["Aylesbury"] },
  { name: "M.A.B Gymnastics Club", locations: ["Northampton"] },
  { name: "Macclesfield T. Club", locations: ["Macclesfield", "Wilmslow"] },
  { name: "Macduff", locations: ["Montrose"] },
  { name: "Maidstone Gym Club", locations: ["Maidstone"] },
  { name: "Majestic Gymnastics", locations: ["Bristol"] },
  { name: "Manchester Academy of", locations: ["Salford"] },
  { name: "Mansfield Olympic Gym", locations: ["Mansfield"] },
  { name: "Manx Gym Centre Of Excellence", locations: ["Douglas"] },
  { name: "Market Harborough Trampoline Academy", locations: ["Market Harborough"] },
  { name: "Marriotts Gymnastics Club", locations: ["Stevenage"] },
  { name: "Marshside Gymnastics Club", locations: ["Southport"] },
  { name: "Matrix Gymnastics Academy", locations: ["Wellingborough"] },
  { name: "Max Force", locations: ["Dorking", "Tadworth", "Wallington"] },
  { name: "Mayfield Gymnastics Club", locations: ["London"] },
  { name: "Meadowbank GC", locations: ["Dalkeith"] },
  { name: "Meridian Gym", locations: ["Beverley"] },
  { name: "Meridian Gymnastics", locations: ["Yaxley"] },
  { name: "Merton Gymnastics Club", locations: ["Mitcham"] },
  { name: "Mid Suffolk Gymnastics Club", locations: ["Stowmarket"] },
  { name: "Middlebeck Gymnastics Club", locations: ["Newark"] },
  { name: "Middleton Gymnastics Club", locations: ["Middleton"] },
  { name: "Midlands Gymnastics Academy", locations: ["Nuneaton"] },
  { name: "Midlothian GC", locations: ["Bonnyrigg", "Midlothian"] },
  { name: "Milton Keynes Gym", locations: ["Milton Keynes"] },
  { name: "Milton Keynes Trampoline & DMT Academy", locations: ["Milton Keynes"] },
  { name: "Minra Gymnastics", locations: ["BIRMINGHAM", "Brentford", "Ormskirk", "Skelmersdale", "Willenhall"] },
  { name: "Momentum", locations: ["Kidderminster", "Tenbury Wells"] },
  { name: "Monarchs Sports Acro Club", locations: ["Highbridge"] },
  { name: "Monkton", locations: ["Millom"] },
  { name: "Monkton Gymnastics Club", locations: ["Jarrow"] },
  { name: "Mulbarton Gymnastic Club", locations: ["Norwich"] },
  { name: "Muswell Hill Rhythmic Gymnastics", locations: ["London"] },
  { name: "N C A A C Gymnastics", locations: ["Northampton"] },
  { name: "N&D Gymnastics Club", locations: ["Glasgow"] },
  { name: "Nemo's", locations: ["Oxford"] },
  { name: "Nemo's Gymnastics", locations: ["Witney"] },
  { name: "Nene Valley R G", locations: ["Kettering", "Northampton", "Wellingborough"] },
  { name: "New Ash Green Gymnastics", locations: ["Longfield"] },
  { name: "New Forest Aerobic Gymnastics", locations: ["Southampton"] },
  { name: "New Forest Gymnastics Club", locations: ["Lymington"] },
  { name: "New Horizon Gymnastics", locations: ["SALISBURY", "Shaftesbury"] },
  { name: "Newry Olympic Gymnastics Club", locations: ["Newry"] },
  { name: "Newton Abbot", locations: ["Newton Abbot"] },
  { name: "Newton Mearns Gymnastics Club", locations: ["Glasgow"] },
  { name: "Newtown Gymnastics", locations: ["Irvine"] },
  { name: "Nidderdale Gymnastics", locations: ["Harrogate", "Ripon"] },
  { name: "Night Flyers Trampoline Club", locations: ["Nottingham"] },
  { name: "Nile Wilson Gymnastics Academy", locations: ["London"] },
  { name: "Nile Wilson Gymnastics Burnley", locations: ["Burnley"] },
  { name: "Nile Wilson Gymnastics Coventry", locations: ["Coventry"] },
  { name: "Nile Wilson Gymnastics Leeds", locations: ["Leeds"] },
  { name: "Nile Wilson Gymnastics Mansfield", locations: ["Mansfield"] },
  { name: "Nile Wilson Gymnastics Rotherham", locations: ["Rotherham"] },
  { name: "Nile Wilson Gymnastics Wirral", locations: ["Wirral"] },
  { name: "Nile Wilson Gymnastics Wolverhampton", locations: ["Wolverhampton"] },
  { name: "Nitro Gymnastics and Trampolining", locations: ["Beckenham", "West Wickham"] },
  { name: "Normanton Sports Acro", locations: ["Normanton"] },
  { name: "North Apex Gymnastics", locations: ["Wick Caithness"] },
  { name: "North Birmingham Community Gymnastics", locations: ["Sutton Coldfield"] },
  { name: "North Devon Display G C", locations: ["Bideford"] },
  { name: "North Down Trampoline Academy", locations: ["Bangor"] },
  { name: "North East Gymnastics Academy", locations: ["Newcastle Upon Tyne"] },
  { name: "North East Gymnastics Centre", locations: ["Banff", "Ellon", "Inverurie"] },
  { name: "North Kirklees Special Gymnastic Club", locations: ["Batley"] },
  { name: "North Lakes Gymnastics", locations: ["Penrith"] },
  { name: "North Leeds Gymnastics Academy Community Club", locations: ["Boston Spa Wetherby"] },
  { name: "North London Gymnastics Club", locations: ["Edgware", "London", "Stanmore"] },
  { name: "North London Rhythmic Gymnastics Academy", locations: ["London"] },
  { name: "North Northants Gym Club", locations: ["Kettering"] },
  { name: "North Oxford Gymnastics", locations: ["Witney"] },
  { name: "North Staffordshire Trampolining", locations: ["Newcastle-under-Lyme", "Stoke On Trent"] },
  { name: "North Star Gymnastics", locations: ["Huddersfield"] },
  { name: "North Star Trampoline Club", locations: ["Newcastle Upon Tyne"] },
  { name: "North Walsham Gymnastics", locations: ["North Walsham"] },
  { name: "Northampton Gymnastics Academy", locations: ["Northampton"] },
  { name: "Northampton School of Rhythmic Gymnastics", locations: ["Northampton"] },
  { name: "Northamptonshire Trampoline Gymnastics Academy", locations: ["Moulton Park"] },
  { name: "Northern Hope Gym", locations: ["Birtley"] },
  { name: "Northwood Gymnastics", locations: ["Northwood"] },
  { name: "Norwich Gymnastics Club", locations: ["Norwich"] },
  { name: "Nottingham City", locations: ["Nottingham"] },
  { name: "Nottingham City Gymnastics", locations: ["Nottingham"] },
  { name: "Notts Gymnastics", locations: ["Nottingham"] },
  { name: "Nova Gymnastics Academy", locations: ["NEW MILTON", "New Milton"] },
  { name: "Number 1 Gymnastic Club CIC Ltd", locations: ["Minehead"] },
  { name: "Nuneaton Gymnastics Club", locations: ["Nuneaton"] },
  { name: "O.K Gymnastics", locations: ["London"] },
  { name: "O'Neills Gymnastics", locations: ["Belfast"] },
  { name: "Oadby & Leicester Gymnastics", locations: ["Leicester", "Market Harborough"] },
  { name: "Oakham Artistic Gymnastic", locations: ["Oakham"] },
  { name: "Okehampton Flyers Gym, Trampoline & DMT Club", locations: ["Holsworthy", "Okehampton"] },
  { name: "Oldham Central Trampoline Club", locations: ["Manchester"] },
  { name: "One More Gymnastics", locations: ["Northallerton"] },
  { name: "One Step Rhythmic Gymnastics Club", locations: ["Blackpool"] },
  { name: "Orchard Gymnastics Club", locations: ["Armagh"] },
  { name: "Orkney Gymnastics Club", locations: ["Kirkwall"] },
  { name: "Orpington Gymnastic Club", locations: ["Orpington"] },
  { name: "Oxford Academy of Gymnastics", locations: ["Thame"] },
  { name: "Oxford Rhythmic", locations: ["Oxford"] },
  { name: "Oxford University Gym", locations: ["Oxford", "Wallingford"] },
  { name: "Oxford University Trampoline", locations: ["Oxford"] },
  { name: "P.H.D. Fundamentals", locations: ["Galashiels", "Peebles"] },
  { name: "P4G (Passion4Gymnastics)", locations: ["Blackburn", "Rossendale"] },
  { name: "Panache", locations: ["Batley"] },
  { name: "Paragon Gymnastics Academy", locations: ["Reddish"] },
  { name: "Park Elite Trampoline Club", locations: ["North Shields"] },
  { name: "Park Wrekin Gymnastics Club Ltd", locations: ["Telford"] },
  { name: "Peak! Gymnastics NI", locations: ["N Newtownards"] },
  { name: "Pegasus GC", locations: ["Dundee", "Newport On Tay", "Tayport"] },
  { name: "Pegasus Gymnastics", locations: ["Maidstone"] },
  { name: "Pegasus Trampoline Club", locations: ["Ipswich"] },
  { name: "Peninsula Trampoline Club", locations: ["N Newtownabbey", "N Newtownards"] },
  { name: "Penketh Gymnastics Club", locations: ["Warrington"] },
  { name: "Pennine Gymnastics CIC", locations: ["Holmfirth", "Huddersfield"] },
  { name: "Penrith Gymnastics Club", locations: ["Penrith"] },
  { name: "Penryn Gymnastics", locations: ["Penryn"] },
  { name: "Pentland GC", locations: ["Balerno", "Currie"] },
  { name: "Penzance Gym Club", locations: ["Penzance"] },
  { name: "Perfect 10", locations: ["Barking", "London"] },
  { name: "Perform Better Gymnastics Academy C.I.C.", locations: ["Enfield", "London"] },
  { name: "Performance Trampoline Gymnastics", locations: ["Lancing", "Worthing"] },
  { name: "Performers Gymnastics Academy", locations: ["Clacton-on-sea"] },
  { name: "Perth GC", locations: ["Perth"] },
  { name: "Peterborough Gymnastics Academy", locations: ["Peterborough"] },
  { name: "Phoenix (Forfar) GC", locations: ["Brechin", "Dundee", "Forfar"] },
  { name: "Phoenix Flyers", locations: ["London"] },
  { name: "Phoenix Gymnastics", locations: ["Camborne"] },
  { name: "Phoenix Gymnastics Academy", locations: ["Sheffield"] },
  { name: "Phoenix Gymnastics NI C.I.C", locations: ["Antrim", "Toomebridge"] },
  { name: "Phoenix High Flyers", locations: ["Pocklington"] },
  { name: "Phoenix Legends Gym", locations: ["Woodston"] },
  { name: "Phoenix Trampolining Club", locations: ["Langley"] },
  { name: "Phoenixwood Gymnastics Club", locations: ["Nottingham"] },
  { name: "Pinewood Gymnastics Club", locations: ["Wokingham"] },
  { name: "Pinnacle Trampoline", locations: ["Reading"] },
  { name: "Pipers Vale Gymnastics", locations: ["Ipswich"] },
  { name: "Pivotal", locations: ["Bourenmouth", "Bournemouth", "Christchurch"] },
  { name: "Pix Gymnastics Club", locations: ["Arlesey"] },
  { name: "Planet Gymnastics", locations: ["Derry/Londonderry", "Londonderry"] },
  { name: "Platinum Gymnastics Academy", locations: ["Benfleet"] },
  { name: "Plymouth Swallows School Of Gym", locations: ["Plymouth"] },
  { name: "Poise and Balance gymnastics club", locations: ["LONDON"] },
  { name: "Poise Gymnastics Club", locations: ["Crawley"] },
  { name: "Poole Gymnastics & Trampolining", locations: ["Poole"] },
  { name: "Port Regis Gym Club", locations: ["Shaftesbury"] },
  { name: "Portsmouth Gymnastics", locations: ["Portsmouth"] },
  { name: "Portsmouth School Of Gym", locations: ["Portsmouth"] },
  { name: "Portsmouth Trampoline Club", locations: ["Portsmouth"] },
  { name: "Power GT", locations: ["Birmingham"] },
  { name: "Precision Gymnastics", locations: ["Battersea", "London"] },
  { name: "Preston City Trampoline", locations: ["Preston"] },
  { name: "Prime Acrobatics Ltd", locations: ["Camberley", "Woking"] },
  { name: "Pro-Star Gymnastics Academy", locations: ["N Newtownards"] },
  { name: "Propulsion Trampolining Club", locations: ["Birkenhead"] },
  { name: "Putney Gymnastics Academy Ltd", locations: ["London"] },
  { name: "Pyramid Acro Gym Club", locations: ["Sneinton"] },
  { name: "Quayside Trampoline & Gym Club", locations: ["Bridgwater"] },
  { name: "Queens Gymnastics", locations: ["Bangor", "Holywood"] },
  { name: "Queensmead Trampoline Club", locations: ["South Ruislip"] },
  { name: "Raans Chiltern Gym", locations: ["Amersham"] },
  { name: "Rainbow Gym Club C.I.C", locations: ["Belfast"] },
  { name: "Ratae Gymnastic Club", locations: ["Leicester"] },
  { name: "Rathgael Gymnastics & Tumbling Club", locations: ["Bangor"] },
  { name: "Raven Valley Gym Club C.I.C", locations: ["STANLEY"] },
  { name: "React Trampoline & Gymnastics Club", locations: ["Hereford"] },
  { name: "Reading Trampoline Club", locations: ["Reading"] },
  { name: "Rebound Gymnastics", locations: ["Solihull"] },
  { name: "Recoil Trampoline Club", locations: ["Brentwood"] },
  { name: "Red Shoes", locations: ["Blackpool"] },
  { name: "Redcar Gymnastics and Sports Club", locations: ["Redcar"] },
  { name: "Redhill & Reigate Gym Club", locations: ["Redhill"] },
  { name: "Regis Gymnastics Club", locations: ["Bognor Regis"] },
  { name: "Retford Gymnastics Club", locations: ["Retford"] },
  { name: "Revolution Gymnastics Club", locations: ["Birmingham"] },
  { name: "Revolve Trampoline Club", locations: ["Beckenham", "LONDON", "Westerham"] },
  { name: "RG1", locations: ["Reading"] },
  { name: "RGC Dynamo", locations: ["London"] },
  { name: "Rhythmic Excellence", locations: ["London"] },
  { name: "Rhythmic Gymnastics Academy", locations: ["Cobham"] },
  { name: "Rhythmic Gymnastics Club Worcester", locations: ["Worcester"] },
  { name: "Rhythmic Gymnastics School “Inspiration”", locations: ["Bournemouth"] },
  { name: "Rhythmic Sparks", locations: ["Angmering"] },
  { name: "Rib Valley Gymnastics", locations: ["Buntingford"] },
  { name: "Richards Trampoline Club", locations: ["Letchworth"] },
  { name: "Richmond Gymnastics Assoc.", locations: ["Hampton Hill", "Richmond", "Twickenham"] },
  { name: "Richmondshire Thirsk Dales", locations: ["Catterick Garrison", "Middlesbrough", "Thirsk"] },
  { name: "Rickmansworth", locations: ["Banbury"] },
  { name: "Rickmansworth Gymnastics", locations: ["Rickmansworth"] },
  { name: "Ripon Gymnastics Academy", locations: ["Knaresborough", "Ripon", "York"] },
  { name: "Rising Phoenix Gymnastics", locations: ["Nantwich"] },
  { name: "Riverside Gymnastics Academy", locations: ["London"] },
  { name: "RiversMeet Gymnastics Club", locations: ["Gillingham"] },
  { name: "Robert Atkinson Gym Club", locations: ["Thornaby"] },
  { name: "Robin Hood Gymnastics", locations: ["LEICESTER", "NOTTINGHAM", "Nottingham"] },
  { name: "Rochdale Olympic Gym Club", locations: ["Rochdale"] },
  { name: "Rock Steady Crew Tramp Club", locations: ["Croydon"] },
  { name: "Rotate Gymnastics", locations: ["Potters Bar"] },
  { name: "Rotations", locations: ["Huntingdon"] },
  { name: "Rotherham Sports Acro Club", locations: ["Rotherham"] },
  { name: "Rothwell", locations: ["Leeds"] },
  { name: "Rowan Gymnastics Club", locations: ["Cheltenham"] },
  { name: "Royal Navy Gymnastics Team", locations: ["Portsmouth", "Yeovil"] },
  { name: "Rugby Gymnastics", locations: ["Rugby"] },
  { name: "Rushmoor Gymnastics Academy", locations: ["Aldershot"] },
  { name: "SAADI Gymnastics Ltd", locations: ["Redbourn"] },
  { name: "Saltaire Gym Club", locations: ["Baildon"] },
  { name: "Saltire Team", locations: ["Dalkeith", "Edinburgh", "Eyemouth", "Tranent"] },
  { name: "Salto", locations: ["Dundee"] },
  { name: "Salto Gymnastics Club", locations: ["Luton"] },
  { name: "Sandbach Gymnastics", locations: ["Sandbach"] },
  { name: "Sandwell", locations: ["Wednesbury"] },
  { name: "Sansom School Of Fitness", locations: ["Portsmouth"] },
  { name: "Sapphire GC", locations: ["Glasgow"] },
  { name: "Sarah's Gymnastics School", locations: ["Gloucester"] },
  { name: "Sarah's Mini", locations: ["Sheffield"] },
  { name: "Sarnia Trampoline", locations: ["Guernsey"] },
  { name: "Sarnia Trampoline Club", locations: ["Guernsey"] },
  { name: "Scarborough Gym", locations: ["Scarborough"] },
  { name: "Scorpio Gymnastics Club", locations: ["Bo'ness"] },
  { name: "Scotia Trampoline Academy", locations: ["Paisley"] },
  { name: "Seaford Gymnastics Academy", locations: ["Newhaven"] },
  { name: "Seaham Gymnastics Club", locations: ["Seaham"] },
  { name: "Seaside Trampoline Academy", locations: ["Ferndown"] },
  { name: "Selby Swans Gymnastics Academy", locations: ["Selby"] },
  { name: "Setanta Fitness Gymnastics", locations: ["Armagh"] },
  { name: "Sevenoaks Royals", locations: ["Sevenoaks"] },
  { name: "Severn Gymnastics & Trampoline Club", locations: ["Shrewsbury"] },
  { name: "Severn Valley Gymnastics", locations: ["Gloucester"] },
  { name: "Shantallow Gymnastics", locations: ["Londonderry"] },
  { name: "Sharecroft Gymnastics", locations: ["Swadlincote"] },
  { name: "Sheer Velocity Tumbling Club", locations: ["Gloucester"] },
  { name: "Sheffield", locations: ["Sheffield"] },
  { name: "Sheffield All-Stars Gymnastics Academy", locations: ["Sheffield"] },
  { name: "Sheffield Elites Gymnastics Academy", locations: ["SHEFFIELD"] },
  { name: "Sheffield Performance Trampoline & Gymnastics Club", locations: ["Sheffield"] },
  { name: "Sheffield Trampoline Academy", locations: ["Sheffield"] },
  { name: "Shepton Mallet Gym", locations: ["Shepton Mallet"] },
  { name: "Sherburn Community Gymnastics", locations: ["Leeds"] },
  { name: "Sherwood Oaks Gymnastics Academy", locations: ["Sutton-in-ashfield"] },
  { name: "Shetland", locations: ["Shetland"] },
  { name: "Shine Acrobatic Gymnastics Club", locations: ["Barton-le-Clay"] },
  { name: "Shine Bright", locations: ["London"] },
  { name: "Shine Trampoline Club", locations: ["Aberdeen", "Inverurie"] },
  { name: "Shirley Gymnastics Club", locations: ["Croydon"] },
  { name: "Shooting Stars", locations: ["Telford"] },
  { name: "Shooting Stars Gym Ltd", locations: ["Brighton", "Hassocks", "Henfield", "Hove", "Lewes", "Pulborough", "Worthing"] },
  { name: "Shooting Starz Gymnastics", locations: ["Londonderry"] },
  { name: "Shrewsbury Gymnastics Academy", locations: ["Newport", "Shrewsbury"] },
  { name: "Sika Gymnastics Club", locations: ["Coleraine"] },
  { name: "Silhouettes Rhythmic Gym", locations: ["Alton"] },
  { name: "Silk", locations: ["Macclesfield"] },
  { name: "Silverline Gymnastics Club", locations: ["South Croydon"] },
  { name: "SIMMSplitz", locations: ["Twickenham"] },
  { name: "Sittingbourne Swifts", locations: ["Gillingham", "Sittingbourne"] },
  { name: "Sky High Gymnastics", locations: ["Poole"] },
  { name: "Sky High Trampoline Gymnastics Academy", locations: ["Uckfield"] },
  { name: "Skybound", locations: ["Ashford Kent", "Benenden"] },
  { name: "Skyline Gymnastics", locations: ["Sheffield"] },
  { name: "Skyscrapers Trampoline", locations: ["Leeds"] },
  { name: "Skywalkers", locations: ["London"] },
  { name: "SLC Gymnastics and Trampolining", locations: ["Stafford"] },
  { name: "Sleaford Elite Gym Club", locations: ["Sleaford"] },
  { name: "Sleaford Gymnastics", locations: ["Sleaford"] },
  { name: "Smiles For", locations: ["Bacup"] },
  { name: "Soar Valley Trampoline Club", locations: ["Leicester"] },
  { name: "Sobell Trampoline Club", locations: ["London"] },
  { name: "Sokol Gymnastics Academy", locations: ["Castlewellan"] },
  { name: "Solent Gymnastics Club", locations: ["Havant"] },
  { name: "Solihull Olympic Gymnastics Club", locations: ["Solihull"] },
  { name: "Solway GC", locations: ["Dumfries"] },
  { name: "South Ayrshire GC", locations: ["Ayr"] },
  { name: "South Devon School Of Gym", locations: ["Paignton"] },
  { name: "South Essex Gymnastics Club", locations: ["Basildon"] },
  { name: "South Lanarkshire TC", locations: ["East Kilbride"] },
  { name: "South Shropshire Gymnastics Club", locations: ["Craven Arms Shropshire", "Ludlow"] },
  { name: "South Staffs Acrobatic", locations: ["Cannock"] },
  { name: "South Staffs Acrobatics", locations: ["Cannock"] },
  { name: "South Tyneside Gym Club", locations: ["South Shields"] },
  { name: "Southampton Gym", locations: ["Southampton"] },
  { name: "Southampton Trampoline Club", locations: ["Eastleigh"] },
  { name: "Southbourne Gymnastics Club", locations: ["Emsworth"] },
  { name: "Southport Gymnastics Club", locations: ["Southport"] },
  { name: "Sovereign", locations: ["Redhill"] },
  { name: "Space Athlete Birmingham", locations: ["Birmingham"] },
  { name: "Spalding & District Gymnastics", locations: ["Spalding"] },
  { name: "Sparkles Gymnastics Club", locations: ["Bracknell", "READING"] },
  { name: "Sparta Trampoline", locations: ["Glasgow"] },
  { name: "Spartac Gym", locations: ["Ormskirk"] },
  { name: "Spectrum", locations: ["Glasgow"] },
  { name: "Spectrum Gymnastics", locations: ["Lingfield"] },
  { name: "Spelthorne Gymnastics", locations: ["Sunbury-on-thames"] },
  { name: "Spiral Gymnastics Club", locations: ["Peterborough"] },
  { name: "Spire Heights Trampolining Club", locations: ["Salisbury"] },
  { name: "Spirit Gymnastics Academy", locations: ["Yeovil"] },
  { name: "Split Leaps", locations: ["Great Yarmouth"] },
  { name: "Splits & Flips Gymnastics", locations: ["Lurgan"] },
  { name: "Splitz Gym Club", locations: ["Weston-super-mare"] },
  { name: "Splitz Gymnastics Club- NI", locations: ["Enniskillen"] },
  { name: "Sponte Sua Gym", locations: ["London"] },
  { name: "Sportac", locations: ["Feltham"] },
  { name: "Sports Club", locations: ["Newcastle Upon Tyne"] },
  { name: "Spring Boxx", locations: ["Malvern"] },
  { name: "Spring Gymnastics Community", locations: ["Norwich"] },
  { name: "SPRINGBOX", locations: ["HENLEY-ON-THAMES", "Wallingford"] },
  { name: "Springers Trampolining Club", locations: ["Liverpool"] },
  { name: "Springfield Trampoline Academy", locations: ["Lancashire"] },
  { name: "St Albans Gymnastics Club", locations: ["ST ALBANS"] },
  { name: "St Helens Centre For", locations: ["St. Helens"] },
  { name: "St Peter's Gym Club", locations: ["Saltburn-by-the-Sea"] },
  { name: "Stafford Gymnastics Academy", locations: ["Burntwood", "Stafford"] },
  { name: "Stainsby School of Gymnastics", locations: ["Stockton-on-tees"] },
  { name: "Stalder Academy of Gymnastics", locations: ["Sale"] },
  { name: "Stamford Gymnastics Club", locations: ["Stamford"] },
  { name: "Stanmore Gymnastics", locations: ["Stanmore"] },
  { name: "Starbound Gymnastics", locations: ["BROMSGROVE"] },
  { name: "Starjumpers", locations: ["Southampton"] },
  { name: "Starjumpers Gym Club", locations: ["Bristol"] },
  { name: "Stars Academy", locations: ["Welwyn Garden City"] },
  { name: "Stars Gym Club Ltd", locations: ["BRIGHTON", "Brighton", "Hassocks", "Henfield", "Hove", "Lewes", "Pulborough", "WORTHING"] },
  { name: "Stay Active", locations: ["Ongar"] },
  { name: "Stay Active Allstars", locations: ["Saffron Walden", "Sawbridgeworth"] },
  { name: "Stellar Gymnastics", locations: ["Farnham"] },
  { name: "Stenhousemuir Gymnastics Club", locations: ["Falkirk"] },
  { name: "Stevenage Sports Acro", locations: ["Stevenage"] },
  { name: "Stewarton TC", locations: ["Kilmarnock"] },
  { name: "STGWC14", locations: ["South Shields"] },
  { name: "Stirling City GC", locations: ["Stirling"] },
  { name: "Stirling Uni TC & GC", locations: ["Stirling"] },
  { name: "Stockport Rhythmic Gym Club", locations: ["Stockport"] },
  { name: "Stockport School Of Gymnastics Ltd", locations: ["Stockport"] },
  { name: "Stocksbridge Gymnastics", locations: ["Sheffield"] },
  { name: "Stoke Trampolining & Gymnastics Club", locations: ["Stoke-on-Trent"] },
  { name: "Stonehaven", locations: ["Stonehaven"] },
  { name: "Storm Gymnastics", locations: ["Glasgow", "Paisley"] },
  { name: "Streatham Gymnastics Club", locations: ["London"] },
  { name: "Streetly Gymnastics Club", locations: ["Sutton Coldfield"] },
  { name: "Stubbington Springboard Gymnastics", locations: ["Fareham"] },
  { name: "Studley Straddlers", locations: ["Studley"] },
  { name: "Style 90 Gym", locations: ["Stafford"] },
  { name: "Sudbury Gymnastics Club", locations: ["Sudbury"] },
  { name: "Suki Aerobics Gym Club", locations: ["Gosport"] },
  { name: "Summerfields Gym Club", locations: ["Hastings"] },
  { name: "Summersaults", locations: ["Redhill"] },
  { name: "SunnyStarz", locations: ["St Nicholas At Wade"] },
  { name: "Surrey Hills Rhythmic Gymnastics", locations: ["Weybridge"] },
  { name: "Sussex Martlets Trampoline Club", locations: ["Worthing"] },
  { name: "Sussex Springers", locations: ["Hassocks"] },
  { name: "Sutton Gymnastics Academy", locations: ["Sutton"] },
  { name: "Sutton School Of Gymnastics", locations: ["Mitcham"] },
  { name: "Swallows Gym", locations: ["Chelmsford"] },
  { name: "Swallows Of Helston Gym Club", locations: ["Helston"] },
  { name: "Swanage", locations: ["Swanage"] },
  { name: "Swindon School Of Gymnastics", locations: ["Swindon"] },
  { name: "Symmetry Gymnastics Club", locations: ["Chatham"] },
  { name: "Synergy", locations: ["Coventry"] },
  { name: "Synergy Gymnastics London", locations: ["Borough", "Camberwell", "London"] },
  { name: "T J Gymnastics Academy Boston", locations: ["Boston"] },
  { name: "Tamworth Olympic Gym Club", locations: ["Tamworth"] },
  { name: "Tankerton Dancing Academy Gym", locations: ["Whitstable"] },
  { name: "Tanya's Tumblers", locations: ["Sunderland"] },
  { name: "Taunton Trampolining and Gymnastics Academy (TTGA)", locations: ["Taunton"] },
  { name: "Tay Trampoline", locations: ["Dundee"] },
  { name: "Tay Trampoline Club", locations: ["Newport On Tay"] },
  { name: "Team Bath Rhythmic Gymnastics", locations: ["Bath"] },
  { name: "Tees Valley Gymnastics Club", locations: ["Middlesbrough"] },
  { name: "Teesside Academy of Gymnastics", locations: ["Middlesbrough"] },
  { name: "Tekne Gymnastics", locations: ["London"] },
  { name: "Temple-Newsam Halton", locations: ["Leeds"] },
  { name: "Tetbury Gymnastics Club", locations: ["Tetbury"] },
  { name: "TGA Gymnastics Limited", locations: ["Wokingham", "Yateley"] },
  { name: "Thames Valley School of Trampolining", locations: ["Thame"] },
  { name: "Thanet Gymnastic", locations: ["Margate"] },
  { name: "Thanet Gymnastic Club", locations: ["Margate"] },
  { name: "The", locations: ["Bristol", "Gravesend"] },
  { name: "The Academy of Gym", locations: ["Chichester"] },
  { name: "The City Of Leeds YMCA", locations: ["Leeds"] },
  { name: "The Gym Centre", locations: ["Cheltenham", "Gloucester", "Tewkesbury"] },
  { name: "The Gymnastics Academy", locations: ["N Newtownards"] },
  { name: "The Gymnastics and Trampoline Network CIC", locations: ["Ballynahinch", "Belfast", "Downpatrick", "Lisburn"] },
  { name: "The Meapa", locations: ["Rochester"] },
  { name: "The Mill Gymnastics", locations: ["Derby"] },
  { name: "The Norfolk Academy of Gymnastics", locations: ["Attleborough"] },
  { name: "The Trampoline Academy", locations: ["Nuneaton", "Warwick"] },
  { name: "The Triangle Centre", locations: ["Burgess Hill"] },
  { name: "The Vault Portstewart", locations: ["Portstewart"] },
  { name: "The Wire Gymnastic Club", locations: ["Warrington"] },
  { name: "Thornaby & Barwick Gymnastic Club", locations: ["STOCKTON-ON-TEES"] },
  { name: "Thornton Gymnastics", locations: ["Thornton-cleveleys"] },
  { name: "Thurrock Gymnastics Academy", locations: ["Grays"] },
  { name: "Tiger Roll Gymnastics Club", locations: ["Hatfield", "London"] },
  { name: "Tigers Acrobatic Gymnastics", locations: ["Tunbridge Wells"] },
  { name: "Tiggers", locations: ["Dundee"] },
  { name: "Tiggers TC", locations: ["Newport-on-Tay"] },
  { name: "Tir Na Nog", locations: ["Newry"] },
  { name: "Titans Gymnastics Club", locations: ["Wisbech"] },
  { name: "TJ's Gymnastics", locations: ["London"] },
  { name: "TK Gymfit", locations: ["Bradford"] },
  { name: "TK Gymnastics Club", locations: ["Bournemouth"] },
  { name: "Tolworth Gym Club", locations: ["Surbiton"] },
  { name: "Tooting Gymnastics Club", locations: ["London"] },
  { name: "Torbay Olympic Gymnastics", locations: ["Torquay"] },
  { name: "Tornadoes Trampoline Club", locations: ["Market Weighton", "Pocklington"] },
  { name: "Trafford Trampoline Club", locations: ["Manchester"] },
  { name: "Trampoline Life", locations: ["Newcastle Upon Tyne"] },
  { name: "Trix Academy", locations: ["Derby"] },
  { name: "Trumpington Rhythmic Gymnastics", locations: ["Cambridge"] },
  { name: "Truro Gymnastics", locations: ["Truro"] },
  { name: "Tryst GC", locations: ["Falkirk"] },
  { name: "TSD Gymnastics", locations: ["Sheffield"] },
  { name: "TSV", locations: ["Cleckheaton"] },
  { name: "Tumble Gymnastics and Activity Centre", locations: ["Newcastle Upon Tyne"] },
  { name: "Tumble Twist & Turn Gymnastic", locations: ["St. Helens"] },
  { name: "Tumbles Academy of Gymnastics", locations: ["Lowton", "Wigan"] },
  { name: "Turnford Gym Club", locations: ["Cheshunt"] },
  { name: "Twist Gymnastics Club", locations: ["Mansfield"] },
  { name: "Twisters Gymnastics Club Ltd", locations: ["Huntingdon"] },
  { name: "Twisters Northwest Gym", locations: ["Londonderry"] },
  { name: "Twizzlers", locations: ["Croydon", "Purley", "South Croydon"] },
  { name: "Two Foot", locations: ["Musselburgh"] },
  { name: "TyneSide Gymnastics Club", locations: ["Whitley Bay"] },
  { name: "Uckfield Gymnastic", locations: ["Near Uckfield"] },
  { name: "Uist Gymnastics", locations: ["Isle Of Benbecula"] },
  { name: "Ultima Trampoline Club", locations: ["Wickford"] },
  { name: "Ultimate", locations: ["Stourbridge West Midlands"] },
  { name: "Unique Gymnastics", locations: ["LEIGH-ON-SEA"] },
  { name: "Unity Power Tumbling", locations: ["Carshalton"] },
  { name: "University of Bristol Trampoline Club", locations: ["Bath"] },
  { name: "University of Southampton Gymnastics", locations: ["Southampton"] },
  { name: "Up'n'Downs Trampoline Club", locations: ["Seaford"] },
  { name: "Upstarts Gymnastics Club CIO", locations: ["Loughborough"] },
  { name: "Urban School of Gymnastics", locations: ["Warrington"] },
  { name: "Utopia", locations: ["Brighouse", "Wakefield"] },
  { name: "Uttoxeter Gymnastics Club", locations: ["Uttoxeter"] },
  { name: "Valdez Gymnastics CIC", locations: ["Ballymena"] },
  { name: "Velocity", locations: ["Billingham"] },
  { name: "Velocity PSC", locations: ["North Shields", "Whitley Bay"] },
  { name: "Vernon Park Gymnastics", locations: ["Stockport"] },
  { name: "Verve Gymnastics", locations: ["Bedford"] },
  { name: "Victory", locations: ["Petworth"] },
  { name: "Virtue movement", locations: ["Reading"] },
  { name: "Virtuosity Gymnastics Club", locations: ["Rayleigh"] },
  { name: "Virtus", locations: ["Dover"] },
  { name: "Vision", locations: ["Henley-on-thames"] },
  { name: "ViSta Gymnastics", locations: ["Livingston"] },
  { name: "Viva Gymnastics Club", locations: ["Portsmouth"] },
  { name: "Vivace Gymnastics", locations: ["Chislehurst"] },
  { name: "Vivace Gymnastics Club", locations: ["Bromley"] },
  { name: "Wade Gymnastics Club", locations: ["Banbury"] },
  { name: "Wakefield Gym Club", locations: ["Wakefield"] },
  { name: "Walsall Gym Club", locations: ["Walsall"] },
  { name: "Walton Gym", locations: ["Walton-on-thames"] },
  { name: "Wansbeck Gymnastics and Trampoline Club", locations: ["ASHINGTON"] },
  { name: "Wantage Gymnastics", locations: ["Stanford In The Vale"] },
  { name: "Ware Gym Club", locations: ["Ware"] },
  { name: "Warrington Gymnastics", locations: ["Warrington"] },
  { name: "Washindi Trampoline Club", locations: ["Crowthorne"] },
  { name: "Washington Gymnastics Club", locations: ["Washington"] },
  { name: "Waterside Gymnastic", locations: ["Southampton"] },
  { name: "Watford Gymnastics Club", locations: ["Watford"] },
  { name: "Waveney Gymnastics", locations: ["Lowestoft"] },
  { name: "Weald Gymnastics Club", locations: ["Tonbridge"] },
  { name: "West Bromwich Gym & Trampoline", locations: ["Wednesbury"] },
  { name: "West Cumbria Gym Club", locations: ["CLEATOR"] },
  { name: "West Dunbartonshire GC", locations: ["Dumbarton"] },
  { name: "West Hull Gymnastics Club", locations: ["Hull"] },
  { name: "West London Gymnastics", locations: ["Greenford"] },
  { name: "West Lothian Artistic GC", locations: ["Bonnyrigg", "Livingston"] },
  { name: "West Wight Trampoline Club", locations: ["Freshwater Isle of Wight"] },
  { name: "West Wiltshire Esprit Gymnastics Club Ltd", locations: ["Trowbridge"] },
  { name: "Westcliff Trampoline Club", locations: ["Hawkwell"] },
  { name: "Westgate", locations: ["Chichester"] },
  { name: "Weston Gymnastics Centre", locations: ["Weston Super Mare"] },
  { name: "Wetherby Gymnastics Club", locations: ["Boston Spa", "Wetherby"] },
  { name: "Weybourne Gym Club", locations: ["Addlestone"] },
  { name: "Weybridge Gym", locations: ["Weybridge"] },
  { name: "Weymouth & Portland Gym Club", locations: ["Weymouth"] },
  { name: "Whirlwinds", locations: ["Wellington", "Weston-super-mare"] },
  { name: "White Oak Gym Club", locations: ["Swanley"] },
  { name: "White Rose Rythmic Gymnastics club", locations: ["Huddersfield"] },
  { name: "Whitehall Gymnastics Club", locations: ["Colchester"] },
  { name: "Whitehaven Gymnastics Club", locations: ["Whitehaven Cumbria"] },
  { name: "WhiteRose Gymnastics Limited", locations: ["Goole"] },
  { name: "Wickers Gym", locations: ["Lancing"] },
  { name: "Wickford Trampoline Centre", locations: ["Wickford"] },
  { name: "Wigan ABC Gymnastics", locations: ["Wigan"] },
  { name: "Wigan Academy of Gymnastics", locations: ["Wigan"] },
  { name: "Wight Flyers Trampoline Club", locations: ["Newport"] },
  { name: "Wigton Gymnastics", locations: ["Wigton"] },
  { name: "WildKatz", locations: ["Hucknall"] },
  { name: "Wilmslow Academy of", locations: ["Wilmslow"] },
  { name: "Wiltshire School Of Gymnastics", locations: ["Melksham"] },
  { name: "Wimbledon Gymnastics Centre", locations: ["London"] },
  { name: "Wirral Gymnastics", locations: ["Prenton"] },
  { name: "Wirral Trampoline Club", locations: ["Birkenhead"] },
  { name: "Witham Hill Gymnastics", locations: ["Lincoln"] },
  { name: "Woburn Sands Gymnastics", locations: ["Milton Keynes"] },
  { name: "Woking Gymnastics", locations: ["Woking"] },
  { name: "Wolds Gymnastics", locations: ["Driffield"] },
  { name: "Woodland Acrobatic Gym Club", locations: ["Flitwick"] },
  { name: "Woodlands Acro-Gymnastics and Trampolining Club", locations: ["Coventry"] },
  { name: "Worcestershire Gymnastics Academy", locations: ["Worcester"] },
  { name: "Worcestershire Special Olympic", locations: ["Kidderminster"] },
  { name: "Worksop Gymnastics Club", locations: ["Worksop"] },
  { name: "Worthing Gymnastics Club", locations: ["Worthing"] },
  { name: "Wotton-under-Edge Gym Club", locations: ["Wotton-under-Edge"] },
  { name: "Wycombe Gymnastics", locations: ["High Wycombe"] },
  { name: "Wyre Forest Gymnastic", locations: ["Kidderminster"] },
  { name: "Wythall Gymnastics Club", locations: ["Birmingham"] },
  { name: "Xcel Gymnastics", locations: ["Waterlooville"] },
  { name: "YMCA North London Gymnastics Club", locations: ["London"] },
  { name: "York City Gymnastics", locations: ["York"] },
  { name: "Zenith Trampoline Club", locations: ["Potters Bar"] },
  { name: "Zero Gravity Academy of Gymnastics and Trampoline", locations: ["Saltash"] },
  { name: "Zippy's Gymnastics Academy", locations: ["Glasgow"] },
  { name: "Zodiac Gymnastics Club", locations: ["Caterham"] }
];

const todayStr = () => new Date().toISOString().split("T")[0];
const isFutureOrToday = (dateStr) => !!dateStr && dateStr >= todayStr();

// Round to 2dp half-up
const round2dp = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

function gymnast_key(roundId, gymnastId, apparatus) {
  return `${roundId}__${gymnastId}__${apparatus}`;
}

// Auto-rotate apparatus for all groups: group gi starts at offset gi
function buildRotations(groups, apparatus, existingRotations) {
  if (!groups.length || !apparatus.length) return existingRotations;
  const updated = { ...existingRotations };
  groups.forEach((group, gi) => {
    if (!updated[group]) {
      updated[group] = apparatus.map((_, ai) => apparatus[(ai + gi) % apparatus.length]);
    }
  });
  return updated;
}

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.trim().split("\n").map(l =>
    l.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
  );
  if (lines.length < 2) return [];
  const headers = lines[0].map(h => h.toLowerCase());
  return lines.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
}

function downloadTemplate() {
  const headers = ["Name", "Number", "Club", "Level", "Round", "Age", "Group"];
  const rows = [
    ["Jane Smith", "1", "Club Alpha", "Development 1", "Round 1", "9 years", "Group A"],
    ["Emily Jones", "2", "Club Beta", "Development 2", "Round 1", "10 years", "Group B"],
  ];
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "gymnast_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// POSTCODE LOOKUP — client-side prefix matching (no external fetch needed in sandbox)
// ============================================================
// ============================================================
// ADDRESS LOOKUP — address name, street, town or postcode
// Uses Nominatim (OSM) for address search, postcodes.io for postcode autocomplete
// Falls back gracefully when fetch is blocked (sandbox / offline)
// ============================================================

const PC_LOOKUP = {
  AB:"Aberdeen",AL:"St Albans",B:"Birmingham",BA:"Bath",BB:"Blackburn",BD:"Bradford",
  BH:"Bournemouth",BL:"Bolton",BN:"Brighton",BR:"Bromley",BS:"Bristol",BT:"Belfast",
  CA:"Carlisle",CB:"Cambridge",CF:"Cardiff",CH:"Chester",CM:"Chelmsford",CO:"Colchester",
  CR:"Croydon",CT:"Canterbury",CV:"Coventry",CW:"Crewe",DA:"Dartford",DD:"Dundee",
  DE:"Derby",DG:"Dumfries",DH:"Durham",DL:"Darlington",DN:"Doncaster",DT:"Dorchester",
  DY:"Dudley",E:"London E",EC:"London EC",EH:"Edinburgh",EN:"Enfield",EX:"Exeter",
  FK:"Falkirk",FY:"Blackpool",G:"Glasgow",GL:"Gloucester",GU:"Guildford",HA:"Harrow",
  HD:"Huddersfield",HG:"Harrogate",HP:"Hemel Hempstead",HR:"Hereford",HS:"Outer Hebrides",
  HU:"Hull",HX:"Halifax",IG:"Ilford",IP:"Ipswich",IV:"Inverness",KA:"Kilmarnock",
  KT:"Kingston upon Thames",KW:"Caithness",KY:"Kirkcaldy",L:"Liverpool",LA:"Lancaster",
  LD:"Llandrindod Wells",LE:"Leicester",LL:"Llandudno",LN:"Lincoln",LS:"Leeds",LU:"Luton",
  M:"Manchester",ME:"Medway",MK:"Milton Keynes",ML:"Motherwell",N:"London N",
  NE:"Newcastle upon Tyne",NG:"Nottingham",NN:"Northampton",NP:"Newport",NR:"Norwich",
  NW:"London NW",OL:"Oldham",OX:"Oxford",PA:"Paisley",PE:"Peterborough",PH:"Perth",
  PL:"Plymouth",PO:"Portsmouth",PR:"Preston",RG:"Reading",RH:"Redhill",RM:"Romford",
  S:"Sheffield",SA:"Swansea",SE:"London SE",SG:"Stevenage",SK:"Stockport",SL:"Slough",
  SM:"Sutton",SN:"Swindon",SO:"Southampton",SP:"Salisbury",SR:"Sunderland",SS:"Southend-on-Sea",
  ST:"Stoke-on-Trent",SW:"London SW",SY:"Shrewsbury",TA:"Taunton",TD:"Galashiels",
  TF:"Telford",TN:"Tonbridge",TQ:"Torquay",TR:"Truro",TS:"Cleveland",TW:"Twickenham",
  UB:"Southall",W:"London W",WA:"Warrington",WC:"London WC",WD:"Watford",WF:"Wakefield",
  WN:"Wigan",WR:"Worcester",WS:"Walsall",WV:"Wolverhampton",YO:"York",ZE:"Shetland"
};

const PC_AREAS_LIST = Object.keys(PC_LOOKUP);

// Quick client-side postcode district suggestions (fallback / instant feedback)
function getLocalPCSuggestions(input) {
  const q = input.trim().toUpperCase().replace(/\s+/g, "");
  if (q.length < 2) return [];
  const m = q.match(/^([A-Z]{1,2})(\d{0,2})/);
  if (!m) return [];
  const area = m[1], dist = m[2];
  const matchAreas = PC_AREAS_LIST.filter(a => a.startsWith(area));
  if (!matchAreas.length) return [];
  const results = [];
  for (const a of matchAreas) {
    const max = dist === "" ? 9 : 99;
    for (let i = 1; i <= max && results.length < 8; i++) {
      if (String(i).startsWith(dist || "")) {
        results.push({ label: `${a}${i}`, sub: PC_LOOKUP[a] || "" });
      }
    }
  }
  return results.slice(0, 6);
}

// Format a Nominatim result into a clean address string
function formatNominatimAddress(r) {
  const a = r.address || {};
  const parts = [
    a.leisure || a.amenity || a.building || a.house_name,
    a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
    a.suburb || a.neighbourhood,
    a.town || a.city || a.village || a.hamlet,
    a.county,
    a.postcode,
  ].filter(Boolean);
  return parts.join(", ");
}

function AddressLookup({ value, onChange, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | searching | error
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const abortRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestions([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (val) => {
    const q = val.trim();
    if (q.length < 3) { setSuggestions([]); setStatus("idle"); return; }

    const isPostcodeish = /^[A-Z]{1,2}\d/i.test(q.replace(/\s/g, ""));

    // Always show local postcode hints instantly if it looks like a postcode
    if (isPostcodeish) {
      const local = getLocalPCSuggestions(q);
      if (local.length) setSuggestions(local.map(l => ({ ...l, type: "pc-local" })));
    }

    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setStatus("searching");

    try {
      let results = [];

      if (isPostcodeish) {
        // postcodes.io autocomplete
        const clean = q.replace(/\s+/g, "").toUpperCase();
        const res = await fetch(
          `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}/autocomplete`,
          { signal: abortRef.current.signal }
        );
        if (res.ok) {
          const data = await res.json();
          const codes = (data.result || []).slice(0, 8);
          results = codes.map(pc => {
            const area = pc.match(/^([A-Z]{1,2})/)?.[1] || "";
            return { label: pc, sub: PC_LOOKUP[area] || "", type: "postcode" };
          });
        }
      } else {
        // Nominatim address search — UK only
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=gb&q=${encodeURIComponent(q)}`,
          {
            signal: abortRef.current.signal,
            headers: { "Accept-Language": "en-GB" }
          }
        );
        if (res.ok) {
          const data = await res.json();
          results = data.map(r => ({
            label: formatNominatimAddress(r),
            sub: r.type ? r.type.replace(/_/g, " ") : "",
            type: "address",
            lat: r.lat, lon: r.lon
          })).filter(r => r.label);
        }
      }

      if (results.length) {
        setSuggestions(results);
        setStatus("idle");
      } else {
        setSuggestions(isPostcodeish ? getLocalPCSuggestions(q).map(l => ({ ...l, type: "pc-local" })) : []);
        setStatus("idle");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        // Network blocked (sandbox) — show local postcode hints only
        const fallback = getLocalPCSuggestions(q);
        setSuggestions(fallback.map(l => ({ ...l, type: "pc-local" })));
        setStatus("idle");
      }
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 280);
  };

  const select = (s) => {
    const val = s.label;
    setQuery(val);
    onChange(val);
    setSuggestions([]);
  };

  const iconFor = (type) => type === "address" ? "📍" : "🏷";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          placeholder={placeholder || "Search by venue name, address or postcode…"}
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 3 && search(query)}
          autoComplete="off"
        />
        {status === "searching" && (
          <div style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "var(--muted)"
          }}>⏳</div>
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
// CLUB SEARCH — typeahead with location picker for multi-site clubs
// ============================================================
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

// ============================================================
// CLUB PICKER — single-value typeahead over UK_CLUBS (for organiser club field)
// ============================================================
function ClubPicker({ value, onChange, placeholder }) {
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
    onChange(val);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    const q = val.toLowerCase();
    const startsWith = UK_CLUBS.filter(c => c.name.toLowerCase().startsWith(q));
    const contains = UK_CLUBS.filter(c => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    setSuggestions([...startsWith, ...contains].slice(0, 8));
  };

  const pick = (name) => { setQuery(name); onChange(name); setSuggestions([]); };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input className="input" placeholder={placeholder || "Type to search clubs…"}
        value={query} onChange={e => handleChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") setSuggestions([]); }} />
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
// CONFIRM MODAL
// ============================================================
function ConfirmModal({ message, confirmLabel = "Yes, remove", onConfirm, onCancel, isDanger = true }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div style={{ fontSize: 28, marginBottom: 12 }}>{isDanger ? "🗑️" : "⚠️"}</div>
        <div style={{ fontSize: 15, marginBottom: 24, lineHeight: 1.7 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn ${isDanger ? "btn-danger" : "btn-warn"}`} onClick={onConfirm}>{confirmLabel}</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CSS
// ============================================================
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f5f5f5; --surface: #ffffff; --surface2: #efefef; --border: #e4e4e4;
    --accent: #000dff; --accent2: #7178f4; --text: #2e2e2e; --muted: #909090;
    --danger: #e53e3e; --success: #22c55e; --warn: #f59e0b;
    --radius: 16px; --font-display: 'Saans', sans-serif; --font-body: 'Saans', sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 100; border-radius: 16px 16px 0 0; }
  .nav-logo { font-family: var(--font-display); font-size: 28px; letter-spacing: 2px; color: var(--accent); }
  .nav-logo span { color: var(--text); }

  .main { flex: 1; display: flex; }

  /* ── App Shell (persistent sidebar layout) ── */
  .app-shell { position: fixed; inset: 0; display: flex; gap: 24px; padding: 24px; background: #f5f5f5; font-family: var(--font-display); box-sizing: border-box; }
  .app-sidebar { width: 266px; flex-shrink: 0; background: var(--background-light); border-radius: 16px; display: flex; flex-direction: column; justify-content: space-between; overflow: visible; padding: 15px 13px; transition: width 0.2s ease; position: relative; }
  .app-sidebar.collapsed { width: 60px; padding: 10px 6px; }
  .app-sidebar.collapsed .as-label,
  .app-sidebar.collapsed .as-account-label,
  .app-sidebar.collapsed .as-logo-text { opacity: 0; width: 0; overflow: hidden; white-space: nowrap; pointer-events: none; position: absolute; }
  .app-sidebar.collapsed .as-section-title { display: none; }
  .app-sidebar.collapsed .as-header { justify-content: center; }
  .app-sidebar.collapsed .as-logo { justify-content: center; flex: none; }
  .app-sidebar.collapsed .as-logo-logotype { display: none; }
  .app-sidebar.collapsed .as-logo-logomark { margin-left: 0; }
  .app-sidebar.collapsed .as-nav-item { justify-content: center; padding: 10px 0; }
  .app-sidebar.collapsed .as-count { display: none; }
  .app-sidebar.collapsed .as-divider { margin: 4px 0; }
  .app-sidebar.collapsed .as-bottom { align-items: center; }
  .app-sidebar.collapsed .as-account { justify-content: center; padding: 8px 0; }
  .app-sidebar.collapsed .as-signout { font-size: 0; padding: 10px 0; justify-content: center; }
  .app-sidebar.collapsed .as-signout svg { margin: 0; }
  .app-sidebar.collapsed .as-signout .as-label { display: none; }
  .as-top { display: flex; flex-direction: column; gap: 24px; flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; }
  .as-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; }
  .as-logo { display: flex; align-items: center; flex: 1; min-width: 0; }
  .as-logo-logotype { height: 18px; flex-shrink: 1; min-width: 0; }
  .as-logo-logomark { height: 24px; flex-shrink: 0; margin-left: auto; }
  .as-toggle { position: absolute; top: 20px; right: -20px; width: 20px; height: 16px; border: none; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); padding: 0; border-radius: 0 8px 8px 0; z-index: 2; box-shadow: 2px 0 4px rgba(0,0,0,0.04); }
  .as-toggle:hover { color: var(--text-primary); }
  .as-nav { display: flex; flex-direction: column; gap: 2px; }
  .as-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 56px; cursor: pointer; border: none; background: none; font-family: var(--font-display); font-size: 14px; font-weight: 500; color: var(--text-secondary); transition: all 0.15s; text-align: left; width: 100%; }
  .as-nav-item:hover { background: var(--background-neutral); color: var(--text-primary); }
  .as-nav-item.active { background: rgba(0,13,255,0.06); color: var(--brand-01); font-weight: 600; }
  .as-nav-item.done { color: var(--success); }
  .as-nav-item svg { flex-shrink: 0; }
  .as-label { transition: opacity 0.2s, width 0.2s; white-space: nowrap; }
  .as-divider { height: 1px; background: var(--border); margin: 8px 4px; }
  .as-section-title { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-tertiary); padding: 8px 12px 2px; transition: opacity 0.2s; }
  .as-count { min-width: 18px; height: 18px; border-radius: 36px; background: var(--background-neutral); color: var(--text-tertiary); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0; margin-left: auto; }
  .as-bottom { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
  .as-account { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 56px; border: none; background: none; cursor: pointer; font-family: var(--font-display); width: 100%; text-align: left; }
  .as-account:hover { background: var(--background-neutral); }
  .as-account-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--brand-01); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .as-account-label { font-size: 13px; font-weight: 600; color: var(--text-primary); transition: opacity 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .as-signout { width: 100%; height: 40px; border: 1px solid var(--border); border-radius: 56px; display: flex; align-items: center; justify-content: center; gap: 6px; background: none; cursor: pointer; font-family: var(--font-display); font-size: 13px; font-weight: 600; color: var(--text-secondary); transition: all 0.15s; }
  .as-signout:hover { background: var(--background-neutral); border-color: var(--text-tertiary); }
  .app-main { flex: 1; overflow-y: auto; min-width: 0; border-radius: 16px; }

  /* ── Mobile Logo Header ── */
  .mobile-logo-header { display: none; }

  /* ── Mobile Tab Bar ── */
  .mobile-tab-bar { display: none; }

  @media (max-width: 768px) {
    .app-shell { padding: 0; gap: 0; }
    .app-sidebar { display: none; }
    .app-main { border-radius: 0; padding-bottom: 80px; padding-top: 78px; }

    /* ── Mobile logo header (pill, hides on scroll) ── */
    .mobile-logo-header {
      display: flex; align-items: center; justify-content: space-between;
      position: fixed; top: 16px; left: 16px; right: 16px; z-index: 210;
      background: white; border-radius: 64px; padding: 12px 20px; height: 54px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .mobile-logo-header.hidden { transform: translateY(-100px); opacity: 0; pointer-events: none; }
    .mobile-logo-header .mlh-logotype { height: 18px; }
    .mobile-logo-header .mlh-logomark { height: 26px; }

    /* ── Mobile tab bar (pill) ── */
    .mobile-tab-bar {
      display: flex; position: fixed; bottom: 16px; left: 16px; right: 16px; z-index: 200;
      height: 56px; background: white; border-radius: 64px; align-items: stretch;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08); padding: 0 8px;
    }
    .mtb-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: none; background: none; cursor: pointer; font-family: var(--font-display); font-size: 10px; font-weight: 600; color: var(--text-tertiary); padding: 4px 2px; transition: color 0.15s; position: relative; }
    .mtb-tab.active { color: var(--brand-01); }
    .mtb-tab svg { flex-shrink: 0; }
    .mtb-divider { width: 1px; align-self: center; height: 28px; background: var(--border); flex-shrink: 0; }
  }

  .content { flex: 1; padding: 40px; max-width: 1200px; }
  .page-header { margin-bottom: 32px; }
  .page-title { font-family: var(--font-display); font-size: 32px; font-weight: 600; color: var(--text); line-height: 1.2; letter-spacing: 0; }
  .page-title span { color: var(--accent); }
  .page-sub { color: var(--muted); margin-top: 6px; font-size: 14px; line-height: 1.4; }

  /* ── Setup Topbar ── */
  .setup-topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; margin-bottom: 28px; background: var(--brand-01); border: none; border-radius: 16px; transition: transform 0.25s ease, opacity 0.25s ease; }
  .setup-topbar.topbar-hidden { transform: translateY(-120%); opacity: 0; pointer-events: none; }
  .setup-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; flex-wrap: wrap; }
  .setup-topbar-name { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--text-alternate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
  .setup-topbar-meta { font-size: 12px; color: rgba(255,255,255,0.7); white-space: nowrap; }
  .setup-topbar-meta::before { content: "·"; margin-right: 12px; color: rgba(255,255,255,0.35); }
  .setup-topbar-right { flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
  .setup-topbar-sync { font-size: 12px; font-weight: 600; font-family: var(--font-display); color: rgba(255,255,255,0.7); }
  @media (max-width: 768px) {
    .setup-topbar { margin-bottom: 16px; padding: 10px 12px; }
    .setup-topbar-name { max-width: 180px; font-size: 13px; }
  }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; margin-bottom: 20px; }
  .card-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }

  .field { margin-bottom: 18px; }
  .label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 7px; }
  .input, .select { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; color: var(--text); font-family: var(--font-body); font-size: 14px; padding: 11px 20px; transition: border-color 0.2s, box-shadow 0.2s; outline: none; }
  .input:focus, .select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,13,255,0.08); }
  .input::placeholder { color: var(--muted); }
  .input.error { border-color: var(--danger); }
  .select option { background: var(--surface); }
  .field-error { font-size: 11px; color: var(--danger); margin-top: 6px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }

  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 11px 22px; border-radius: 56px; border: none; font-family: var(--font-body); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px; white-space: nowrap; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #1a2aff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,13,255,0.2); }
  .btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  .btn-danger { background: rgba(229,62,62,0.08); color: var(--danger); border: 1px solid rgba(229,62,62,0.25); }
  .btn-danger:hover { background: rgba(229,62,62,0.15); }
  .btn-warn { background: rgba(245,158,11,0.08); color: var(--warn); border: 1px solid rgba(245,158,11,0.25); }
  .btn-ghost { background: transparent; color: var(--muted); border: none; }
  .btn-ghost:hover { color: var(--text); }
  .btn-sm { padding: 6px 14px; font-size: 12px; }
  .btn-icon { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 56px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.2s; font-size: 15px; line-height: 1; }
  .btn-icon:hover { color: var(--danger); border-color: var(--danger); background: rgba(229,62,62,0.06); }

  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; font-size: 13px; font-weight: 500; }
  .chip button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; }
  .chip button:hover { color: var(--danger); }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 24px; flex-wrap: wrap; }
  .tab-btn { padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-family: var(--font-body); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; border-radius: 0; }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

  .list-item { display: flex; align-items: center; gap: 10px; padding: 11px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; margin-bottom: 6px; }
  .list-item-content { flex: 1; font-size: 14px; }

  .table-wrap { overflow-x: auto; border-radius: 16px; border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: var(--surface2); padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 9px 14px; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(0,0,0,0.02); }

  .score-input { width: 76px; background: var(--surface); border: 1px solid var(--border); border-radius: 56px; color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 7px 10px; outline: none; text-align: center; transition: border-color 0.2s; }
  .score-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,13,255,0.08); }
  .score-input.de { width: 58px; }

  .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #e0e0e0; border-radius: 24px; transition: 0.2s; }
  .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
  .toggle-switch input:checked + .toggle-slider { background: var(--brand-01); }
  .toggle-switch input:checked + .toggle-slider:before { transform: translateX(18px); }

  .group-header { display: flex; align-items: center; gap: 10px; padding: 6px 0; margin: 16px 0 8px; }
  .group-label { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent2); white-space: nowrap; }
  .group-line { flex: 1; height: 1px; background: var(--border); }
  .sub-group-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); margin: 10px 0 6px; }

  .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 56px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
  .badge-gold { background: rgba(255,200,0,0.12); color: #b8860b; }
  .badge-silver { background: rgba(140,140,160,0.12); color: #6b6b85; }
  .badge-bronze { background: rgba(180,100,40,0.12); color: #a0522d; }
  .badge-rank { background: var(--surface2); color: var(--muted); }

  .summary-box { background: rgba(0,13,255,0.04); border: 1px solid rgba(0,13,255,0.15); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: var(--accent); }
  .warn-box { background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.2); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: var(--warn); margin-bottom: 12px; }
  .error-box { background: rgba(229,62,62,0.06); border: 1px solid rgba(229,62,62,0.2); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: var(--danger); margin-bottom: 12px; }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px; max-width: 460px; width: 90%; }

  .pc-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; margin-top: 4px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .pc-option { padding: 8px 14px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; color: var(--text); line-height: 1.3; }
  .pc-option:last-child { border-bottom: none; }
  .pc-option:hover { background: var(--surface2); color: var(--accent); }

  .step-nav { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }

  .inline-row { display: flex; gap: 8px; align-items: flex-end; }
  .inline-row .field { margin-bottom: 0; }

  .club-edit-input { background: var(--surface); border: 1px solid var(--accent); border-radius: 56px; color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 5px 14px; outline: none; min-width: 120px; }

  .csv-zone { border: 2px dashed var(--border); border-radius: 16px; padding: 24px; text-align: center; color: var(--muted); font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .csv-zone:hover { border-color: var(--accent); color: var(--accent); }

  .empty { text-align: center; padding: 32px; color: var(--muted); font-size: 13px; }

  .apparatus-section { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; margin-bottom: 12px; overflow: hidden; }
  .apparatus-section-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--surface2); border-bottom: 1px solid var(--border); }
  .apparatus-section-body { padding: 12px 16px; }

  .results-level-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
  .results-level-header { font-family: var(--font-display); font-size: 22px; letter-spacing: 1px; color: var(--text); margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .results-level-header span { color: var(--accent); }

  /* ============================================================
     RESPONSIVE
     ============================================================ */

  @media (max-width: 768px) {
    /* Prevent iOS Safari auto-zoom on focus — all interactive elements must be ≥16px */
    .input, .select, textarea, input, select, .btn, .club-edit-input, .score-input { font-size: 16px !important; }
    .input, .select, input, select, textarea { padding: 10px 14px; box-sizing: border-box; max-width: 100%; }

    .nav { padding: 12px 16px; gap: 10px; }
    .nav-logo { font-size: 22px; }

    .main { flex-direction: column; }

    .content { padding: 16px; }
    .round-time-row { flex-direction: column; align-items: stretch !important; gap: 8px; }
    .round-time-row > div:first-child { width: auto !important; text-align: center; }
    .round-time-row .field { flex: 1 1 auto !important; width: 100%; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .card { padding: 14px 12px; overflow: hidden; }

    .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .dash-hero-title { font-size: 40px !important; }
    .page-title { font-size: 36px; }

    .apparatus-section-body { overflow-x: auto; padding: 8px; }
    .apparatus-section-body table { min-width: 480px; }
    .score-input { width: 68px; padding: 8px 6px; font-size: 14px; }

    .results-level-card { padding: 14px; }
    .table-wrap { overflow-x: auto; }

    .inline-row { flex-wrap: wrap; }

    .step-nav { flex-direction: column; gap: 10px; }
    .step-nav .btn { width: 100%; justify-content: center; }

    .modal-box { padding: 24px 18px; }
    .home-logo { font-size: 52px !important; }
  }

  @media (max-width: 480px) {
    .nav-centre { display: none; }
    .nav .btn-sm { padding: 5px 8px; font-size: 11px; }

    .stats-grid { gap: 10px !important; }
    .dash-hero-title { font-size: 32px !important; }

    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .content { padding: 16px; }
    .card { padding: 12px 10px; }

    .home-logo { font-size: 44px !important; letter-spacing: 2px !important; }
    .home-wrap { padding: 20px 16px !important; }
    .home-resume-row { flex-direction: column !important; }
    .home-resume-row .btn { width: 100%; justify-content: center; }

    .tabs { flex-wrap: nowrap; overflow-x: auto; }
    .tab-btn { flex-shrink: 0; padding: 10px 14px; }

    .list-item { flex-wrap: wrap; gap: 6px; }
    .chip { font-size: 12px; padding: 4px 10px; }
  }
`;

// ============================================================
// PHASE 1 STEP 1
// ============================================================
function Step1_CompDetails({ data, setData, onNext, onSaveExit, syncStatus, onSave }) {
  const [pendingRemove, setPendingRemove] = useState(null);
  const [editingClubId, setEditingClubId] = useState(null);
  const [editingClubVal, setEditingClubVal] = useState("");
  const [newClub, setNewClub] = useState("");
  const [roundCount, setRoundCount] = useState(data.rounds.length || 1);
  const [newLevel, setNewLevel] = useState("");
  const [showWarnings, setShowWarnings] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const el = document.querySelector(".app-main");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      if (y > lastScrollY.current && y > 60) setTopbarHidden(true);
      else if (y < lastScrollY.current) setTopbarHidden(false);
      lastScrollY.current = y;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  // Seed Round 1 on first load if rounds array is empty
  useEffect(() => {
    if (data.rounds.length === 0) {
      setData(d => ({ ...d, rounds: [{ id: generateId(), name: "Round 1", start: "", end: "" }] }));
    }
  }, []);
  const [customLevel, setCustomLevel] = useState("");
  const [newJudge, setNewJudge] = useState({ name: "", club: "", role: "E", targetApparatus: "" });
  const [dateError, setDateError] = useState("");

  const handleDate = (val) => {
    setDateError(!val ? "" : !isFutureOrToday(val) ? "Competition date must be today or a future date." : "");
    setData(d => ({ ...d, date: val }));
  };

  const addClub = () => {
    const name = newClub.trim();
    if (!name) return;
    if (data.clubs.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
    setData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name }] }));
    setNewClub("");
  };

  const saveClubEdit = (id) => {
    const val = editingClubVal.trim();
    if (!val) return;
    setData(d => ({ ...d, clubs: d.clubs.map(c => c.id === id ? { ...c, name: val } : c) }));
    setEditingClubId(null);
  };

  // Build/sync rounds when roundCount changes — preserve existing round times
  const syncRounds = (count) => {
    const n = Math.max(1, Math.min(10, parseInt(count) || 1));
    setRoundCount(n);
    setData(d => {
      const existing = d.rounds;
      const rounds = Array.from({ length: n }, (_, i) => {
        const prev = existing[i];
        return prev
          ? { ...prev, name: `Round ${i + 1}` }
          : { id: generateId(), name: `Round ${i + 1}`, start: "", end: "" };
      });
      return { ...d, rounds };
    });
  };

  const updateRoundTime = (id, field, value) => {
    setData(d => ({ ...d, rounds: d.rounds.map(r => r.id === id ? { ...r, [field]: value } : r) }));
  };

  const toggleApparatus = (a, currentlyOn) => {
    if (currentlyOn) {
      setPendingRemove({ type: "apparatus", id: a, msg: `Remove apparatus "${a}"? All judges assigned to it will also be removed.` });
    } else {
      setData(d => ({ ...d, apparatus: [...d.apparatus, a] }));
    }
  };

  const addLevel = (nameOverride) => {
    const name = (nameOverride || customLevel).trim();
    if (!name) return;
    if (data.levels.find(l => l.name.toLowerCase() === name.toLowerCase())) return;
    setData(d => ({ ...d, levels: [...d.levels, { id: generateId(), name, rankBy: "level" }] }));
    setNewLevel("");
    setCustomLevel("");
  };

  const addLevelFromDropdown = (val) => {
    if (!val || val === "__custom__") return;
    addLevel(val);
    setNewLevel("");
  };

  const updateLevelRank = (id, rankBy) =>
    setData(d => ({ ...d, levels: d.levels.map(l => l.id === id ? { ...l, rankBy } : l) }));

  const addJudge = (apparatus) => {
    if (!newJudge.name.trim()) return;
    setData(d => ({
      ...d,
      judges: [...d.judges, { id: generateId(), name: newJudge.name.trim(), club: newJudge.club.trim(), apparatus, role: newJudge.role || "E" }]
    }));
    setNewJudge({ name: "", club: "", targetApparatus: "" });
  };

  const doRemove = () => {
    const { type, id } = pendingRemove;
    if (type === "club") setData(d => ({ ...d, clubs: d.clubs.filter(c => c.id !== id) }));
    if (type === "round") setData(d => ({ ...d, rounds: d.rounds.filter(r => r.id !== id) }));
    if (type === "apparatus") setData(d => ({ ...d, apparatus: d.apparatus.filter(a => a !== id), judges: d.judges.filter(j => j.apparatus !== id) }));
    if (type === "level") setData(d => ({ ...d, levels: d.levels.filter(l => l.id !== id) }));
    if (type === "judge") setData(d => ({ ...d, judges: d.judges.filter(j => j.id !== id) }));
    setPendingRemove(null);
  };

  const overallTime = () => {
    if (!data.rounds.length) return null;
    const starts = data.rounds.map(r => r.start).sort();
    const ends = data.rounds.map(r => r.end).sort();
    return `${starts[0]} – ${ends[ends.length - 1]}`;
  };

  const canProceed = data.name && data.date && !dateError &&
    data.clubs.length > 0 && data.rounds.length > 0 &&
    data.apparatus.length > 0 && data.levels.length > 0;

  const missingFields = [
    ...(!data.name ? ["Competition name"] : []),
    ...(!data.date ? ["Date"] : []),
    ...(dateError ? ["Valid date (must be today or future)"] : []),
    ...(data.clubs.length === 0 ? ["At least one club"] : []),
    ...(data.rounds.length === 0 ? ["At least one round"] : []),
    ...(data.apparatus.length === 0 ? ["At least one apparatus"] : []),
    ...(data.levels.length === 0 ? ["At least one level"] : []),
  ];

  const canSave = !!data.name;

  const handleSaveAndExit = () => {
    if (canProceed) {
      // All fields complete — full save & continue (PIN flow + dashboard)
      setShowWarnings(false);
      onNext();
    } else if (canSave) {
      // Partial save — persist what we have and go back to dashboard
      setShowWarnings(false);
      if (onSaveExit) onSaveExit();
    } else {
      // No name — show what's missing
      setShowWarnings(true);
    }
  };

  return (
    <div>
      <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`}>
        <div className="setup-topbar-left">
          {data.name && <span className="setup-topbar-name">{data.name}</span>}
          {data.date && <span className="setup-topbar-meta">{new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          {data.venue && <span className="setup-topbar-meta">{data.venue}</span>}
          {!data.name && !data.date && !data.venue && <span className="setup-topbar-name" style={{ opacity: 0.6 }}>New Competition</span>}
        </div>
        <div className="setup-topbar-right">
          <span className="setup-topbar-sync">Draft</span>
          <button className="btn btn-sm" onClick={handleSaveAndExit} disabled={!canSave}
            style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.3)" }}>
            {canProceed ? "Save & Continue →" : "Save & Exit →"}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <div className="card" id="setup-basic">
        <div className="card-title">Basic Information</div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Competition Name</label>
            <input className="input" placeholder="e.g. Spring Invitational 2025"
              value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Competition Holder's Name</label>
            <input className="input" placeholder="e.g. Sarah Mitchell"
              value={data.holder || ""} onChange={e => setData(d => ({ ...d, holder: e.target.value }))} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Date</label>
            <input className={`input ${dateError ? "error" : ""}`} type="date" min={todayStr()}
              value={data.date} onChange={e => handleDate(e.target.value)} />
            {dateError && <div className="field-error">{dateError}</div>}
          </div>
          <div className="field">
            <label className="label">Venue</label>
            <AddressLookup
              value={data.venue || ""}
              onChange={v => setData(d => ({ ...d, venue: v, location: v }))}
              placeholder="Search by venue name, address or postcode…"
            />
          </div>
        </div>
      </div>

      {/* Branding */}
      <div className="card" id="setup-branding">
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Organiser Branding
          <a href="/example-judge-slip" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", textTransform: "none", letterSpacing: 0 }}>
            View example doc →
          </a>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Organising Club / Organisation Name</label>
            <ClubPicker
              value={data.organiserName || ""}
              onChange={v => setData(d => ({ ...d, organiserName: v }))}
              placeholder="e.g. Midlands Gymnastics Club"
            />
          </div>
          <div className="field">
            <label className="label">Brand Colour</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={data.brandColour || "#000dff"}
                onChange={e => setData(d => ({ ...d, brandColour: e.target.value }))}
                style={{ width: 44, height: 44, border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", padding: 2, background: "var(--bg)" }} />
              <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "monospace" }}>{data.brandColour || "#000dff"}</span>
            </div>
          </div>
        </div>
        <div className="field">
          <label className="label">Club Logo</label>
          {data.logo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src={data.logo} alt="Logo" style={{ height: 52, maxWidth: 160, objectFit: "contain", borderRadius: 12, border: "1px solid var(--border)", padding: 4, background: "#fff" }} />
              <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }}
                onClick={() => setData(d => ({ ...d, logo: "" }))}>Remove</button>
            </div>
          ) : (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "9px 16px", border: "1px dashed var(--border)", borderRadius: "var(--radius)",
              fontSize: 13, color: "var(--muted)", background: "var(--bg)", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
              <span style={{ fontSize: 18 }}>📁</span> Upload logo (PNG/JPG)
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => setData(d => ({ ...d, logo: ev.target.result }));
                reader.readAsDataURL(file);
              }} />
            </label>
          )}
        </div>
      </div>


      <div className="card" id="setup-clubs">
        <div className="card-title">Participating Clubs</div>
        <div className="inline-row" style={{ marginBottom: 14 }}>
          <ClubSearch
            value={newClub}
            onChange={setNewClub}
            onAdd={addClub}
          />
          <button className="btn btn-secondary" onClick={addClub}>Add Club</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.clubs.map(c => (
            <div key={c.id} className="chip">
              {editingClubId === c.id ? (
                <>
                  <input className="club-edit-input" value={editingClubVal}
                    onChange={e => setEditingClubVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveClubEdit(c.id); if (e.key === "Escape") setEditingClubId(null); }}
                    autoFocus />
                  <button onClick={() => saveClubEdit(c.id)} style={{ color: "var(--success)" }}>✓</button>
                  <button onClick={() => setEditingClubId(null)}>×</button>
                </>
              ) : (
                <>
                  <span>{c.name}</span>
                  <button onClick={() => { setEditingClubId(c.id); setEditingClubVal(c.name); }}
                    style={{ fontSize: 12, color: "var(--muted)" }}>✏️</button>
                  <button onClick={() => setPendingRemove({ type: "club", id: c.id, msg: `Remove club "${c.name}"?` })}>×</button>
                </>
              )}
            </div>
          ))}
          {!data.clubs.length && <span style={{ color: "var(--muted)", fontSize: 13 }}>No clubs added yet</span>}
        </div>
      </div>

      {/* Rounds */}
      <div className="card" id="setup-rounds">
        <div className="card-title">Rounds &amp; Times</div>
        <div className="field" style={{ maxWidth: 200 }}>
          <label className="label">Number of Rounds</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn-icon" style={{ fontSize: 18 }}
              onClick={() => syncRounds(roundCount - 1)} disabled={roundCount <= 1}>−</button>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 32, minWidth: 32, textAlign: "center", color: "var(--accent)" }}>{roundCount}</span>
            <button className="btn-icon" style={{ fontSize: 18 }}
              onClick={() => syncRounds(roundCount + 1)} disabled={roundCount >= 10}>+</button>
          </div>
        </div>
        {data.rounds.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Set times for each round</div>
            {data.rounds.map((r, i) => (
              <div key={r.id} className="round-time-row" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ width: 80, fontWeight: 600, fontSize: 14 }}>Round {i + 1}</div>
                <div className="field" style={{ margin: 0, flex: "1 1 100px" }}>
                  <label className="label">Start</label>
                  <input className="input" type="time" value={r.start}
                    onChange={e => updateRoundTime(r.id, "start", e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0, flex: "1 1 100px" }}>
                  <label className="label">End</label>
                  <input className="input" type="time" value={r.end}
                    onChange={e => updateRoundTime(r.id, "end", e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        )}
        {overallTime() && <div className="summary-box" style={{ marginTop: 10 }}>Overall: {overallTime()}</div>}
      </div>

      {/* Apparatus */}
      <div className="card" id="setup-apparatus">
        <div className="card-title">Apparatus</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {APPARATUS_OPTIONS.map(a => {
            const checked = data.apparatus.includes(a);
            return (
              <label key={a} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                background: checked ? "rgba(0,13,255,0.04)" : "var(--bg)",
                border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius)", cursor: "pointer", fontSize: 13,
                color: checked ? "var(--accent)" : "var(--text)", transition: "all 0.2s", userSelect: "none"
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggleApparatus(a, checked)} style={{ display: "none" }} />
                <span style={{ fontSize: 16 }}>{APPARATUS_ICONS[a] || "🏅"}</span> {a}
              </label>
            );
          })}
        </div>
      </div>

      {/* Skill Levels */}
      <div className="card" id="setup-levels">
        <div className="card-title">Skill Levels</div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Add from UK Gymnastics list</label>
          <select className="select" value={newLevel}
            onChange={e => { setNewLevel(e.target.value); if (e.target.value && e.target.value !== "__custom__") addLevelFromDropdown(e.target.value); }}>
            <option value="">— Select a level —</option>
            {UK_LEVELS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.options.filter(o => !data.levels.find(l => l.name === o)).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {newLevel !== "__custom__"
          ? <button className="btn btn-ghost" style={{ alignSelf: "flex-start", marginBottom: 12 }} onClick={() => setNewLevel("__custom__")}>＋ Add custom level</button>
          : <div className="inline-row" style={{ marginBottom: 12 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <input className="input" placeholder="Custom level name" value={customLevel}
                  onChange={e => setCustomLevel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addLevel()}
                  autoFocus />
              </div>
              <button className="btn btn-secondary" onClick={() => addLevel()}>Add</button>
              <button className="btn btn-ghost" onClick={() => { setNewLevel(""); setCustomLevel(""); }}>Cancel</button>
            </div>
        }
        {data.levels.map(l => (
          <div className="list-item" key={l.id}>
            <div className="list-item-content"><strong>{l.name}</strong></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Rank by:</span>
              <select className="select" style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                value={l.rankBy} onChange={e => updateLevelRank(l.id, e.target.value)}>
                <option value="level">Level only</option>
                <option value="level+age">Level + Age</option>
              </select>
            </div>
            <button className="btn-icon" onClick={() => setPendingRemove({ type: "level", id: l.id, msg: `Remove level "${l.name}"? Gymnasts assigned will lose their level.` })}>×</button>
          </div>
        ))}
        {!data.levels.length && <div className="empty">No levels added yet</div>}
      </div>

      {/* Scoring Settings */}
      <div className="card" id="setup-scoring">
        <div className="card-title">Scoring Format</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

          {/* Simple option */}
          <div onClick={() => setData(d => ({ ...d, useDEScoring: false }))}
            style={{ flex: 1, minWidth: 200, cursor: "pointer", borderRadius: 16, padding: "14px 16px",
              border: `2px solid ${!data.useDEScoring ? "var(--accent)" : "var(--border)"}`,
              background: !data.useDEScoring ? "rgba(0,13,255,0.04)" : "var(--surface2)",
              transition: "all 0.15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${!data.useDEScoring ? "var(--accent)" : "var(--border)"}`,
                background: !data.useDEScoring ? "var(--accent)" : "transparent", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Simple Scoring</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, paddingLeft: 26 }}>
              Enter one total score per apparatus per gymnast.
              Scores are summed across apparatus automatically.
              Best for club competitions or non-FIG events.
            </div>
          </div>

          {/* FIG option */}
          <div onClick={() => setData(d => ({ ...d, useDEScoring: true }))}
            style={{ flex: 1, minWidth: 200, cursor: "pointer", borderRadius: 16, padding: "14px 16px",
              border: `2px solid ${data.useDEScoring ? "var(--accent)" : "var(--border)"}`,
              background: data.useDEScoring ? "rgba(0,13,255,0.04)" : "var(--surface2)",
              transition: "all 0.15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${data.useDEScoring ? "var(--accent)" : "var(--border)"}`,
                background: data.useDEScoring ? "var(--accent)" : "transparent", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>FIG Artistic Scoring</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, paddingLeft: 26 }}>
              Full component breakdown per apparatus:
              <strong style={{ color: "var(--text)", display: "block", marginTop: 3 }}>DV + Bonus + avg(E1…En) − Penalties</strong>
              Requires E judges to be assigned per apparatus. Unlocks per-gymnast
              diagnostic reports with quadrant analysis and component breakdown.
            </div>
            {data.useDEScoring && (
              <div style={{ marginTop: 10, marginLeft: 26, padding: "7px 10px", borderRadius: 12,
                background: "rgba(0,13,255,0.05)", border: "1px solid rgba(0,13,255,0.12)",
                fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
                DV (0–10) · Bonus · E scores per judge (raw, 0–10) · Time fault · OOB · Fall · Neutral deduction
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Club Submissions */}
      <div className="card" id="setup-submissions">
        <div className="card-title">Club Submissions <span style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)", marginLeft: 8 }}>Optional</span></div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
          Allow clubs to submit their gymnast lists online before the competition. You review and approve each submission — nothing is added automatically.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px",
          background: "var(--background-neutral)", borderRadius: 12, border: `1px solid ${data.allowSubmissions ? "rgba(0,13,255,0.2)" : "var(--border)"}` }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
              {data.allowSubmissions ? "Submissions open" : "Submissions closed"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3, fontFamily: "var(--font-display)", lineHeight: 1.5 }}>
              {data.allowSubmissions
                ? "Clubs can submit gymnasts via your submission link. Share the link from your Competition Dashboard."
                : "Enable this to generate a submission link you can share with clubs."}
            </div>
          </div>
          <button
            onClick={() => setData(d => ({ ...d, allowSubmissions: !d.allowSubmissions }))}
            style={{
              width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
              background: data.allowSubmissions ? "var(--brand-01)" : "var(--background-neutral)",
              position: "relative", transition: "background 0.2s",
              boxShadow: "inset 0 0 0 1.5px var(--border)"
            }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              position: "absolute", top: 3, transition: "left 0.2s",
              left: data.allowSubmissions ? 25 : 3
            }} />
          </button>
        </div>
        {data.allowSubmissions && (
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12,
            background: "rgba(0,13,255,0.04)", border: "1px solid rgba(0,13,255,0.12)",
            fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6, fontFamily: "var(--font-display)" }}>
            Clubs will see your competition name, date and venue on their submission form. They select from your configured levels and age categories. You assign round and gymnast numbers during review.
          </div>
        )}
      </div>

      {/* Judges — per apparatus */}
      {data.apparatus.length > 0 && (
        <div className="card" id="setup-judges">
          <div className="card-title">
            Judges
            {data.useDEScoring && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)", marginLeft: 10 }}>
                FIG mode — assign D and E judges per apparatus. E judge count drives score input columns.
              </span>
            )}
          </div>
          {data.apparatus.map(apparatus => {
            const allJudges = data.judges.filter(j => j.apparatus === apparatus);
            const dJudges = allJudges.filter(j => j.role === "D");
            const eJudges = allJudges.filter(j => j.role === "E" || !j.role);
            const isAdding = newJudge.targetApparatus === apparatus;
            const missingE = data.useDEScoring && eJudges.length === 0;
            return (
              <div className="apparatus-section" key={apparatus}>
                <div className="apparatus-section-header">
                  <strong style={{ fontSize: 14 }}>{APPARATUS_ICONS[apparatus] || "🏅"} {apparatus}</strong>
                  <span style={{ fontSize: 12, color: missingE ? "#f0ad4e" : "var(--muted)" }}>
                    {data.useDEScoring
                      ? `${dJudges.length}D · ${eJudges.length}E${missingE ? " ⚠ No E judges" : ""}`
                      : `${allJudges.length} judge${allJudges.length !== 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="apparatus-section-body">
                  {allJudges.length === 0 && !isAdding && (
                    <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>No judges assigned yet</div>
                  )}

                  {/* Judge list grouped by role in FIG mode */}
                  {data.useDEScoring ? (
                    <>
                      {dJudges.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>D Panel</div>
                          {dJudges.map(j => (
                            <div className="list-item" key={j.id} style={{ padding: "6px 12px" }}>
                              <div className="list-item-content">
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#5bc0de", marginRight: 6 }}>D</span>
                                <span style={{ fontSize: 13 }}>{j.name}</span>
                                {j.club && <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>· {j.club}</span>}
                              </div>
                              <button className="btn-icon" onClick={() => setPendingRemove({ type: "judge", id: j.id, msg: `Remove judge "${j.name}" from ${j.apparatus}?` })}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {eJudges.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>E Panel ({eJudges.length} judge{eJudges.length !== 1 ? "s" : ""} → avg)</div>
                          {eJudges.map((j, i) => (
                            <div className="list-item" key={j.id} style={{ padding: "6px 12px" }}>
                              <div className="list-item-content">
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginRight: 6 }}>E{i + 1}</span>
                                <span style={{ fontSize: 13 }}>{j.name}</span>
                                {j.club && <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>· {j.club}</span>}
                              </div>
                              <button className="btn-icon" onClick={() => setPendingRemove({ type: "judge", id: j.id, msg: `Remove judge "${j.name}" from ${j.apparatus}?` })}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    allJudges.map(j => (
                      <div className="list-item" key={j.id} style={{ padding: "8px 12px" }}>
                        <div className="list-item-content">
                          <span style={{ fontSize: 13 }}>{j.name}</span>
                          {j.club && <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>· {j.club}</span>}
                        </div>
                        <button className="btn-icon" onClick={() => setPendingRemove({ type: "judge", id: j.id, msg: `Remove judge "${j.name}" from ${j.apparatus}?` })}>×</button>
                      </div>
                    ))
                  )}

                  {/* Add judge form */}
                  {isAdding ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {data.useDEScoring && (
                        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 56, overflow: "hidden", flexShrink: 0 }}>
                          {["D", "E"].map(role => (
                            <button key={role} onClick={() => setNewJudge(j => ({ ...j, role }))}
                              style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                                background: newJudge.role === role ? (role === "E" ? "var(--accent)" : "#5bc0de") : "var(--surface2)",
                                color: newJudge.role === role ? "#000" : "var(--muted)" }}>
                              {role}
                            </button>
                          ))}
                        </div>
                      )}
                      <input className="input" placeholder="Judge name" style={{ flex: 1, minWidth: 120 }}
                        value={newJudge.name}
                        onChange={e => setNewJudge(j => ({ ...j, name: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && addJudge(apparatus)}
                        autoFocus />
                      <input className="input" placeholder="Club (optional)" style={{ flex: 1, minWidth: 100 }}
                        value={newJudge.club}
                        onChange={e => setNewJudge(j => ({ ...j, club: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && addJudge(apparatus)} />
                      <button className="btn btn-sm btn-primary" onClick={() => addJudge(apparatus)}>Add</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setNewJudge({ name: "", club: "", role: "E", targetApparatus: "" })}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-secondary" style={{ marginTop: 6 }}
                      onClick={() => setNewJudge({ name: "", club: "", role: "E", targetApparatus: apparatus })}>
                      + Add Judge
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* FIG validation warning */}
          {data.useDEScoring && data.apparatus.some(app => data.judges.filter(j => j.apparatus === app && (j.role === "E" || !j.role)).length === 0) && (
            <div style={{ margin: "10px 0 0", padding: "10px 14px", borderRadius: 12,
              background: "rgba(240,173,78,0.1)", border: "1px solid rgba(240,173,78,0.4)",
              fontSize: 12, color: "#c8862a" }}>
              ⚠ FIG scoring is enabled — each apparatus needs at least one E judge before scores can be entered.
              The number of E judges determines how many execution score columns appear in Score Input.
            </div>
          )}
        </div>
      )}

      {showWarnings && missingFields.length > 0 && (
        <div style={{ margin: "0 0 16px", padding: "14px 18px", borderRadius: 12,
          background: "rgba(229,62,62,0.06)", border: "1px solid rgba(229,62,62,0.25)",
          fontSize: 13, color: "#c53030" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Enter a competition name to save your progress</div>
        </div>
      )}

      <div className="step-nav">
        <div />
        <button className="btn btn-primary" onClick={handleSaveAndExit} disabled={!canSave}>
          {canProceed ? "Save & Continue →" : "Save & Exit →"}
        </button>
      </div>

      {pendingRemove && (
        <ConfirmModal message={pendingRemove.msg} onConfirm={doRemove} onCancel={() => setPendingRemove(null)} />
      )}
    </div>
  );
}

// ============================================================
// PDF / PRINT UTILITIES
// ============================================================

const APPARATUS_ICONS = {
  Beam: "🤸",
  Bar: "🏋️",
  Vault: "⚡",
  Floor: "🌟",
  Range: "🎯",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 || 12;
  return `${h12}:${m}${ampm}`;
}

function getPrintHeader(compData, subtitle) {
  const colour = compData.brandColour || "#000dff";
  return `
    <div class="print-header">
      <div class="print-header-top" style="border-bottom: 3px solid ${colour};">
        ${compData.logo ? `<img src="${compData.logo}" class="print-logo" alt="Logo" />` : ""}
        <div class="print-header-text">
          <div class="print-comp-name" style="color:${colour};">${compData.name || "Competition"}</div>
          ${compData.organiserName ? `<div class="print-organiser">${compData.organiserName}</div>` : ""}
          <div class="print-meta">
            ${compData.date ? formatDate(compData.date) : ""}
            ${compData.venue ? ` &nbsp;·&nbsp; ${compData.venue}` : ""}
          </div>
        </div>
        <div class="print-subtitle-badge" style="background:${colour}; color:#000;">${subtitle}</div>
      </div>
    </div>
  `;
}

const PRINT_BASE_CSS = `
  @media print { @page { margin: 15mm 12mm; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
  .print-header { margin-bottom: 18px; }
  .print-header-top { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; margin-bottom: 12px; }
  .print-logo { height: 56px; max-width: 140px; object-fit: contain; }
  .print-header-text { flex: 1; }
  .print-comp-name { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; line-height: 1.1; }
  .print-organiser { font-size: 13px; font-weight: 600; color: #444; margin-top: 2px; }
  .print-meta { font-size: 11px; color: #666; margin-top: 4px; }
  .print-subtitle-badge { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 5px 12px; border-radius: 4px; white-space: nowrap; align-self: flex-start; }
  .print-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; display: flex; justify-content: space-between; }
  h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; color: #222; }
  h3 { font-size: 11px; font-weight: 700; margin: 12px 0 6px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f0f0f0; padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #444; border: 1px solid #ddd; }
  td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; font-size: 10.5px; }
  tr:nth-child(even) td { background: #fafafa; }
  .score-box { border: 1.5px solid #999; border-radius: 3px; display: inline-block; width: 48px; height: 22px; }
  .page-break { page-break-before: always; margin-top: 20px; }
  .round-header { background: #eee; padding: 7px 12px; font-weight: 700; font-size: 12px; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .round-time { font-size: 10px; color: #666; font-weight: 400; }
  .group-block { margin-bottom: 16px; }
  .group-name { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #555; margin-bottom: 4px; }
  .apparatus-tag { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 3px; background: #e8e8e8; color: #333; margin-right: 4px; }
`;

async function generatePDF(fullHTML, filename = "gymcomp-document.pdf") {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:-20000px;left:0;width:794px;background:#fff;z-index:-1;";
  document.body.appendChild(container);
  container.innerHTML = fullHTML;
  // Wait for images (logos) to load
  const imgs = container.querySelectorAll("img");
  if (imgs.length) await Promise.all([...imgs].map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
  // Small delay for layout
  await new Promise(r => setTimeout(r, 200));
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: 794 });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const imgH = (canvas.height / canvas.width) * contentW;
    let yOffset = 0;
    const sliceH = pageH - margin * 2;
    while (yOffset < imgH) {
      if (yOffset > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, margin - yOffset, contentW, imgH);
      yOffset += sliceH;
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

function printDocument(htmlContent, filename = "gymcomp-document.pdf") {
  const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title><style>${PRINT_BASE_CSS}</style></head><body>${htmlContent}</body></html>`;
  generatePDF(fullHTML, filename);
}

// Build agenda content
function buildAgendaHTML(compData, gymnasts, compId) {
  const colour = compData.brandColour || "#000dff";
  const rounds = compData.rounds || [];
  const apparatus = compData.apparatus || [];

  // Group gymnasts by round then group
  const byRound = {};
  rounds.forEach(r => { byRound[r.id] = {}; });
  gymnasts.forEach(g => {
    if (!g.round || !byRound[g.round]) return;
    if (!byRound[g.round][g.group]) byRound[g.round][g.group] = [];
    byRound[g.round][g.group].push(g);
  });

  // Build rotations map from groups × apparatus
  const allGroups = [...new Set(gymnasts.map(g => g.group).filter(Boolean))];
  const rotMap = {};
  allGroups.forEach((grp, gi) => {
    rotMap[grp] = apparatus.map((_, ai) => apparatus[(ai + gi) % apparatus.length]);
  });

  let html = getPrintHeader(compData, "Competition Agenda");

  // Summary table
  html += `<table style="margin-bottom:20px;">
    <tr><th>Competition</th><th>Date</th><th>Venue</th><th>Levels</th><th>Total Gymnasts</th></tr>
    <tr>
      <td><strong>${compData.name || "—"}</strong></td>
      <td>${compData.date ? formatDate(compData.date) : "—"}</td>
      <td>${compData.venue || compData.location || "—"}</td>
      <td>${(compData.levels || []).map(l => l.name).join(", ") || "—"}</td>
      <td>${gymnasts.length}</td>
    </tr>
  </table>`;

  // Apparatus key
  if (apparatus.length) {
    html += `<div style="margin-bottom:16px;"><strong style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Apparatus: </strong>`;
    apparatus.forEach((a, i) => {
      html += `<span class="apparatus-tag">${i + 1}. ${a}</span>`;
    });
    html += `</div>`;
  }

  // Rounds
  rounds.forEach((round, ri) => {
    if (ri > 0) html += `<div class="page-break"></div>`;
    html += `<div class="round-header" style="border-left: 4px solid ${colour};">
      <span>${round.name}</span>
      <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
    </div>`;

    const groups = byRound[round.id] || {};
    const groupNames = Object.keys(groups);

    if (!groupNames.length) {
      html += `<p style="color:#999;font-size:10px;padding:8px 0;">No gymnasts assigned to this round.</p>`;
    } else {
      // Rotation overview for this round
      html += `<table style="margin-bottom:14px;">
        <thead><tr><th>Group</th>${apparatus.map((_, i) => `<th>Position ${i + 1}</th>`).join("")}</tr></thead>
        <tbody>`;
      groupNames.forEach(grp => {
        html += `<tr><td><strong>${grp}</strong></td>`;
        apparatus.forEach((_, i) => {
          const app = rotMap[grp]?.[i] || "—";
          html += `<td>${app}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table>`;

      // Gymnast lists per group
      groupNames.forEach(grp => {
        const gList = (groups[grp] || []).sort((a, b) => (a.number || 0) - (b.number || 0));
        html += `<div class="group-block">
          <div class="group-name">${grp} — ${gList.length} gymnast${gList.length !== 1 ? "s" : ""}</div>
          <table>
            <thead><tr><th>#</th><th>Name</th><th>Club</th><th>Level</th><th>Start App.</th></tr></thead>
            <tbody>`;
        gList.forEach((g, idx) => {
          const startApp = rotMap[grp]?.[0] || "—";
          html += `<tr>
            <td>${g.number || idx + 1}</td>
            <td>${g.name || "—"}</td>
            <td>${g.club || "—"}</td>
            <td>${g.level || "—"}</td>
            <td>${startApp}</td>
          </tr>`;
        });
        html += `</tbody></table></div>`;
      });
    }
  });


  // Live view QR codes (only if compId exists)
  if (compId) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
    const coachUrl = `${origin}/coach.html?comp=${compId}`;
    const parentUrl = `${origin}/results.html?comp=${compId}`;
    const qrSize = 100;
    const coachQR = "https://quickchart.io/chart?cht=qr&chs=" + qrSize + "x" + qrSize + "&chl=" + encodeURIComponent(coachUrl) + "&choe=UTF-8";
    const parentQR = "https://quickchart.io/chart?cht=qr&chs=" + qrSize + "x" + qrSize + "&chl=" + encodeURIComponent(parentUrl) + "&choe=UTF-8";

    html += "<div class=\"page-break\"></div>" +
    "<h2 style=\"text-align:center;margin-bottom:16px;\">Live Results — Share With Coaches &amp; Parents</h2>" +
    "<p style=\"text-align:center;font-size:10px;color:#666;margin-bottom:20px;\">Scan the QR code or visit the link to follow live scores and rankings during the competition</p>" +
    "<div style=\"display:flex;gap:40px;justify-content:center;flex-wrap:wrap;margin-bottom:24px;\">" +
      "<div style=\"text-align:center;border:1px solid #ddd;border-radius:8px;padding:20px 28px;\">" +
        "<img src=\"" + coachQR + "\" width=\"" + qrSize + "\" height=\"" + qrSize + "\" style=\"display:block;margin:0 auto 10px;\" />" +
        "<div style=\"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;\">Coach View</div>" +
        "<div style=\"font-size:9px;color:#666;word-break:break-all;max-width:160px;\">" + coachUrl + "</div>" +
        "<div style=\"font-size:9px;color:#888;margin-top:4px;\">Full D/E breakdown + query status</div>" +
      "</div>" +
      "<div style=\"text-align:center;border:1px solid #ddd;border-radius:8px;padding:20px 28px;\">" +
        "<img src=\"" + parentQR + "\" width=\"" + qrSize + "\" height=\"" + qrSize + "\" style=\"display:block;margin:0 auto 10px;\" />" +
        "<div style=\"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;\">Parent View</div>" +
        "<div style=\"font-size:9px;color:#666;word-break:break-all;max-width:160px;\">" + parentUrl + "</div>" +
        "<div style=\"font-size:9px;color:#888;margin-top:4px;\">Scores + rankings — no technical detail</div>" +
      "</div>" +
    "</div>";
  }

  html += `<div class="print-footer">
    <span>Generated by GymScore · ${new Date().toLocaleDateString("en-GB")}</span>
    <span>${compData.organiserName || ""}</span>
  </div>`;

  return html;
}

// Build judge sheets
function buildJudgeSheetsHTML(compData, gymnasts) {
  const colour = compData.brandColour || "#000dff";
  const apparatus = compData.apparatus || [];
  const rounds = compData.rounds || [];
  const fig = !!compData.useDEScoring;

  let html = "";

  // One sheet per apparatus per round — pre-populated with gymnast details
  apparatus.forEach((app, appIdx) => {
    rounds.forEach((round, rIdx) => {
      const roundGymnasts = gymnasts
        .filter(g => g.round === round.id)
        .sort((a, b) => parseInt(a.number || 0) - parseInt(b.number || 0));

      if (appIdx > 0 || rIdx > 0) html += `<div class="page-break"></div>`;

      html += getPrintHeader(compData, `Judge Score Sheet — ${app}`);

      html += `<div class="round-header" style="border-left:4px solid ${colour};">
        <span>${round.name} · ${APPARATUS_ICONS[app] || ""} ${app}</span>
        <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
      </div>`;

      // Judge assignment info
      const assignedJudges = (compData.judges || []).filter(j => j.apparatus === app);
      if (assignedJudges.length) {
        html += `<div style="background:${colour}18;border:1px solid ${colour}44;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;">
          <strong>Assigned judge${assignedJudges.length !== 1 ? "s" : ""}:</strong>
          ${assignedJudges.map(j => `<strong>${j.name}</strong>${j.club ? ` · ${j.club}` : ""}${j.role ? ` (${j.role})` : ""}`).join("&ensp;|&ensp;")}
        </div>`;
      }

      // Competition info strip
      html += `<div style="display:flex;gap:16px;margin-bottom:14px;font-size:9px;color:#555;flex-wrap:wrap;">
        <span><strong>Competition:</strong> ${compData.name || "—"}</span>
        <span><strong>Date:</strong> ${compData.date ? formatDate(compData.date) : "—"}</span>
        <span><strong>Venue:</strong> ${compData.venue || compData.location || "—"}</span>
        <span><strong>Apparatus:</strong> ${app}</span>
        <span><strong>Round:</strong> ${round.name}</span>
        <span><strong>Gymnasts:</strong> ${roundGymnasts.length}</span>
      </div>`;

      // Score table — pre-populated with all gymnast details
      if (fig) {
        html += `<table>
          <thead>
            <tr>
              <th style="width:32px;">#</th>
              <th style="min-width:130px;">Gymnast Name</th>
              <th style="min-width:100px;">Club</th>
              <th style="width:70px;">Level</th>
              <th style="width:48px;text-align:center;">Group</th>
              <th style="width:68px;text-align:center;">D Score</th>
              <th style="width:68px;text-align:center;">E Score</th>
              <th style="width:58px;text-align:center;">Penalty</th>
              <th style="width:72px;text-align:center;">Total</th>
            </tr>
          </thead>
          <tbody>`;

        roundGymnasts.forEach((g, i) => {
          const levelName = (compData.levels || []).find(l => l.id === g.level)?.name || g.level || "—";
          const isDns = !!g.dns;
          html += `<tr style="${isDns ? "opacity:0.4;text-decoration:line-through;" : i % 2 === 0 ? "" : "background:#fafafa;"}">
            <td style="font-weight:700;color:${colour};">${g.number || i + 1}</td>
            <td><strong>${g.name || "—"}</strong>${isDns ? ' <span style="color:#d9534f;font-size:8px;font-weight:700;">DNS</span>' : ""}</td>
            <td style="color:#555;">${g.club || "—"}</td>
            <td style="font-size:9px;color:#666;">${levelName}</td>
            <td style="text-align:center;font-size:10px;color:#666;">${g.group || "—"}</td>
            <td style="text-align:center;"><span class="score-box"></span></td>
            <td style="text-align:center;"><span class="score-box"></span></td>
            <td style="text-align:center;"><span class="score-box" style="width:44px;"></span></td>
            <td style="text-align:center;"><span class="score-box" style="width:56px;border-width:2px;"></span></td>
          </tr>`;
        });
      } else {
        html += `<table>
          <thead>
            <tr>
              <th style="width:32px;">#</th>
              <th style="min-width:130px;">Gymnast Name</th>
              <th style="min-width:100px;">Club</th>
              <th style="width:70px;">Level</th>
              <th style="width:48px;text-align:center;">Group</th>
              <th style="width:100px;text-align:center;">Score</th>
            </tr>
          </thead>
          <tbody>`;

        roundGymnasts.forEach((g, i) => {
          const levelName = (compData.levels || []).find(l => l.id === g.level)?.name || g.level || "—";
          const isDns = !!g.dns;
          html += `<tr style="${isDns ? "opacity:0.4;text-decoration:line-through;" : i % 2 === 0 ? "" : "background:#fafafa;"}">
            <td style="font-weight:700;color:${colour};">${g.number || i + 1}</td>
            <td><strong>${g.name || "—"}</strong>${isDns ? ' <span style="color:#d9534f;font-size:8px;font-weight:700;">DNS</span>' : ""}</td>
            <td style="color:#555;">${g.club || "—"}</td>
            <td style="font-size:9px;color:#666;">${levelName}</td>
            <td style="text-align:center;font-size:10px;color:#666;">${g.group || "—"}</td>
            <td style="text-align:center;"><span class="score-box" style="width:80px;"></span></td>
          </tr>`;
        });
      }

      if (!roundGymnasts.length) {
        html += `<tr><td colspan="9" style="color:#999;text-align:center;padding:16px;">No gymnasts assigned to this round</td></tr>`;
      }

      html += `</tbody></table>`;

      // Signature + handover section
      html += `<div style="margin-top:24px;border-top:1px solid #ddd;padding-top:14px;">
        <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Judge Signature</span>
            <div style="border-bottom:1.5px solid #999;width:220px;margin-top:20px;"></div>
          </div>
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Scorer Received</span>
            <div style="border-bottom:1.5px solid #999;width:140px;margin-top:20px;"></div>
          </div>
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Time Received</span>
            <div style="border-bottom:1.5px solid #999;width:100px;margin-top:20px;"></div>
          </div>
        </div>
        <div style="font-size:9px;color:#aaa;">
          ${compData.name || ""} · ${round.name} · ${app} · ${compData.date ? formatDate(compData.date) : ""}
        </div>
      </div>`;

      html += `<div class="print-footer">
        <span>GYMCOMP · ${compData.name || ""} · ${compData.date ? formatDate(compData.date) : ""}</span>
        <span>${app} / ${round.name}</span>
      </div>`;
    });
  });

  return html || `<p style="color:#999;">No apparatus configured.</p>`;
}

// Build attendance list
function buildAttendanceHTML(compData, gymnasts) {
  const colour = compData.brandColour || "#000dff";
  const sorted = [...gymnasts].sort((a, b) => (a.number || 0) - (b.number || 0));

  // Group by club
  const byClub = {};
  sorted.forEach(g => {
    const club = g.club || "Unassigned";
    if (!byClub[club]) byClub[club] = [];
    byClub[club].push(g);
  });

  let html = getPrintHeader(compData, "Attendance List");

  // Summary
  html += `<div style="display:flex;gap:24px;margin-bottom:18px;flex-wrap:wrap;">
    <div style="background:#f5f5f5;border-radius:6px;padding:10px 16px;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:${colour};">${gymnasts.length}</div>
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;">Total Gymnasts</div>
    </div>
    <div style="background:#f5f5f5;border-radius:6px;padding:10px 16px;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:${colour};">${Object.keys(byClub).length}</div>
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;">Clubs</div>
    </div>
    <div style="background:#f5f5f5;border-radius:6px;padding:10px 16px;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:${colour};">${(compData.rounds || []).length}</div>
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;">Rounds</div>
    </div>
  </div>`;

  // Full list
  html += `<h2>Full Registration — All Gymnasts</h2>
  <table>
    <thead>
      <tr>
        <th style="width:36px;">#</th>
        <th>Gymnast Name</th>
        <th>Club</th>
        <th>Level</th>
        <th>Group</th>
        <th>Round</th>
        <th style="width:60px;text-align:center;">Present ✓</th>
      </tr>
    </thead>
    <tbody>`;

  sorted.forEach((g, i) => {
    const round = (compData.rounds || []).find(r => r.id === g.round);
    html += `<tr>
      <td>${g.number || i + 1}</td>
      <td>${g.name || "—"}</td>
      <td>${g.club || "—"}</td>
      <td>${g.level || "—"}</td>
      <td>${g.group || "—"}</td>
      <td>${round ? round.name : "—"}</td>
      <td style="text-align:center;"><span class="score-box" style="width:28px;height:20px;"></span></td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // By club breakdown
  html += `<div class="page-break"></div>`;
  html += getPrintHeader(compData, "Attendance by Club");
  html += `<h2>By Club</h2>`;

  Object.entries(byClub).sort(([a],[b]) => a.localeCompare(b)).forEach(([club, members]) => {
    html += `<h3 style="border-left:3px solid ${colour};padding-left:8px;">${club} <span style="font-weight:400;color:#666;">(${members.length})</span></h3>
    <table style="margin-bottom:14px;">
      <thead><tr><th>#</th><th>Name</th><th>Level</th><th>Group</th><th>Round</th><th style="width:60px;text-align:center;">Present ✓</th></tr></thead>
      <tbody>`;
    members.forEach((g, i) => {
      const round = (compData.rounds || []).find(r => r.id === g.round);
      html += `<tr>
        <td>${g.number || i + 1}</td>
        <td>${g.name || "—"}</td>
        <td>${g.level || "—"}</td>
        <td>${g.group || "—"}</td>
        <td>${round ? round.name : "—"}</td>
        <td style="text-align:center;"><span class="score-box" style="width:28px;height:20px;"></span></td>
      </tr>`;
    });
    html += `</tbody></table>`;
  });

  html += `<div class="print-footer">
    <span>GymScore · ${compData.name || ""} · ${compData.date ? formatDate(compData.date) : ""}</span>
    <span>${gymnasts.length} gymnasts registered</span>
  </div>`;

  return html;
}

// ============================================================
// PHASE 2 STEP 3 — EXPORTS & DOCUMENTS
// ============================================================
function Phase2_Exports({ compData, gymnasts, scores }) {
  const colour = compData.brandColour || "#000dff";
  const hasGymnasts = gymnasts.length > 0;
  const hasScores = Object.keys(scores).length > 0;

  const docs = [
    {
      id: "results",
      title: "Results Sheet",
      icon: "🏆",
      desc: "Ranked results per level showing gymnast name, club, score and placing. Medal positions highlighted. Ready to share with clubs post-competition.",
      use: "Email to clubs after the event. Display at the awards ceremony.",
      available: hasScores,
      unavailableMsg: "Enter scores in Score Input to generate results.",
      action: () => printDocument(buildResultsHTML(compData, gymnasts, scores), "gymcomp-results.pdf"),
    },
    {
      id: "diagnostic",
      title: "Gymnast Diagnostic Report",
      icon: "📊",
      desc: "Per-gymnast breakdown comparing Difficulty vs Execution against level peers. Identifies strengths, flags areas for development, and highlights performance patterns across apparatus.",
      use: "Share with coaches post-competition. D/E scoring must be enabled in Setup for full analysis.",
      available: hasScores && !!compData.useDEScoring,
      unavailableMsg: compData.useDEScoring
        ? "Enter D/E scores in Score Input to generate diagnostics."
        : "Enable D/E Scoring in Step 1 → Scoring Settings to use this report.",
      action: () => printDocument(buildDiagnosticHTML(compData, gymnasts, scores), "gymcomp-diagnostic.pdf"),
    },
  ];

  const brandOk = compData.name && compData.organiserName;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Post-Competition <span>Exports</span></div>
        <div className="page-sub">Results and diagnostic reports — generated after scoring is complete</div>
      </div>

      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "var(--muted)" }}>
        ℹ Pre-competition documents (Agenda, Judge Sheets, Attendance List) are available on the <strong style={{ color: "var(--text)" }}>Competition Dashboard</strong> — accessible before you start.
      </div>

      {/* Branding preview */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Branding Preview</div>
        {!brandOk && (
          <div className="warn-box" style={{ marginBottom: 14 }}>
            Complete your organiser name in Step 1 → Competition Details to improve document branding.
          </div>
        )}
        <div style={{
          border: `2px solid ${colour}`, borderRadius: 8, padding: "16px 20px",
          display: "flex", alignItems: "center", gap: 16, background: "#fff"
        }}>
          {compData.logo
            ? <img src={compData.logo} alt="Logo" style={{ height: 52, maxWidth: 120, objectFit: "contain" }} />
            : <div style={{ width: 52, height: 52, borderRadius: 8, background: colour, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏅</div>
          }
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: colour }}>{compData.name || "Competition Name"}</div>
            {compData.organiserName && <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>{compData.organiserName}</div>}
            {(compData.date || compData.venue) && (
              <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
                {compData.date ? formatDate(compData.date) : ""}
                {compData.venue ? ` · ${compData.venue}` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
          To update branding, go to <strong>Step 1 → Organiser Branding</strong>.
        </div>
      </div>

      {/* Document cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {docs.map(doc => (
          <div key={doc.id} className="card" style={{
            opacity: doc.available || doc.coming ? 1 : 0.7,
            position: "relative", overflow: "hidden"
          }}>
            {doc.coming && (
              <div style={{
                position: "absolute", top: 12, right: 12,
                background: "var(--surface2)", color: "var(--muted)",
                fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 4
              }}>Coming soon</div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                background: doc.available && !doc.coming ? `${colour}22` : "var(--surface2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22
              }}>{doc.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{doc.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{doc.desc}</div>
              </div>
            </div>
            <div style={{
              background: "var(--surface2)", borderRadius: 6, padding: "8px 12px",
              fontSize: 11, color: "var(--muted)", lineHeight: 1.4, marginBottom: 14
            }}>
              <strong style={{ color: "var(--text)" }}>When to use:</strong> {doc.use}
            </div>
            {doc.available && !doc.coming ? (
              <button
                className="btn btn-primary"
                style={{ width: "100%", background: colour, color: "#fff" }}
                onClick={doc.action}>
                ⬇ Generate PDF
              </button>
            ) : doc.coming ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                Coming in next update
              </button>
            ) : (
              <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                ⚠ {doc.unavailableMsg}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16, background: "rgba(0,13,255,0.03)", borderColor: "rgba(0,13,255,0.12)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>How it works:</strong> Click "Generate PDF" to download a .pdf file directly to your device.
          All documents are automatically branded with your competition name, organiser details, logo and colour.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GYMNAST DIAGNOSTIC REPORT PDF
// ============================================================
function buildDiagnosticHTML(compData, gymnasts, scores) {
  const colour = compData.brandColour || "#000dff";
  const apparatus = compData.apparatus || [];
  const rounds = compData.rounds || [];

  // Score helpers — D/E from flat key suffixes
  const eJudgeCount = (app) =>
    (compData.judges || []).filter(j => j.apparatus === app && (j.role === "E" || !j.role)).length;

  const sk = (rid, gid, app, sub) => `${gymnast_key(rid, gid, app)}__${sub}`;
  const sv = (rid, gid, app, sub) => parseFloat(scores[sk(rid, gid, app, sub)]) || 0;

  const getDV   = (rid, gid, app) => sv(rid, gid, app, "dv");
  const getBonus= (rid, gid, app) => sv(rid, gid, app, "bon");
  const getEAvg = (rid, gid, app) => {
    const n = Math.max(eJudgeCount(app), 1);
    let sum = 0, count = 0;
    for (let i = 1; i <= n; i++) {
      const v = sv(rid, gid, app, `e${i}`);
      if (v > 0) { sum += v; count++; }
    }
    return count > 0 ? sum / count : 0;
  };
  const getPen  = (rid, gid, app) => sv(rid,gid,app,"tf")+sv(rid,gid,app,"oob")+sv(rid,gid,app,"fall")+sv(rid,gid,app,"nd");
  const getTotal = (roundId, gid, app) => parseFloat(scores[gymnast_key(roundId, gid, app)]) || 0;
  const getOverall = (roundId, gid) => apparatus.reduce((s, a) => s + getTotal(roundId, gid, a), 0);

  // For a gymnast, compute per-apparatus diagnostics vs level peers
  const diagnoseGymnast = (gymnast, round) => {
    const rid = round.id;
    const levelObj = compData.levels.find(l => l.id === gymnast.level);
    const levelName = levelObj?.name || "Unknown";
    const rankBy = levelObj?.rankBy || "level";
    const ageLabel = rankBy === "level+age" ? gymnast.age : null;

    // Peers = same level (and age group if applicable), same round
    const peers = gymnasts.filter(g =>
      g.id !== gymnast.id &&
      g.round === rid &&
      g.level === gymnast.level &&
      (rankBy !== "level+age" || g.age === gymnast.age) &&
      apparatus.some(a => getTotal(rid, g.id, a) > 0)
    );

    const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
    const peerCount = peers.length;

    const appData = apparatus.map(app => {
      const dv     = getDV(rid, gymnast.id, app);
      const bonus  = getBonus(rid, gymnast.id, app);
      const eAvg   = getEAvg(rid, gymnast.id, app);
      const pen    = getPen(rid, gymnast.id, app);
      const total  = getTotal(rid, gymnast.id, app);
      const scored = total > 0;

      const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

      const peerDVs    = peers.map(p => getDV(rid, p.id, app)).filter(v => v > 0);
      const peerBonus  = peers.map(p => getBonus(rid, p.id, app));  // can be 0
      const peerEAvgs  = peers.map(p => getEAvg(rid, p.id, app)).filter(v => v > 0);
      const peerPens   = peers.map(p => getPen(rid, p.id, app));    // can be 0
      const peerTotals = peers.map(p => getTotal(rid, p.id, app)).filter(v => v > 0);

      const avgDV    = avg(peerDVs);
      const avgBonus = peers.length ? avg(peerBonus) : null;
      const avgEAvg  = avg(peerEAvgs);
      const avgPen   = peers.length ? avg(peerPens) : null;
      const avgTotal = avg(peerTotals);

      // Percentile rank among peers+self
      const allTotals = [...peerTotals, total].filter(v => v > 0).sort((a, b) => b - a);
      const rankPos = allTotals.indexOf(total) + 1;
      const pctile = allTotals.length > 1
        ? Math.round(((allTotals.length - rankPos) / (allTotals.length - 1)) * 100)
        : null;

      // Quadrant: DV vs eAvg vs peers
      let quadrant = null, advice = null;
      if (scored && avgDV !== null && avgEAvg !== null) {
        const dvAbove = dv >= avgDV;
        const eAbove  = eAvg >= avgEAvg;
        if (dvAbove && eAbove) {
          quadrant = "strength";
          advice = "Strong on both difficulty value and execution. Focus on consistency and maintaining performance under competition pressure.";
        } else if (dvAbove && !eAbove) {
          quadrant = "refine";
          advice = "Difficulty is competitive but execution deductions are costing marks. Prioritise clean execution — reduce errors on existing skills before adding new ones.";
        } else if (!dvAbove && eAbove) {
          quadrant = "upgrade";
          advice = "Excellent execution — gymnast is performing skills cleanly. Ready to increase difficulty value. Work with coach to add higher-tariff elements.";
        } else {
          quadrant = "develop";
          advice = "Below group average on both difficulty and execution. Focus on foundational skills at lower difficulty first, building clean technique before progression.";
        }
      }

      // Four-dimension deltas
      const fmt = (v, avg) => avg !== null ? parseFloat((v - avg).toFixed(3)) : null;
      const dvDelta    = fmt(dv,    avgDV);
      const bonusDelta = fmt(bonus, avgBonus);
      const eAvgDelta  = fmt(eAvg,  avgEAvg);
      const penDelta   = fmt(pen,   avgPen);   // negative = fewer penalties = good

      // Four-dimension ratings (relative to peers, -2 to +2 scale)
      const rate = (delta, invert) => {
        if (delta === null) return null;
        const d = invert ? -delta : delta;
        if (d >= 0.5) return 2;
        if (d >= 0.1) return 1;
        if (d > -0.1) return 0;
        if (d > -0.5) return -1;
        return -2;
      };
      const dims = {
        dv:    { label: "Difficulty (DV)", val: dv,    avg: avgDV,    delta: dvDelta,    rating: rate(dvDelta, false),    higher: true  },
        bonus: { label: "Bonus",           val: bonus, avg: avgBonus, delta: bonusDelta, rating: rate(bonusDelta, false),  higher: true  },
        exec:  { label: "Execution",       val: eAvg,  avg: avgEAvg,  delta: eAvgDelta,  rating: rate(eAvgDelta, false),   higher: true  },
        pen:   { label: "Penalties",       val: pen,   avg: avgPen,   delta: penDelta,   rating: rate(penDelta, true),     higher: false },
      };

      return { app, dv, bonus, eAvg, pen, total, scored,
        avgDV, avgBonus, avgEAvg, avgPen, avgTotal,
        pctile, quadrant, advice, dims, peerCount };
    });

    const overallTotal = getOverall(rid, gymnast.id);
    const allOveralls = gymnasts
      .filter(g => g.round === rid && g.level === gymnast.level &&
        (rankBy !== "level+age" || g.age === gymnast.age))
      .map(g => getOverall(rid, g.id))
      .filter(v => v > 0)
      .sort((a, b) => b - a);
    const overallRank = allOveralls.indexOf(overallTotal) + 1;
    const overallOf = allOveralls.length;

    return { gymnast, round, levelName, groupLabel, peerCount, appData, overallTotal, overallRank, overallOf };
  };

  const quadrantStyles = {
    strength: { bg: "#e8f8e0", border: "#5cb85c", label: "Strength", icon: "✦" },
    refine:   { bg: "#fff8e0", border: "#f0ad4e", label: "Refine Execution", icon: "⚠" },
    upgrade:  { bg: "#e0f0ff", border: "#5bc0de", label: "Upgrade Difficulty", icon: "↑" },
    develop:  { bg: "#fce8e8", border: "#d9534f", label: "Development Focus", icon: "◎" },
  };

  let html = getPrintHeader(compData, "Gymnast Diagnostic Reports");

  html += `<p style="font-size:11px;color:#666;margin-bottom:20px;line-height:1.6;">
    Diagnostic analysis compares each gymnast's Difficulty Value (DV), Execution, Bonus, and Penalties against level peers
    at this competition. Quadrant placement indicates the primary area for coaching focus.
    ${gymnasts.length} gymnasts across ${(compData.levels||[]).length} levels · ${rounds.length} round(s).
  </p>`;

  // Legend
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
    ${Object.entries(quadrantStyles).map(([k, s]) => `
      <div style="display:flex;align-items:center;gap:6px;font-size:10px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.bg};border:1px solid ${s.border};"></span>
        <strong>${s.icon} ${s.label}</strong>
      </div>`).join("")}
    <span style="font-size:10px;color:#888;margin-left:4px;">· Deltas vs level group average · pctile = percentile rank within group</span>
  </div>`;

  let first = true;
  rounds.forEach(round => {
    const roundGymnasts = gymnasts.filter(g => g.round === round.id &&
      apparatus.some(a => getTotal(round.id, g.id, a) > 0)
    ).sort((a, b) => (a.club || "").localeCompare(b.club || "") || a.name.localeCompare(b.name));

    if (!roundGymnasts.length) return;

    if (!first) html += `<div class="page-break"></div>`;
    first = false;

    html += `<div class="round-header" style="border-left:4px solid ${colour};">
      <span>${round.name} — Diagnostics</span>
      <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
    </div>`;

    roundGymnasts.forEach((gymnast, gi) => {
      const diag = diagnoseGymnast(gymnast, round);
      if (gi > 0 && gi % 3 === 0) html += `<div class="page-break"></div>`;

      const scoredApps = diag.appData.filter(a => a.scored);
      const hasAnalysis = scoredApps.some(a => a.quadrant);

      html += `<div style="border:1px solid #e0e0e0;border-radius:8px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid;">
        <!-- Gymnast header -->
        <div style="background:${colour}18;border-bottom:2px solid ${colour};padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:14px;font-weight:800;">${gymnast.name}</span>
            <span style="font-size:11px;color:#555;margin-left:8px;">#${gymnast.number || "—"} · ${gymnast.club || "—"}</span>
          </div>
          <div style="text-align:right;font-size:11px;color:#444;">
            <strong>${diag.groupLabel}</strong><br/>
            ${diag.overallTotal > 0
              ? `Overall: <strong style="color:${colour};">${diag.overallTotal.toFixed(2)}</strong>
                 · Rank <strong>${diag.overallRank}</strong> of ${diag.overallOf}
                 · ${diag.peerCount} peer${diag.peerCount !== 1 ? "s" : ""}`
              : "No scores recorded"}
          </div>
        </div>

        <!-- Per-apparatus table -->
        <table style="margin:0;border-radius:0;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="width:80px;">Apparatus</th>
              <th style="width:42px;text-align:right;">DV</th>
              <th style="width:42px;text-align:right;">Bon</th>
              <th style="width:46px;text-align:right;">eAvg</th>
              <th style="width:42px;text-align:right;">Pen</th>
              <th style="width:54px;text-align:right;">Total</th>
              <th style="width:54px;text-align:right;">AvgTotal</th>
              <th style="width:56px;text-align:right;">Δ Total</th>
              <th style="width:50px;text-align:center;">Pctile</th>
              <th>Quadrant</th>
            </tr>
          </thead>
          <tbody>
            ${diag.appData.map(a => {
              if (!a.scored) return `<tr style="opacity:0.4;">
                <td>${APPARATUS_ICONS[a.app] || ""} ${a.app}</td>
                <td colspan="9" style="color:#aaa;font-size:10px;">DNS</td>
              </tr>`;

              const q = a.quadrant ? quadrantStyles[a.quadrant] : null;
              const fmtD = v => v === null ? "—"
                : `<span style="color:${v >= 0 ? "#5cb85c" : "#d9534f"};font-weight:700;">${v >= 0 ? "+" : ""}${v.toFixed(3)}</span>`;
              const totalDelta = a.avgTotal !== null ? a.total - a.avgTotal : null;

              return `<tr style="${q ? `background:${q.bg};` : ""}">
                <td style="font-weight:600;">${APPARATUS_ICONS[a.app] || ""} ${a.app}</td>
                <td style="text-align:right;">${a.dv > 0 ? a.dv.toFixed(2) : "—"}</td>
                <td style="text-align:right;">${a.bonus > 0 ? a.bonus.toFixed(2) : "—"}</td>
                <td style="text-align:right;">${a.eAvg > 0 ? a.eAvg.toFixed(2) : "—"}</td>
                <td style="text-align:right;${a.pen > 0 ? "color:#d9534f;" : "color:#aaa;"}">${a.pen > 0 ? `−${a.pen.toFixed(2)}` : "—"}</td>
                <td style="text-align:right;font-weight:700;">${a.total.toFixed(3)}</td>
                <td style="text-align:right;color:#777;">${a.avgTotal !== null ? a.avgTotal.toFixed(3) : "—"}</td>
                <td style="text-align:right;">${fmtD(totalDelta)}</td>
                <td style="text-align:center;font-size:10px;">${a.pctile !== null ? `${a.pctile}%` : "—"}</td>
                <td style="font-size:10px;">${q ? `<span style="font-weight:700;color:${q.border};">${q.icon} ${q.label}</span>` : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>

        ${hasAnalysis ? `
        <!-- Four-dimension breakdown -->
        <div style="padding:10px 14px;background:#fafafa;border-top:1px solid #eee;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#888;margin-bottom:8px;">Component Breakdown vs Peers</div>
          <table style="margin:0;border-radius:0;font-size:10px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="width:80px;">Apparatus</th>
                <th style="text-align:right;">DV</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
                <th style="width:8px;"></th>
                <th style="text-align:right;">Bonus</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
                <th style="width:8px;"></th>
                <th style="text-align:right;">Exec</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
                <th style="width:8px;"></th>
                <th style="text-align:right;">Pen</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
              </tr>
            </thead>
            <tbody>
              ${diag.appData.filter(a => a.scored).map(a => {
                const fmtDim = (delta, invert) => {
                  if (delta === null) return `<td style="text-align:right;color:#aaa;">—</td>`;
                  const good = invert ? delta <= 0 : delta >= 0;
                  const neutral = Math.abs(delta) < 0.05;
                  const color = neutral ? "#888" : good ? "#5cb85c" : "#d9534f";
                  const prefix = delta > 0 ? "+" : "";
                  return `<td style="text-align:right;font-weight:700;color:${color};">${prefix}${delta.toFixed(3)}</td>`;
                };
                const fmtVal = v => v > 0 ? v.toFixed(2) : "—";
                const fmtAvg = v => v !== null ? v.toFixed(2) : "—";
                return `<tr>
                  <td style="font-weight:600;">${APPARATUS_ICONS[a.app] || ""} ${a.app}</td>
                  <td style="text-align:right;">${fmtVal(a.dv)}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgDV)}</td>
                  ${fmtDim(a.dims.dv.delta, false)}
                  <td></td>
                  <td style="text-align:right;">${fmtVal(a.bonus)}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgBonus)}</td>
                  ${fmtDim(a.dims.bonus.delta, false)}
                  <td></td>
                  <td style="text-align:right;">${fmtVal(a.eAvg)}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgEAvg)}</td>
                  ${fmtDim(a.dims.exec.delta, false)}
                  <td></td>
                  <td style="text-align:right;${a.pen > 0 ? "color:#d9534f;" : "color:#aaa;"}">${a.pen > 0 ? a.pen.toFixed(2) : "—"}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgPen)}</td>
                  ${fmtDim(a.dims.pen.delta, true)}
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>

        <!-- Coaching notes -->
        <div style="padding:10px 14px;background:#fafafa;border-top:1px solid #eee;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#888;margin-bottom:6px;">Coaching Notes</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${diag.appData.filter(a => a.scored && a.advice).map(a => {
              const q = quadrantStyles[a.quadrant];
              return `<div style="flex:1;min-width:180px;border-left:3px solid ${q.border};padding:6px 10px;background:${q.bg};border-radius:0 4px 4px 0;">
                <div style="font-size:10px;font-weight:700;margin-bottom:3px;">${APPARATUS_ICONS[a.app] || ""} ${a.app}</div>
                <div style="font-size:10px;line-height:1.5;color:#333;">${a.advice}</div>
              </div>`;
            }).join("")}
          </div>
        </div>` : ""}
      </div>`;
    });
  });

  html += `<div class="print-footer">
    <span>GymScore · Gymnast Diagnostic Report · Generated ${new Date().toLocaleDateString("en-GB")}</span>
    <span>${compData.organiserName || ""}</span>
  </div>`;

  return html;
}

// Build results sheet PDF
function buildResultsHTML(compData, gymnasts, scores) {
  const colour = compData.brandColour || "#000dff";
  const apparatus = compData.apparatus || [];
  const rounds = compData.rounds || [];

  const getScore = (roundId, gid, app) => {
    const v = parseFloat(scores[gymnast_key(roundId, gid, app)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (roundId, gid) =>
    apparatus.reduce((s, a) => s + getScore(roundId, gid, a), 0);

  const buildRankGroups = (roundId) => {
    const roundGymnasts = gymnasts.filter(g => g.round === roundId);
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "Unknown age") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));
  };

  const badgeCell = (rank) => {
    if (rank === null) return `<td><span style="font-size:10px;color:#aaa;">DNS</span></td>`;
    const medals = {
      1: { text: "🥇 1st", bg: "#fff7d6", border: "#d4a800" },
      2: { text: "🥈 2nd", bg: "#f2f2f2", border: "#999" },
      3: { text: "🥉 3rd", bg: "#fdf0e8", border: "#c87028" },
    };
    const m = medals[rank] || { text: `${rank}th`, bg: "#f5f5f5", border: "#ccc" };
    return `<td><span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:${m.bg};border:1px solid ${m.border};">${m.text}</span></td>`;
  };

  const totalWithScores = gymnasts.filter(g =>
    apparatus.some(a => getScore(g.round, g.id, a) > 0)
  ).length;

  let html = getPrintHeader(compData, "Official Results");

  // Summary panel
  html += `<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
    ${[
      [gymnasts.length, "Gymnasts"],
      [(compData.levels || []).length, "Levels"],
      [rounds.length, "Rounds"],
      [apparatus.length, "Apparatus"],
      [totalWithScores, "Scored"],
    ].map(([n, label]) => `
      <div style="background:#f5f5f5;border-radius:6px;padding:10px 16px;text-align:center;">
        <div style="font-size:20px;font-weight:800;color:${colour};">${n}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;">${label}</div>
      </div>`).join("")}
  </div>`;

  // Section 1: Overall results per round
  rounds.forEach((round, ri) => {
    if (ri > 0) html += `<div class="page-break"></div>`;
    html += `<div class="round-header" style="border-left:4px solid ${colour};">
      <span>${round.name} — Overall Results</span>
      <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
    </div>`;

    const rankGroups = buildRankGroups(round.id);
    if (!rankGroups.length) {
      html += `<p style="color:#999;font-size:10px;padding:8px 0;">No gymnasts in this round.</p>`;
    } else {
      rankGroups.forEach(({ levelName, ageLabel, gymnasts: glist }) => {
        const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
        const withTotals = glist.map(g => ({ ...g, total: getTotal(round.id, g.id) }));
        const ranked = denseRank(withTotals.filter(g => g.total > 0), "total");
        const dns = withTotals.filter(g => g.total === 0);

        html += `<h2 style="border-left:3px solid ${colour};padding-left:8px;">${groupLabel}</h2>
        <table style="margin-bottom:18px;">
          <thead><tr>
            <th style="width:60px;">Rank</th>
            <th style="width:32px;">#</th>
            <th>Gymnast</th><th>Club</th>
            ${apparatus.map(a => `<th style="width:64px;text-align:right;">${a}</th>`).join("")}
            <th style="width:70px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
          ${ranked.map(g => `<tr>
            ${badgeCell(g.rank)}
            <td style="color:#888;">${g.number || ""}</td>
            <td><strong>${g.name}</strong></td>
            <td style="color:#666;">${g.club || ""}</td>
            ${apparatus.map(a => {
              const s = getScore(round.id, g.id, a);
              return `<td style="text-align:right;color:#555;">${s > 0 ? s.toFixed(2) : "—"}</td>`;
            }).join("")}
            <td style="text-align:right;font-weight:800;color:${colour};">${g.total.toFixed(2)}</td>
          </tr>`).join("")}
          ${dns.map(g => `<tr style="opacity:0.4;">
            <td style="color:#aaa;font-size:10px;">DNS</td>
            <td style="color:#aaa;">${g.number || ""}</td>
            <td>${g.name}</td>
            <td style="color:#aaa;">${g.club || ""}</td>
            ${apparatus.map(() => `<td style="text-align:right;color:#aaa;">—</td>`).join("")}
            <td style="text-align:right;color:#aaa;">—</td>
          </tr>`).join("")}
          </tbody>
        </table>`;
      });
    }
  });

  // Section 2: Per-apparatus breakdown per round
  rounds.forEach((round) => {
    html += `<div class="page-break"></div>`;
    html += getPrintHeader(compData, `${round.name} — By Apparatus`);

    const rankGroups = buildRankGroups(round.id);
    apparatus.forEach((app, ai) => {
      if (ai > 0) html += `<div style="margin-top:18px;border-top:1px solid #eee;padding-top:14px;"></div>`;
      html += `<h2 style="border-left:3px solid ${colour};padding-left:8px;">${APPARATUS_ICONS[app] || "🏅"} ${app}</h2>`;

      rankGroups.forEach(({ levelName, ageLabel, gymnasts: glist }) => {
        const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
        const withScores = glist.map(g => ({ ...g, score: getScore(round.id, g.id, app) }));
        const ranked = denseRank(withScores.filter(g => g.score > 0), "score");
        const dns = withScores.filter(g => g.score === 0);

        html += `<h3 style="color:#444;margin-top:10px;">${groupLabel} <span style="font-weight:400;color:#888;">(${glist.length})</span></h3>
        <table style="margin-bottom:14px;">
          <thead><tr>
            <th style="width:60px;">Rank</th>
            <th style="width:32px;">#</th>
            <th>Gymnast</th><th>Club</th>
            <th style="width:80px;text-align:right;">Score</th>
          </tr></thead>
          <tbody>
          ${ranked.map(g => `<tr>
            ${badgeCell(g.rank)}
            <td style="color:#888;">${g.number || ""}</td>
            <td>${g.name}</td>
            <td style="color:#666;">${g.club || ""}</td>
            <td style="text-align:right;font-weight:700;color:${colour};">${g.score.toFixed(2)}</td>
          </tr>`).join("")}
          ${dns.map(g => `<tr style="opacity:0.4;">
            <td style="color:#aaa;font-size:10px;">DNS</td>
            <td style="color:#aaa;">${g.number || ""}</td>
            <td>${g.name}</td>
            <td style="color:#aaa;">${g.club || ""}</td>
            <td style="text-align:right;color:#aaa;">—</td>
          </tr>`).join("")}
          </tbody>
        </table>`;
      });
    });
  });

  html += `<div class="print-footer">
    <span>GymScore · Official Results · Generated ${new Date().toLocaleDateString("en-GB")}</span>
    <span>${compData.organiserName || ""}</span>
  </div>`;

  return html;
}


function Step2_Gymnasts({ compData, setCompDataFn, data, setData, onNext, onBack }) {
  const [selectedClub, setSelectedClub] = useState(compData.clubs[0]?.name || "");
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [editId, setEditId] = useState(null);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [formWarnings, setFormWarnings] = useState([]);
  const [csvWarnings, setCsvWarnings] = useState({ errors: [], warns: [] });
  const fileRef = useRef(null);

  const nextNumber = (gymnasts) => {
    const used = new Set(gymnasts.map(g => parseInt(g.number)).filter(n => !isNaN(n)));
    let n = 1;
    while (used.has(n)) n++;
    return String(n);
  };

  const blankForm = (gymnasts = data) => ({
    name: "", level: "", round: compData.rounds[0]?.id || "",
    number: nextNumber(gymnasts), age: "", group: ""
  });
  const [newG, setNewG] = useState(() => blankForm());

  const allAges = [...new Set(data.map(g => g.age).filter(Boolean))];
  const allGroups = [...new Set(data.map(g => g.group).filter(Boolean))];

  const validateGymnast = (g, excludeId = null) => {
    const others = data.filter(x => x.id !== excludeId);
    const warns = [];
    if (g.number && others.find(x => x.number === g.number)) {
      warns.push(`Number #${g.number} is already assigned to another gymnast.`);
    }
    if (g.name && g.level && others.find(x =>
      x.name.toLowerCase() === g.name.toLowerCase() && x.level === g.level
    )) {
      warns.push(`"${g.name}" already exists at this level — possible duplicate.`);
    }
    return warns;
  };

  const attemptAdd = () => {
    if (!newG.name || !newG.level || !newG.round) return;
    const warns = validateGymnast(newG, editId);
    if (warns.length) { setFormWarnings(warns); return; }
    commit();
  };

  const commit = () => {
    const gymnast = { ...newG, club: selectedClub, id: editId || generateId() };
    if (editId) {
      setData(d => d.map(g => g.id === editId ? gymnast : g));
      setEditId(null);
      setNewG(blankForm(data));
    } else {
      setData(d => {
        const updated = [...d, gymnast];
        setNewG(blankForm(updated));
        return updated;
      });
    }
    setFormWarnings([]);
  };

  const startEdit = (g) => {
    setSelectedClub(g.club);
    setEditId(g.id);
    setNewG({ name: g.name, level: g.level, round: g.round, number: g.number, age: g.age, group: g.group });
    setFormWarnings([]);
  };

  const cancelEdit = () => { setEditId(null); setNewG(blankForm()); setFormWarnings([]); };

  const doRemove = () => {
    setData(d => d.filter(g => g.id !== pendingRemove.id));
    setPendingRemove(null);
  };

  // CSV
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      const warns = [];   // informational (auto-added clubs)
      const errors = [];  // hard skips
      const toAdd = [];
      const newClubs = []; // clubs from CSV not yet in setup

      rows.forEach((row, i) => {
        const rowNum = i + 2;
        if (!row.name) { errors.push(`Row ${rowNum}: missing Name — skipped`); return; }
        const levelObj = compData.levels.find(l => l.name.toLowerCase() === (row.level || "").toLowerCase());
        if (!levelObj) { errors.push(`Row ${rowNum}: level "${row.level}" not found in setup — skipped`); return; }
        const roundObj = compData.rounds.find(r => r.name.toLowerCase() === (row.round || "").toLowerCase());
        if (!roundObj) { errors.push(`Row ${rowNum}: round "${row.round}" not found in setup — skipped`); return; }
        if (row.number && data.find(x => x.number === row.number)) {
          errors.push(`Row ${rowNum}: number #${row.number} already taken — skipped`); return;
        }

        // Auto-add unknown clubs
        const clubName = (row.club || selectedClub || "").trim();
        if (clubName) {
          const existsInSetup = compData.clubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
          const alreadyQueued = newClubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
          if (!existsInSetup && !alreadyQueued) {
            newClubs.push({ id: generateId(), name: clubName });
            warns.push(`"${clubName}" added to Participating Clubs`);
          }
        }

        toAdd.push({ id: generateId(), name: row.name, number: row.number, club: clubName, level: levelObj.id, round: roundObj.id, age: row.age || "", group: row.group || "" });
      });

      setCsvWarnings({ errors, warns });
      if (newClubs.length) {
        compData.clubs.push(...newClubs); // reflected via setCompData below
        setCompDataFn(d => ({ ...d, clubs: [...d.clubs, ...newClubs] }));
      }
      if (toAdd.length) setData(d => [...d, ...toAdd]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Rotation schedule
  const [rotations, setRotations] = useState({});
  const allGroups2 = [...new Set(data.map(g => g.group).filter(Boolean))];
  useEffect(() => {
    if (allGroups2.length && compData.apparatus.length) {
      setRotations(prev => buildRotations(allGroups2, compData.apparatus, prev));
    }
  }, [JSON.stringify(allGroups2), JSON.stringify(compData.apparatus)]);

  // Display
  const roundGymnasts = data.filter(g => g.round === activeRound);
  const grouped = {};
  roundGymnasts.forEach(g => {
    const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level;
    if (!grouped[levelName]) grouped[levelName] = {};
    const grp = g.group || "—";
    if (!grouped[levelName][grp]) grouped[levelName][grp] = [];
    grouped[levelName][grp].push(g);
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Gymnast <span>Details</span></div>
        <div className="page-sub">Add gymnasts club by club, or upload via CSV</div>
      </div>

      {/* CSV Upload */}
      <div className="card">
        <div className="card-title">CSV Upload</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: (csvWarnings.errors.length || csvWarnings.warns.length) ? 12 : 0 }}>
          <div className="csv-zone" style={{ flex: 1 }} onClick={() => fileRef.current.click()}>
            📂 Click to upload CSV file
          </div>
          <button className="btn btn-secondary" onClick={downloadTemplate}>⬇ Download Template</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
        {csvWarnings.errors.length > 0 && (
          <div className="error-box" style={{ marginBottom: 8 }}>
            <strong>⚠ {csvWarnings.errors.length} row{csvWarnings.errors.length > 1 ? "s" : ""} skipped:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {csvWarnings.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {csvWarnings.warns.length > 0 && (
          <div className="warn-box">
            <strong>ℹ Notices:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {csvWarnings.warns.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Manual Add */}
      <div className="card">
        <div className="card-title">{editId ? "Edit Gymnast" : "Add Gymnast Manually"}</div>
        <div style={{ marginBottom: 12 }}>
          <label className="label">Club</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {compData.clubs.map(c => (
              <button key={c.id} className={`btn btn-sm ${selectedClub === c.name ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSelectedClub(c.name)}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="grid-3" style={{ marginBottom: 8 }}>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" placeholder="Full name" value={newG.name}
              onChange={e => setNewG(g => ({ ...g, name: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Number</label>
            <input className="input" placeholder="e.g. 42" value={newG.number}
              onChange={e => setNewG(g => ({ ...g, number: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Level</label>
            <select className="select" value={newG.level}
              onChange={e => setNewG(g => ({ ...g, level: e.target.value }))}>
              <option value="">Select…</option>
              {compData.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Round</label>
            <select className="select" value={newG.round}
              onChange={e => setNewG(g => ({ ...g, round: e.target.value }))}>
              <option value="">Select…</option>
              {compData.rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Age</label>
            <input className="input" list="ages-list" placeholder="e.g. 9 years"
              value={newG.age} onChange={e => setNewG(g => ({ ...g, age: e.target.value }))} />
            <datalist id="ages-list">{allAges.map(a => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="field">
            <label className="label">Group</label>
            <input className="input" list="groups-list" placeholder="e.g. Group A"
              value={newG.group} onChange={e => setNewG(g => ({ ...g, group: e.target.value }))} />
            <datalist id="groups-list">{allGroups.map(g => <option key={g} value={g} />)}</datalist>
          </div>
        </div>

        {formWarnings.length > 0 && (
          <div className="warn-box">
            {formWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="btn btn-warn btn-sm" onClick={commit}>Add anyway</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setFormWarnings([])}>Cancel</button>
            </div>
          </div>
        )}

        {formWarnings.length === 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={attemptAdd}>{editId ? "Save Changes" : "Add Gymnast"}</button>
            {editId && <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        )}
      </div>

      {/* Gymnast List */}
      <div className="card">
        <div className="card-title">Gymnast List — {data.length} total</div>
        <div className="tabs">
          {compData.rounds.map(r => (
            <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
              onClick={() => setActiveRound(r.id)}>
              {r.name} ({data.filter(g => g.round === r.id).length})
            </button>
          ))}
        </div>
        {Object.keys(grouped).length === 0 && <div className="empty">No gymnasts in this round yet</div>}
        {Object.entries(grouped).map(([level, groups]) => (
          <div key={level}>
            <div className="group-header">
              <span className="group-label">{level}</span>
              <div className="group-line" />
            </div>
            {Object.entries(groups).map(([grp, gymnasts]) => (
              <div key={grp}>
                <div className="sub-group-label">{grp}</div>
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead><tr><th>#</th><th>Name</th><th>Club</th><th>Age</th><th style={{ width: 60, textAlign: "center" }}>DNS</th><th></th></tr></thead>
                    <tbody>
                      {gymnasts.map(g => (
                        <tr key={g.id} style={{ opacity: g.dns ? 0.5 : 1 }}>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td style={{ textDecoration: g.dns ? "line-through" : "none" }}>{g.name}</td>
                          <td>{g.club}</td>
                          <td>{g.age}</td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              title={g.dns ? "Mark as competing" : "Mark as DNS (Did Not Start)"}
                              onClick={() => setData(d => d.map(x => x.id === g.id ? { ...x, dns: !x.dns } : x))}
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
                                background: g.dns ? "var(--danger)" : "var(--surface2)",
                                color: g.dns ? "#fff" : "var(--muted)", fontSize: 13, fontWeight: 700
                              }}>
                              {g.dns ? "✕" : "—"}
                            </button>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => startEdit(g)}>Edit</button>
                              <button className="btn btn-sm btn-danger"
                                onClick={() => setPendingRemove({ id: g.id, msg: `Remove gymnast "${g.name}"?` })}>Remove</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Rotation Schedule */}
      {allGroups2.length > 0 && compData.apparatus.length > 0 && (
        <div className="card">
          <div className="card-title">Apparatus Rotation Schedule</div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Auto-populated with standard rotation — adjust manually if needed
          </p>
          {compData.rounds.map(round => (
            <div key={round.id}>
              <div className="group-header">
                <span className="group-label">{round.name}</span>
                <div className="group-line" />
              </div>
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      {compData.apparatus.map((_, i) => <th key={i}>Position {i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {allGroups2.map(group => (
                      <tr key={group}>
                        <td><strong>{group}</strong></td>
                        {compData.apparatus.map((_, i) => (
                          <td key={i}>
                            <select className="select" style={{ padding: "4px 8px", fontSize: 12 }}
                              value={rotations[group]?.[i] || ""}
                              onChange={e => setRotations(r => ({
                                ...r,
                                [group]: Object.assign(
                                  [...(r[group] || compData.apparatus)],
                                  { [i]: e.target.value }
                                )
                              }))}>
                              <option value="">—</option>
                              {compData.apparatus.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="step-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Dashboard</button>
        <button className="btn btn-primary" onClick={onNext}>
          Done — Back to Dashboard →
        </button>
      </div>

      {pendingRemove && (
        <ConfirmModal message={pendingRemove.msg} onConfirm={doRemove} onCancel={() => setPendingRemove(null)} />
      )}
    </div>
  );
}

// ============================================================
// PHASE 2 STEP 1 — Score Input (upgraded: sheet tracker + query flags + DNS)
// ============================================================
function Phase2_Step1({ compData, gymnasts, scores, setScores }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [showPenalties, setShowPenalties] = useState({});
  const [queryModal, setQueryModal] = useState(null); // { gid, app }
  const [queryNote, setQueryNote] = useState("");
  // sheetReceived: { [roundId]: { [judgeIndex_apparatus]: bool } }
  const [sheetReceived, setSheetReceived] = useState({});
  const [showTracker, setShowTracker] = useState(true);
  const fig = !!compData.useDEScoring;

  // ── Key helpers ──────────────────────────────────────────
  const baseKey = (gid, app) => gymnast_key(activeRound, gid, app);
  const subKey  = (gid, app, sub) => `${baseKey(gid, app)}__${sub}`;
  const queryKey = (gid, app) => `${baseKey(gid, app)}__query`;
  const queryNoteKey = (gid, app) => `${baseKey(gid, app)}__queryNote`;
  const queryResolvedKey = (gid, app) => `${baseKey(gid, app)}__queryResolved`;

  // ── Judge counts ─────────────────────────────────────────
  const eJudgeCount = (app) =>
    (compData.judges || []).filter(j => j.apparatus === app && (j.role === "E" || !j.role)).length;

  // ── Total recalculation ──────────────────────────────────
  const recalcTotal = (next, gid, app) => {
    if (!fig) return;
    const dv    = parseFloat(next[subKey(gid, app, "dv")])  || 0;
    const bonus = parseFloat(next[subKey(gid, app, "bon")]) || 0;
    const tf    = parseFloat(next[subKey(gid, app, "tf")])  || 0;
    const oob   = parseFloat(next[subKey(gid, app, "oob")]) || 0;
    const fall  = parseFloat(next[subKey(gid, app, "fall")])|| 0;
    const nd    = parseFloat(next[subKey(gid, app, "nd")])  || 0;
    const n = eJudgeCount(app);
    let eSum = 0, eCount = 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(next[subKey(gid, app, `e${i}`)]);
      if (!isNaN(v) && v > 0) { eSum += v; eCount++; }
    }
    const eAvg    = eCount > 0 ? eSum / eCount : 0;
    const penalty = tf + oob + fall + nd;
    const hasAny  = dv > 0 || bonus > 0 || eAvg > 0;
    const total   = hasAny ? Math.max(0, dv + bonus + eAvg - penalty) : 0;
    next[baseKey(gid, app)] = hasAny ? String(parseFloat(total.toFixed(3))) : "";
  };

  const commitField = (gid, app, sub, raw) => {
    const rounded = round2dp(raw);
    const val = rounded === "" ? "" : rounded;
    if (fig) {
      setScores(s => {
        const n = { ...s, [sub ? subKey(gid, app, sub) : baseKey(gid, app)]: val };
        recalcTotal(n, gid, app);
        return n;
      });
    } else {
      setScores(s => ({ ...s, [baseKey(gid, app)]: val }));
    }
  };

  const readVal = (gid, app, sub) =>
    scores[sub ? subKey(gid, app, sub) : baseKey(gid, app)] ?? "";

  const getEAvg = (gid, app) => {
    const n = eJudgeCount(app);
    let sum = 0, count = 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(scores[subKey(gid, app, `e${i}`)]);
      if (!isNaN(v) && v > 0) { sum += v; count++; }
    }
    return count > 0 ? sum / count : null;
  };
  const getPenaltyTotal = (gid, app) =>
    ["tf","oob","fall","nd"].reduce((s, k) => s + (parseFloat(scores[subKey(gid, app, k)]) || 0), 0);
  const getAppTotal = (gid, app) => parseFloat(scores[baseKey(gid, app)]) || 0;
  const getGymnastTotal = (gid) =>
    compData.apparatus.reduce((s, a) => s + getAppTotal(gid, a), 0);

  const togglePenalties = (gid, app) => {
    const k = `${gid}__${app}`;
    setShowPenalties(p => ({ ...p, [k]: !p[k] }));
  };

  // ── Query helpers ────────────────────────────────────────
  const isQueried = (gid, app) => !!scores[queryKey(gid, app)];
  const isResolved = (gid, app) => !!scores[queryResolvedKey(gid, app)];
  const getQueryNote = (gid, app) => scores[queryNoteKey(gid, app)] || "";

  const openQueryModal = (gid, app) => {
    setQueryModal({ gid, app });
    setQueryNote(getQueryNote(gid, app));
  };

  const saveQuery = () => {
    const { gid, app } = queryModal;
    setScores(s => ({
      ...s,
      [queryKey(gid, app)]: "1",
      [queryNoteKey(gid, app)]: queryNote,
      [queryResolvedKey(gid, app)]: "",
    }));
    setQueryModal(null);
  };

  const resolveQuery = (gid, app) => {
    setScores(s => ({
      ...s,
      [queryKey(gid, app)]: "",
      [queryResolvedKey(gid, app)]: "",
    }));
  };

  // ── Sheet received tracker ───────────────────────────────
  const judges = compData.judges || [];
  const toggleSheet = (roundId, judgeIdx, apparatus) => {
    const k = `${judgeIdx}__${apparatus}`;
    setSheetReceived(prev => ({
      ...prev,
      [roundId]: { ...(prev[roundId] || {}), [k]: !(prev[roundId]?.[k]) }
    }));
  };

  const sheetsIn = (roundId) => {
    const rd = sheetReceived[roundId] || {};
    return Object.values(rd).filter(Boolean).length;
  };

  const totalSheets = judges.length * (compData.apparatus || []).length;

  // ── Group gymnasts ───────────────────────────────────────
  const roundGymnasts = gymnasts.filter(g => g.round === activeRound);
  const grouped = {};
  roundGymnasts.forEach(g => {
    const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level;
    if (!grouped[levelName]) grouped[levelName] = {};
    const grp = g.group || "—";
    if (!grouped[levelName][grp]) grouped[levelName][grp] = [];
    grouped[levelName][grp].push(g);
  });

  // ── Labelled score field ─────────────────────────────────
  const SF = ({ gid, app, sub, label, max, warn, readOnly, value, width = 54 }) => {
    const stored = readVal(gid, app, sub);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5,
          color: warn ? "#f0ad4e" : "var(--muted)", fontWeight: 600 }}>{label}</span>
        {readOnly
          ? <div style={{ width, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--surface2)", borderRadius: 5, fontSize: 12, fontWeight: 700,
              color: value !== null && value !== undefined ? "var(--accent)" : "var(--muted)" }}>
              {value !== null && value !== undefined ? (typeof value === "number" ? value.toFixed(2) : value) : "—"}
            </div>
          : <input
              key={`${gid}_${app}_${sub ?? "tot"}_${stored}`}
              className="score-input de"
              type="number" step="0.01" min="0" max={max ?? 99}
              defaultValue={stored}
              style={{ width, borderColor: warn ? "rgba(240,173,78,0.5)" : undefined }}
              onBlur={e => commitField(gid, app, sub, e.target.value)}
            />
        }
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Score <span>Input</span></div>
        <div className="page-sub">
          {fig ? "FIG artistic scoring — DV + Bonus + avg(E1…En) − Penalties" : "Enter total scores — 2 decimal places"}
        </div>
      </div>

      {/* ── Sheet Received Tracker ─────────────────────────── */}
      {judges.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)" }}>
              📋 Sheet Tracker — {sheetsIn(activeRound)} of {totalSheets} sheets received
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTracker(v => !v)}>
              {showTracker ? "Hide" : "Show"}
            </button>
          </div>
          {showTracker && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${(compData.apparatus || []).length}, 1fr)`, gap: 6, alignItems: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>Judge</div>
                {(compData.apparatus || []).map(a => (
                  <div key={a} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>
                    {APPARATUS_ICONS[a] || "🏅"} {a}
                  </div>
                ))}
                {judges.map((judge, ji) => (
                  <React.Fragment key={ji}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {judge.name || `Judge ${ji + 1}`}
                      {judge.apparatus && <span style={{ fontSize: 10, color: "var(--muted)", display: "block" }}>{judge.apparatus}</span>}
                    </div>
                    {(compData.apparatus || []).map(app => {
                      const k = `${ji}__${app}`;
                      const received = sheetReceived[activeRound]?.[k];
                      // Only relevant if judge is assigned to this apparatus (or has no apparatus restriction)
                      const relevant = !judge.apparatus || judge.apparatus === app;
                      return (
                        <div key={`${ji}-${app}`} style={{ display: "flex", justifyContent: "center" }}>
                          {relevant ? (
                            <button
                              onClick={() => toggleSheet(activeRound, ji, app)}
                              title={received ? "Mark as not received" : "Mark sheet received"}
                              style={{
                                width: 36, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
                                background: received ? "var(--success)" : "var(--surface2)",
                                color: received ? "#fff" : "var(--muted)",
                                fontSize: 13, fontWeight: 700, transition: "all 0.15s"
                              }}>
                              {received ? "✓" : "·"}
                            </button>
                          ) : (
                            <div style={{ width: 36, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--border)", fontSize: 16 }}>—</div>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              {sheetsIn(activeRound) < totalSheets && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  ⏳ Waiting on {totalSheets - sheetsIn(activeRound)} sheet{totalSheets - sheetsIn(activeRound) !== 1 ? "s" : ""}
                </div>
              )}
              {sheetsIn(activeRound) === totalSheets && totalSheets > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--success)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  ✅ All sheets received for this round
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {fig && (
        <div style={{ background: "rgba(0,13,255,0.04)", border: "1px solid rgba(0,13,255,0.12)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12,
          color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>FIG Artistic Scoring</strong>
          &nbsp;·&nbsp;Total = DV + Bonus + avg(E1…En) − Penalties
          &nbsp;·&nbsp;E judge count per apparatus set in Setup → Judges
          &nbsp;·&nbsp;Totals calculated on blur
        </div>
      )}

      <div className="tabs">
        {compData.rounds.map(r => (
          <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
            onClick={() => setActiveRound(r.id)}>{r.name}</button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 && <div className="empty">No gymnasts in this round</div>}

      {Object.entries(grouped).map(([level, groups]) => (
        <div key={level}>
          <div className="group-header">
            <span className="group-label">{level}</span>
            <div className="group-line" />
          </div>
          {Object.entries(groups).map(([grp, glist]) => (
            <div key={grp} style={{ marginBottom: 24 }}>
              <div className="sub-group-label">{grp}</div>

              {fig ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {glist.map(g => {
                    const gymTotal = getGymnastTotal(g.id);
                    const isDns = !!g.dns;
                    const hasQuery = compData.apparatus.some(a => isQueried(g.id, a));
                    return (
                      <div key={g.id} style={{
                        background: "var(--surface)", border: `1px solid ${isDns ? "var(--border)" : hasQuery ? "rgba(240,173,78,0.4)" : "var(--border)"}`,
                        borderRadius: "var(--radius)", overflow: "hidden",
                        opacity: isDns ? 0.45 : 1
                      }}>
                        {/* Gymnast header */}
                        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
                          borderBottom: "1px solid var(--border)",
                          background: isDns ? "var(--surface2)" : hasQuery ? "rgba(240,173,78,0.06)" : "transparent" }}>
                          <div style={{ display: "flex", align: "center", gap: 12 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</span>
                            <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>#{g.number} · {g.club}</span>
                            {isDns && <span style={{ background: "var(--danger)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, marginLeft: 8, letterSpacing: 1 }}>DNS</span>}
                            {hasQuery && !isDns && <span style={{ background: "rgba(240,173,78,0.2)", color: "#f0ad4e", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, marginLeft: 8, letterSpacing: 1 }}>⚠ QUERY</span>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>Total&nbsp;</span>
                            <strong style={{ fontSize: 15, color: gymTotal > 0 ? "var(--accent)" : "var(--muted)" }}>
                              {gymTotal > 0 ? gymTotal.toFixed(3) : "—"}
                            </strong>
                          </div>
                        </div>

                        {/* Per-apparatus strips */}
                        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {compData.apparatus.map(app => {
                            const n = eJudgeCount(app);
                            const appTotal = getAppTotal(g.id, app);
                            const eAvg = getEAvg(g.id, app);
                            const penalties = getPenaltyTotal(g.id, app);
                            const hasPen = penalties > 0;
                            const open = !!showPenalties[`${g.id}__${app}`];
                            const queried = isQueried(g.id, app);
                            const resolved = isResolved(g.id, app);
                            const note = getQueryNote(g.id, app);

                            return (
                              <div key={app} style={{ background: "var(--surface2)", borderRadius: 6,
                                border: `1px solid ${queried ? "rgba(240,173,78,0.5)" : appTotal > 0 ? "var(--border)" : "transparent"}`,
                                padding: "8px 10px" }}>

                                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                                  <div style={{ minWidth: 60, fontSize: 12, fontWeight: 700, paddingBottom: 6 }}>
                                    {APPARATUS_ICONS[app] || "🏅"} {app}
                                  </div>

                                  {!isDns && <React.Fragment>
                                    <SF gid={g.id} app={app} sub="dv"  label="DV"    max={10} />
                                    <SF gid={g.id} app={app} sub="bon" label="Bonus" max={2}  />
                                    <div style={{ width: 1, height: 36, background: "var(--border)", alignSelf: "center" }} />
                                    {n === 0
                                      ? <div style={{ fontSize: 11, color: "#f0ad4e", alignSelf: "center", paddingBottom: 6 }}>⚠ No E judges</div>
                                      : Array.from({ length: n }, (_, i) => (
                                          <SF key={i} gid={g.id} app={app} sub={`e${i+1}`} label={`E${i+1}`} max={10} />
                                        ))
                                    }
                                    {n > 0 && <SF gid={g.id} app={app} sub={null} label={n > 1 ? "eAvg" : "Exec"} readOnly value={eAvg} />}
                                    <div style={{ width: 1, height: 36, background: "var(--border)", alignSelf: "center" }} />
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                      <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5,
                                        color: hasPen ? "#f0ad4e" : "var(--muted)", fontWeight: 600 }}>Pen</span>
                                      <button onClick={() => togglePenalties(g.id, app)}
                                        style={{ width: 54, height: 30, background: open ? "rgba(240,173,78,0.15)" : "var(--surface2)",
                                          border: `1px solid ${hasPen ? "rgba(240,173,78,0.6)" : "var(--border)"}`,
                                          borderRadius: 5, fontSize: 11, cursor: "pointer",
                                          color: hasPen ? "#f0ad4e" : "var(--muted)", fontWeight: hasPen ? 700 : 400 }}>
                                        {hasPen ? `−${penalties.toFixed(2)}` : open ? "▴" : "▾"}
                                      </button>
                                    </div>
                                    <div style={{ width: 1, height: 36, background: "var(--border)", alignSelf: "center" }} />
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                      <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)", fontWeight: 700 }}>Total</span>
                                      <div style={{ width: 64, height: 30, display: "flex", alignItems: "center",
                                        justifyContent: "center", background: appTotal > 0 ? "rgba(0,13,255,0.06)" : "var(--surface2)",
                                        borderRadius: 5, fontSize: 13, fontWeight: 800,
                                        color: appTotal > 0 ? "var(--accent)" : "var(--muted)",
                                        border: `1px solid ${appTotal > 0 ? "rgba(0,13,255,0.2)" : "var(--border)"}` }}>
                                        {appTotal > 0 ? appTotal.toFixed(3) : "—"}
                                      </div>
                                    </div>
                                    <div style={{ width: 1, height: 36, background: "var(--border)", alignSelf: "center" }} />
                                    {/* Query flag */}
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                      <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: queried ? "#f0ad4e" : "var(--muted)", fontWeight: 600 }}>Query</span>
                                      <button
                                        onClick={() => queried ? resolveQuery(g.id, app) : openQueryModal(g.id, app)}
                                        title={queried ? "Click to resolve query" : "Flag a coach query on this score"}
                                        style={{ width: 54, height: 30, borderRadius: 5, border: "none", cursor: "pointer",
                                          background: queried ? "rgba(240,173,78,0.2)" : "var(--surface2)",
                                          color: queried ? "#f0ad4e" : "var(--muted)", fontSize: 11, fontWeight: queried ? 700 : 400 }}>
                                        {queried ? "⚠ Clear" : "+ Flag"}
                                      </button>
                                    </div>
                                  </React.Fragment>}
                                  {isDns && <div style={{ fontSize: 11, color: "var(--muted)", paddingBottom: 6, fontStyle: "italic" }}>Did Not Start</div>}
                                </div>

                                {open && !isDns && (
                                  <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 8,
                                    borderTop: "1px dashed var(--border)", flexWrap: "wrap" }}>
                                    <SF gid={g.id} app={app} sub="tf"   label="Time fault" warn max={1} />
                                    <SF gid={g.id} app={app} sub="oob"  label="OOB"        warn max={1} />
                                    <SF gid={g.id} app={app} sub="fall" label="Fall"        warn max={1} />
                                    <SF gid={g.id} app={app} sub="nd"   label="Neutral ded" warn max={1} />
                                    <SF gid={g.id} app={app} sub={null} label="Total pen" readOnly warn
                                      value={penalties > 0 ? penalties : null} />
                                  </div>
                                )}
                                {queried && note && (
                                  <div style={{ marginTop: 6, fontSize: 11, color: "#f0ad4e", borderTop: "1px dashed rgba(240,173,78,0.3)", paddingTop: 6 }}>
                                    ⚠ Query: {note}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── Simple mode ── */
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Gymnast</th>
                        {compData.apparatus.map(a => <th key={a}>{a}</th>)}
                        <th>Total</th><th>Query</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glist.map(g => {
                        const gymTotal = getGymnastTotal(g.id);
                        const isDns = !!g.dns;
                        const hasQuery = compData.apparatus.some(a => isQueried(g.id, a));
                        return (
                          <tr key={g.id} style={{ opacity: isDns ? 0.45 : 1 }}>
                            <td style={{ color: "var(--muted)" }}>{g.number}</td>
                            <td>
                              <strong style={{ textDecoration: isDns ? "line-through" : "none" }}>{g.name}</strong>
                              <br /><span style={{ color: "var(--muted)", fontSize: 11 }}>{g.club}</span>
                              {isDns && <span style={{ display: "block", fontSize: 9, color: "var(--danger)", fontWeight: 700, letterSpacing: 0.5 }}>DNS</span>}
                            </td>
                            {compData.apparatus.map(a => (
                              <td key={a}>
                                {isDns ? <span style={{ color: "var(--muted)" }}>—</span> : (
                                  <input
                                    key={`${g.id}_${a}_${scores[baseKey(g.id, a)] ?? ""}`}
                                    className="score-input"
                                    type="number" step="0.01" min="0"
                                    placeholder="—"
                                    defaultValue={scores[baseKey(g.id, a)] ?? ""}
                                    onBlur={e => commitField(g.id, a, null, e.target.value)}
                                  />
                                )}
                              </td>
                            ))}
                            <td>
                              <strong style={{ color: "var(--accent)" }}>
                                {gymTotal > 0 ? gymTotal.toFixed(2) : "—"}
                              </strong>
                            </td>
                            <td>
                              {!isDns && (
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    fontSize: 10, padding: "3px 8px",
                                    background: hasQuery ? "rgba(240,173,78,0.15)" : "var(--surface2)",
                                    color: hasQuery ? "#f0ad4e" : "var(--muted)",
                                    border: `1px solid ${hasQuery ? "rgba(240,173,78,0.4)" : "var(--border)"}`,
                                    borderRadius: 4, cursor: "pointer"
                                  }}
                                  onClick={() => {
                                    const firstApp = compData.apparatus[0];
                                    if (hasQuery) resolveQuery(g.id, firstApp);
                                    else openQueryModal(g.id, firstApp);
                                  }}>
                                  {hasQuery ? "⚠ Clear" : "+ Flag"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Query Modal */}
      {queryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 420 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Flag Coach Query</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              {gymnasts.find(g => g.id === queryModal.gid)?.name} · {queryModal.app}
            </div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Note (optional)</label>
            <input
              className="input"
              placeholder="e.g. Coach disputes E score"
              value={queryNote}
              onChange={e => setQueryNote(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveQuery()}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setQueryModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveQuery}>Flag Query</button>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
              Flagged scores show as "Under Review" on the coach live view until cleared.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PHASE 2 STEP 2 — Results
// ============================================================
function Phase2_Step2({ compData, gymnasts, scores, onComplete }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("apparatus");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const roundGymnasts = gymnasts.filter(g => g.round === activeRound);

  const getScore = (gid, apparatus) => {
    const v = parseFloat(scores[gymnast_key(activeRound, gid, apparatus)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (gid) => compData.apparatus.reduce((s, a) => s + getScore(gid, a), 0);

  // Build ranking groups respecting level rankBy config
  const buildRankGroups = () => {
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "Unknown age") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));
  };

  const rankGroups = buildRankGroups();

  const rankBadge = (rank) => {
    if (rank === null) return <span className="badge" style={{ background: "rgba(107,107,133,0.15)", color: "var(--muted)" }}>DNS</span>;
    if (rank === 1) return <span className="badge badge-gold">🥇 1st</span>;
    if (rank === 2) return <span className="badge badge-silver">🥈 2nd</span>;
    if (rank === 3) return <span className="badge badge-bronze">🥉 3rd</span>;
    return <span className="badge badge-rank">{rank}th</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Competition <span>Results</span></div>
        <div className="page-sub">Dense ranking · ties share rank · grouped by level</div>
      </div>

      <div className="tabs">
        {compData.rounds.map(r => (
          <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
            onClick={() => setActiveRound(r.id)}>{r.name}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        <button className={`btn ${view === "apparatus" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setView("apparatus")}>Per Apparatus</button>
        <button className={`btn ${view === "overall" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setView("overall")}>Overall</button>
      </div>

      {/* PER APPARATUS VIEW
          Structure: Level (& Age) card → Apparatus sub-sections → ranked table */}
      {view === "apparatus" && (
        <div>
          {rankGroups.map(({ key, levelName, ageLabel, gymnasts: glist }) => {
            const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
            return (
              <div key={key} className="results-level-card">
                <div className="results-level-header">
                  {levelName}{ageLabel ? <span> — {ageLabel}</span> : null}
                </div>
                {compData.apparatus.map(apparatus => {
                  const withScores = glist.map(g => ({ ...g, score: getScore(g.id, apparatus) }));
                  const ranked = denseRank(withScores.filter(g => g.score > 0 && !g.dns), "score");
                  const dns = withScores.filter(g => g.score === 0 || g.dns);
                  return (
                    <div key={apparatus} style={{ marginBottom: 24 }}>
                      <div className="sub-group-label">{APPARATUS_ICONS[apparatus] || "🏅"} {apparatus}</div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th><th>Score</th></tr>
                          </thead>
                          <tbody>
                            {ranked.map(g => (
                              <tr key={g.id}>
                                <td>{rankBadge(g.rank)}</td>
                                <td style={{ color: "var(--muted)" }}>{g.number}</td>
                                <td>{g.name}</td>
                                <td style={{ color: "var(--muted)" }}>{g.club}</td>
                                <td><strong>{g.score.toFixed(2)}</strong></td>
                              </tr>
                            ))}
                            {dns.map(g => (
                              <tr key={g.id} style={{ opacity: 0.45 }}>
                                <td>{rankBadge(null)}</td>
                                <td style={{ color: "var(--muted)" }}>{g.number}</td>
                                <td>{g.name}</td>
                                <td style={{ color: "var(--muted)" }}>{g.club}</td>
                                <td style={{ color: "var(--muted)" }}>—</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {rankGroups.length === 0 && <div className="empty">No results to display yet</div>}
        </div>
      )}

      {/* OVERALL VIEW
          Structure: Level (& Age) card → cumulative ranked table */}
      {view === "overall" && (
        <div>
          {rankGroups.map(({ key, levelName, ageLabel, gymnasts: glist }) => {
            const withTotals = glist.map(g => ({ ...g, total: getTotal(g.id) }));
            const ranked = denseRank(withTotals.filter(g => g.total > 0 && !g.dns), "total");
            const dns = withTotals.filter(g => g.total === 0 || g.dns);
            return (
              <div key={key} className="results-level-card">
                <div className="results-level-header">
                  {levelName}{ageLabel ? <span> — {ageLabel}</span> : null}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th>
                        {compData.apparatus.map(a => <th key={a}>{a}</th>)}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map(g => (
                        <tr key={g.id}>
                          <td>{rankBadge(g.rank)}</td>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td>{g.name}</td>
                          <td style={{ color: "var(--muted)" }}>{g.club}</td>
                          {compData.apparatus.map(a => (
                            <td key={a} style={{ color: "var(--muted)" }}>
                              {getScore(g.id, a) > 0 ? getScore(g.id, a).toFixed(2) : "—"}
                            </td>
                          ))}
                          <td><strong style={{ color: "var(--accent)" }}>{g.total.toFixed(2)}</strong></td>
                        </tr>
                      ))}
                      {dns.map(g => (
                        <tr key={g.id} style={{ opacity: 0.45 }}>
                          <td>{rankBadge(null)}</td>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td>{g.name}</td>
                          <td style={{ color: "var(--muted)" }}>{g.club}</td>
                          {compData.apparatus.map(a => <td key={a} style={{ color: "var(--muted)" }}>—</td>)}
                          <td style={{ color: "var(--muted)" }}>—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {rankGroups.length === 0 && <div className="empty">No results to display yet</div>}
        </div>
      )}

      {/* ── COMPLETE COMPETITION CTA ─────────────────────────── */}
      {onComplete && (
        <div style={{ marginTop: 40, padding: "28px 32px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Finished scoring?</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Mark this competition as complete. Results will be finalised and the event moved to your completed list.
            </div>
          </div>
          <button className="btn btn-primary"
            style={{ fontSize: 15, padding: "12px 32px", letterSpacing: 0.5, background: "#15803d", flexShrink: 0 }}
            onClick={() => setShowCompleteConfirm(true)}>
            Complete Competition
          </button>
        </div>
      )}

      {showCompleteConfirm && (
        <ConfirmModal
          message="Are you sure you want to complete this competition? The event status will change to Completed."
          confirmLabel="Complete"
          onConfirm={() => { setShowCompleteConfirm(false); onComplete(); }}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

// ============================================================
// AUTH SCREEN — Google OAuth + Magic Link (replaces LoginScreen + RegisterScreen)
// ============================================================
function AuthScreen({ onResume }) {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showJudgePin, setShowJudgePin] = useState(false);

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    const { error: err } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) { setError(err.message); setLoading(false); }
  };

  const handleMagicLink = async () => {
    setError("");
    const trimmed = email.trim();
    if (!trimmed) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Please enter a valid email address."); return; }
    setLoading(true);
    const { error: err } = await supabaseAuth.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  const googleIconUrl = "https://www.figma.com/api/mcp/asset/ecdc4d55-f8d8-4a06-ae78-791219f31494";
  const heroImageUrl = "https://www.figma.com/api/mcp/asset/aaec2cb4-9483-4034-9b9a-89218ba8373d";
  const heroImage2Url = "https://www.figma.com/api/mcp/asset/197c6562-3f74-4df6-b7fa-f12e207e12c0";

  /* ── Shared form elements ── */
  const googleBtn = (
    <button
      onClick={handleGoogle}
      disabled={loading}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        gap: 10, padding: "12px 21px", border: "1px solid var(--brand-01)", borderRadius: 72,
        background: "#fff", cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16,
        color: "#050505", letterSpacing: "0.3px",
      }}
    >
      <img src={googleIconUrl} alt="" width={16} height={16} style={{ flexShrink: 0 }} />
      Continue with Google
    </button>
  );

  const divider = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>or sign in with email</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  const emailInput = (
    <input
      type="email"
      placeholder="your@email.com"
      value={email}
      onChange={e => setEmail(e.target.value)}
      onKeyDown={e => e.key === "Enter" && handleMagicLink()}
      autoFocus
      style={{
        width: "100%", boxSizing: "border-box", background: "#fff",
        border: "1px solid var(--border)", borderRadius: 72, padding: "12px 24px",
        fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-primary)",
        outline: "none",
      }}
    />
  );

  const sendBtn = (
    <button
      onClick={handleMagicLink}
      disabled={loading}
      style={{
        width: "100%", background: "var(--brand-01)", border: "none", borderRadius: 72,
        padding: "12px 16px", fontFamily: "var(--font-display)", fontWeight: 400,
        fontSize: 16, color: "var(--text-alternate)", textAlign: "center",
        letterSpacing: "0.3px", cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Sending…" : "Send sign-in link →"}
    </button>
  );

  const judgeCard = (
    <div
      onClick={() => setShowJudgePin(true)}
      style={{
        width: "100%", border: "1px solid var(--border)", borderRadius: 16,
        padding: "12px 24px", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", boxSizing: "border-box", cursor: "pointer",
      }}
    >
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 14, color: "var(--brand-02)",
        textAlign: "center", letterSpacing: "0.3px",
      }}>
        Enter as Scorer or Judge — PIN access →
      </div>
    </div>
  );

  const footer = (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
      All Rights Reserved 2026 GymComp©
    </div>
  );

  /* ── "Check your inbox" state ── */
  if (sent) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--background-light)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Saans', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📬</div>
          <div style={{ fontFamily: "'Saans', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--text-primary)", marginBottom: 12 }}>
            Check your inbox
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>
            We sent a sign-in link to{" "}
            <strong style={{ color: "var(--text-primary)" }}>{email}</strong>.<br />
            Click it to continue — no password needed.
          </div>
          <button
            onClick={() => { setSent(false); setLoading(false); }}
            style={{ fontFamily: "'Saans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--brand-01)", background: "var(--background-neutral)", border: "none", padding: "10px 20px", borderRadius: 72, cursor: "pointer", letterSpacing: "0.3px" }}
          >
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

  /* ── DESKTOP (≥768px): two-column split ── */
  /* ── MOBILE (<768px): single column ── */
  return (
    <>
      <style>{`
        .auth-wrapper { position:fixed;inset:0;display:flex;font-family:var(--font-display);background:var(--background-light);--border:#ddd;--background-neutral:#efefef; }
        .auth-left { width:550px;flex-shrink:0;padding:48px;display:flex;flex-direction:column;justify-content:space-between;background:var(--background-light);box-sizing:border-box; }
        .auth-left-logo img { height:25px; }
        .auth-left-middle { display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:363px;padding:0 40px; }
        .auth-left-form { width:100%;display:flex;flex-direction:column;gap:16px; }
        .auth-right { flex:1;padding:24px;min-width:0;height:100%;box-sizing:border-box; }
        .auth-right-inner { background:#000dff;border-radius:32px;overflow:hidden;height:100%;width:100%;position:relative; }
        .auth-right-inner .auth-hero-bg { position:absolute;width:200%;height:200%;top:-80%;left:-25%;max-width:none;pointer-events:none;object-fit:cover; }
        .auth-right-inner .auth-hero-laptop { position:absolute;left:0;top:-2%;width:100%;height:102%;max-width:none;pointer-events:none;object-fit:cover; }

        @media(max-width:767px) {
          .auth-wrapper { flex-direction:column; }
          .auth-left { width:100%;flex-shrink:initial;padding:40px 16px;align-items:center;gap:64px;justify-content:flex-start; }
          .auth-left-middle { height:auto;gap:32px;padding:0; }
          .auth-left-form { width:100%;max-width:396px; }
          .auth-right { display:none; }
        }
      `}</style>
      <div className="auth-wrapper">
        {/* ── Left Panel ── */}
        <div className="auth-left">
          <div className="auth-left-logo">
            <img src={GymCompLogo} alt="GymComp" />
          </div>

          <div className="auth-left-middle">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, color: "var(--text-primary)", lineHeight: 1.1, textAlign: "center", width: "100%" }}>
                Welcome to GymComp
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-secondary)", textAlign: "center", lineHeight: "18px", maxWidth: 200 }}>
                Sign in or sign up for free<br />with your email
              </div>
            </div>
            <div className="auth-left-form">
              {googleBtn}
              {divider}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {emailInput}
                {error && <div style={{ fontSize: 13, color: "#e53e3e", paddingLeft: 24 }}>{error}</div>}
                {sendBtn}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.4, maxWidth: 246, alignSelf: "center" }}>
                By signing up to a free account you agree to the GymComp Privacy Policy, Terms and Cookie Notice.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" }}>
            {judgeCard}
            {footer}
          </div>
        </div>

        {/* ── Right Panel (hero image) ── */}
        <div className="auth-right">
          <div className="auth-right-inner">
            <img className="auth-hero-bg" src={heroImageUrl} alt="" />
            <img className="auth-hero-laptop" src={heroImage2Url} alt="" />
          </div>
        </div>
      </div>

      {showJudgePin && (
        <JudgePinModal
          onResume={onResume}
          onClose={() => setShowJudgePin(false)}
        />
      )}
    </>
  );
}

/* ── OLD LoginScreen + RegisterScreen — replaced by AuthScreen + Supabase Auth ──
   Kept for rollback reference only.
function LoginScreen({ onLogin, onGoRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = () => {
    setError("");
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setTimeout(() => {
      const { account, error: err } = auth.login(email, password);
      setLoading(false);
      if (err) { setError(err); return; }
      auth.setSession(account);
      onLogin(account);
    }, 200);
  };

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, minHeight: "calc(100vh - 65px)" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, letterSpacing: 3, lineHeight: 1, color: "var(--accent)", marginBottom: 8 }}>GYMCOMP</div>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Sign in to manage your competitions</div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>Sign In</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
            </div>

            {error && <div className="error-box">{error}</div>}

            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
              onClick={handle} disabled={loading}>
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, color: "var(--muted)", fontSize: 13 }}>
          No account?{" "}
          <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 700 }} onClick={onGoRegister}>
            Create one free
          </span>
        </div>

        <div style={{ textAlign: "center", marginTop: 32, padding: "16px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", marginBottom: 8 }}>Judge / Scorer access?</div>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 12 }}>Judges don't need an account — use your competition PIN to enter scores directly.</div>
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.hash = "judge"}>
            Enter as Judge →
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterScreen({ onRegister, onGoLogin }) {
  const [name, setName] = useState("");
  const [clubName, setClubName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = () => {
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    setTimeout(() => {
      const { account, error: err } = auth.register(email, password, name.trim(), clubName.trim());
      setLoading(false);
      if (err) { setError(err); return; }
      auth.setSession(account);
      onRegister(account);
    }, 200);
  };

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, minHeight: "calc(100vh - 65px)" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, letterSpacing: 3, lineHeight: 1, color: "var(--accent)", marginBottom: 8 }}>GYMCOMP</div>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Create your organiser account</div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>Create Account</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Your Name *</label>
                <input className="input" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Club / Organisation</label>
                <input className="input" placeholder="Springers GC" value={clubName} onChange={e => setClubName(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Email *</label>
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Password *</label>
                <input className="input" type="password" placeholder="Min 6 chars" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Confirm *</label>
                <input className="input" type="password" placeholder="Repeat password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="warn-box" style={{ fontSize: 11 }}>
              ⚠️ This is a prototype — account data is stored locally in your browser. Don't use a sensitive password.
            </div>

            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
              onClick={handle} disabled={loading}>
              {loading ? "Creating account…" : "Create Account →"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, color: "var(--muted)", fontSize: 13 }}>
          Already have an account?{" "}
          <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 700 }} onClick={onGoLogin}>
            Sign in
          </span>
        </div>
      </div>
    </div>
  );
}
── END OLD LoginScreen + RegisterScreen ──────────────────────────────────── */

// ============================================================
// ORGANISER DASHBOARD — list of events for logged-in account
// ============================================================
function OrganizerDashboard({ account, onNew, onOpen, onView, onEdit, onDuplicate, statusFilter, setStatusFilter, onFilterCountsChange }) {
  const [myEvents, setMyEvents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  // Guard: track recently-patched comp IDs so syncFromSupabase won't overwrite them before the PATCH lands
  const recentPatches = useRef({});

  const pushStatusToSupabase = async (cid, newStatus) => {
    recentPatches.current[cid] = { status: newStatus, ts: Date.now() };
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) { console.error("[pushStatusToSupabase] no session"); return; }
      const { error } = await supabase.patch("competitions", cid, { status: newStatus }, session.access_token);
      if (error) console.error("[pushStatusToSupabase] failed:", error);
    } catch (e) { console.error("[pushStatusToSupabase] error:", e); }
  };

  const reload = () => {
    const all = events.getForAccount(account.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    setMyEvents(all);
    if (onFilterCountsChange) {
      onFilterCountsChange({
        draft: all.filter(e => e.status === "draft").length,
        active: all.filter(e => e.status === "active").length,
        live: all.filter(e => e.status === "live").length,
        completed: all.filter(e => e.status === "completed").length,
        archived: all.filter(e => e.status === "archived").length,
      });
    }
  };

  const syncFromSupabase = useCallback(() => {
    reload();
    // Clean up expired patch guards (>10s old)
    const now = Date.now();
    Object.keys(recentPatches.current).forEach(k => { if (now - recentPatches.current[k].ts > 10000) delete recentPatches.current[k]; });
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.fetchListForUser(session.access_token, session.user.id).then(({ data: supabaseComps, error }) => {
        if (error) return;
        console.log("[syncFromSupabase] raw rows:", (supabaseComps || []).map(c => ({ id: c.id, status: c.status, keys: Object.keys(c) })));
        const all = events.getAll();
        let changed = false;
        const ownedCompIds = new Set((supabaseComps || []).map(c => c.id));
        const toRemove = all.filter(e => e.accountId === account.id && e.compId && !ownedCompIds.has(e.compId));
        if (toRemove.length > 0) {
          toRemove.forEach(e => { const idx = all.indexOf(e); if (idx !== -1) all.splice(idx, 1); });
          changed = true;
        }
        (supabaseComps || []).forEach(comp => {
          const existing = all.find(e => e.compId === comp.id && e.accountId === account.id);
          const snapshot = comp.data
            ? { compData: comp.data.compData, gymnasts: comp.data.gymnasts, scores: comp.data.scores }
            : undefined;
          const supaStatus = comp.status || "active";
          if (!existing) {
            console.log("[syncFromSupabase] NEW local event:", comp.id, "supabase status:", comp.status, "→ local status:", supaStatus);
            all.push({ id: generateId(), accountId: account.id, compId: comp.id, status: supaStatus, createdAt: comp.created_at, updatedAt: comp.created_at, snapshot });
            changed = true;
          } else {
            // If this comp was recently patched locally, trust local status over stale Supabase data
            const patch = recentPatches.current[comp.id];
            const useLocalStatus = patch && (Date.now() - patch.ts < 5000);
            const effectiveStatus = useLocalStatus ? patch.status : supaStatus;
            if (useLocalStatus) {
              console.log("[syncFromSupabase] SKIP status overwrite for", comp.id, "— recent patch:", patch.status, "(supabase has:", comp.status, ")");
            }
            const needsUpdate = snapshot || existing.status !== effectiveStatus;
            if (needsUpdate) {
              console.log("[syncFromSupabase] UPDATE:", comp.id, "status:", existing.status, "→", effectiveStatus);
              const idx = all.indexOf(existing);
              all[idx] = { ...existing, ...(snapshot ? { snapshot } : {}), status: effectiveStatus };
              changed = true;
            }
          }
        });
        if (changed) { events.save(all); reload(); }
      });
    });
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync on mount
  useEffect(() => { syncFromSupabase(); }, [syncFromSupabase]);

  // Re-sync when tab regains focus (cross-device changes)
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "visible") syncFromSupabase(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncFromSupabase]);

  const handleStatusChange = (eventId, newStatus) => {
    events.update(eventId, { status: newStatus });
    const ev = events.getAll().find(e => e.id === eventId);
    if (ev?.compId) pushStatusToSupabase(ev.compId, newStatus);
    reload();
  };

  const handleDelete = (ev) => {
    if (ev.status !== "archived") {
      setArchiveConfirm(ev);
      return;
    }
    setDeleteConfirm(ev);
  };

  const confirmDelete = async () => {
    const ev = deleteConfirm;
    setDeleteConfirm(null);
    if (ev.compId) {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (session) {
        const { error } = await supabase.deleteCompetition(ev.compId, session.access_token);
        if (error) console.error("[confirmDelete] Supabase DELETE failed:", error);
      }
    }
    events.remove(ev.id);
    reload();
  };

  const getPublicLink = (ev) => `${window.location.origin}/results.html?comp=${ev.compId}`;

  const copyLink = async (ev) => {
    const link = getPublicLink(ev);
    try { await navigator.clipboard.writeText(link); } catch {}
    setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: true } : e));
    setTimeout(() => setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: false } : e)), 1800);
  };

  const filtered = statusFilter === "all"
    ? myEvents.filter(e => e.status !== "archived")
    : myEvents.filter(e => e.status === statusFilter);
  const currentEvents = filtered.filter(e => e.status === "draft" || e.status === "active" || e.status === "live");
  const completedEvents = filtered.filter(e => e.status === "completed");

  const firstName = (account.name || account.email?.split("@")[0] || "").split(" ")[0];

  // Left border + dot colours per status
  const statusConfig = {
    draft:     { border: "#f59e0b", dot: "#f59e0b" },
    active:    { border: "var(--brand-01)", dot: "var(--brand-01)" },
    live:      { border: "#22c55e", dot: "#22c55e" },
    completed: { border: "#15803d", dot: "#15803d" },
    archived:  { border: "#acacac", dot: "#acacac" },
  };

  const sidebarFilters = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "live", label: "Live" },
    { value: "completed", label: "Complete" },
    { value: "archived", label: "Archived" },
  ];

  const countFor = (status) => myEvents.filter(e => e.status === status).length;

  const renderCard = (ev) => {
    const cd = ev.snapshot?.compData || {};
    const sc = statusConfig[ev.status] || statusConfig.draft;
    const gymnasts = ev.snapshot?.gymnasts || [];
    const clubs = cd.clubs || [];
    const isCompleted = ev.status === "completed" || ev.status === "archived";

    const isArchived = ev.status === "archived";
    const isDraft = ev.status === "draft";

    return (
      <div key={ev.id} className="od-card-wrap">
        <div className={`od-card${isDraft ? " od-card-draft" : ""}`} style={{ borderLeftColor: sc.border, position: "relative" }}>
          {/* Delete button — top right (hidden for archived since CTA handles it) */}
          {!isArchived && (
            <button onClick={() => handleDelete(ev)}
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-display)", padding: "4px 8px" }}>
              Archive
            </button>
          )}
          <div className="od-card-top">
            <div className="od-card-status-pill">
              <span className="od-card-status-dot" style={{ background: sc.dot }} />
              <span style={{ fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {statusMeta(ev.status).label}
              </span>
            </div>
            {isDraft && (
              <div className="od-card-draft-banner">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 10.5h.01"/></svg>
                Setup incomplete — finish setting up your competition to get started
              </div>
            )}
            <div style={isDraft ? { opacity: 0.45 } : undefined}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="od-card-title">{cd.name || "Untitled Competition"}</div>
                <div className="od-card-meta">
                  {cd.date && (
                    <div className="od-card-meta-row">
                      <span className="od-card-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>
                      </span>
                      {new Date(cd.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                  {cd.location && (
                    <div className="od-card-meta-row">
                      <span className="od-card-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="7" r="2"/><path d="M8 15S3 10 3 7a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
                      </span>
                      {cd.location}
                    </div>
                  )}
                  {!cd.date && !cd.location && isDraft && (
                    <div className="od-card-meta-row" style={{ fontStyle: "italic" }}>No details added yet</div>
                  )}
                </div>
              </div>
              <div className="od-card-divider" style={{ marginTop: 24 }} />
              <div style={{ marginTop: 24 }}>
                <div className="od-card-clubs-title">Clubs Details</div>
                <div className="od-card-clubs-row">
                  <div className="od-card-clubs-item">
                    <span className="od-card-clubs-badge" style={clubs.length === 0 ? { background: "#efefef", color: "var(--text-tertiary)" } : undefined}>{clubs.length}</span>
                    Clubs Registered
                  </div>
                  <div className="od-card-clubs-item">
                    <span className="od-card-clubs-badge" style={gymnasts.length === 0 ? { background: "#efefef", color: "var(--text-tertiary)" } : undefined}>{gymnasts.length}</span>
                    Gymnasts Registered
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="od-card-actions">
            {isDraft ? (
              <button className="od-card-btn-open" onClick={() => onOpen(ev)}
                style={{ background: "#f59e0b" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                Finish Setup
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4"/></svg>
              </button>
            ) : (
              <button className={`od-card-btn-open`} onClick={() => isArchived ? handleDelete(ev) : onOpen(ev)}
                style={isArchived ? { background: "#e53e3e" } : ev.status === "live" ? { background: "#22c55e" } : undefined}>
                {ev.status === "live" && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>}
                {{ active: "Open Comp", live: "Resume Comp", completed: "View Results", archived: "Delete Event" }[ev.status] || "Open Comp"}
                {ev.status !== "live" && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(-90deg)" }}><path d="M4 6l4 4 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {ev.status === "live" && (
                <button className="od-card-btn-open outlined" onClick={() => onView(ev)}
                  style={{ background: "none", border: "1.5px solid var(--border)", color: "var(--text-primary)" }}>
                  View Comp
                </button>
              )}
              {ev.status === "active" && (
                <button className="od-card-btn-icon" onClick={() => onEdit(ev)} title="Edit Comp">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                </button>
              )}
              <button className="od-card-btn-icon" onClick={() => onDuplicate(ev)} title="Duplicate">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V3.5A.5.5 0 013.5 3H11"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .od-main{flex:1;display:flex;flex-direction:column;gap:22px;padding:40px;overflow-y:auto;min-width:0;}
        .od-header{display:flex;flex-direction:column;gap:8px;max-width:434px;}
        .od-greeting{font-size:38px;font-weight:600;color:var(--text-primary);line-height:1.2;}
        .od-subtitle{font-size:14px;color:var(--text-tertiary);line-height:1.4;}
        .od-content{display:flex;flex-direction:column;gap:30px;flex:1;min-height:0;}
        .od-filter-pill{display:inline-flex;align-items:center;justify-content:center;padding:4px 16px;border-radius:48px;background:var(--background-light);font-size:14px;color:var(--text-primary);font-family:var(--font-display);border:none;cursor:pointer;align-self:flex-start;}
        .od-cards-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;max-width:1200px;}
        .od-card-wrap{display:flex;}
        .od-card{flex:1;background:var(--background-light);border-radius:8px;overflow:hidden;padding:16px 18px;display:flex;flex-direction:column;justify-content:space-between;border-left:6px solid transparent;}
        .od-card-top{display:flex;flex-direction:column;gap:24px;}
        .od-card-status-pill{display:inline-flex;align-items:center;gap:8px;padding:4px 16px;border-radius:48px;background:var(--background-neutral);font-size:12px;color:var(--text-primary);font-family:var(--font-display);align-self:flex-start;}
        .od-card-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .od-card-title{font-size:20px;font-weight:600;color:var(--text-primary);line-height:1.2;max-height:48px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-overflow:ellipsis;}
        .od-card-meta{display:flex;flex-direction:column;gap:8px;}
        .od-card-meta-row{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary);font-family:var(--font-display);}
        .od-card-meta-icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);flex-shrink:0;}
        .od-card-divider{height:1px;background:#f5f5f5;}
        .od-card-clubs-title{font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.1;margin-bottom:8px;}
        .od-card-clubs-row{display:flex;flex-wrap:wrap;gap:16px;align-items:center;}
        .od-card-clubs-item{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary);font-family:var(--font-display);}
        .od-card-clubs-badge{width:16px;height:16px;border-radius:36px;background:var(--brand-03);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:600;color:var(--text-alternate);flex-shrink:0;}
        .od-card-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:40px;}
        .od-card-btn-open{display:inline-flex;align-items:center;gap:6px;height:30px;padding:5px 11px;border-radius:80px;background:var(--brand-01);border:none;cursor:pointer;font-family:var(--font-display);font-size:12px;font-weight:600;color:white;letter-spacing:0.3px;}
        .od-card-btn-open:hover{opacity:0.9;}
        .od-card-btn-open.outlined{background:none;border:1.5px solid var(--brand-01);color:var(--brand-01);}
        .od-card-btn-open.outlined:hover{background:rgba(0,13,255,0.06);}
        .od-card-btn-icon{width:30px;height:30px;border-radius:80px;border:none;background:#efefef;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex-shrink:0;}
        .od-card-btn-icon:hover{background:var(--background-neutral);}
        .od-card-draft{background:var(--background-light);}
        .od-card-draft-banner{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);font-size:12px;color:#92600a;font-family:var(--font-display);line-height:1.4;}
        .od-card-btn-icon.danger{border:1px solid red;background:none;}
        .od-card-btn-icon.danger:hover{background:#fee;}
        .od-empty-box{flex:1;min-height:322px;border:1px dashed #080808;background:#f2f2f2;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:16px 18px;}
        .od-empty-box-btn{padding:16px 32px;border-radius:56px;background:var(--brand-01);border:none;cursor:pointer;font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--text-alternate);}
        .od-empty-box-btn:hover{opacity:0.92;}
        .od-section-title{font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;}
        .od-empty-msg{text-align:center;padding:40px 24px;color:var(--text-tertiary);font-size:14px;width:100%;}
        .od-active-filter{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:48px;background:var(--background-light);color:var(--text-primary);font-family:var(--font-display);font-size:13px;font-weight:600;border:1px solid var(--border);cursor:pointer;align-self:flex-start;margin-bottom:-14px;}
        .od-active-filter:hover{background:#f5f5f5;}
        .od-active-filter-x{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.08);font-size:11px;line-height:1;}
        @media(max-width:768px){.od-active-filter{display:none;}}
        .od-mobile-filters{display:none;}
        @media(max-width:768px){
          .od-main{padding:24px 16px;}
          .od-cards-row{flex-direction:column;}
          .od-card-wrap{min-width:0;}
          .od-mobile-filters{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
          .od-mobile-filters::-webkit-scrollbar{display:none;}
          .od-mobile-filter{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:48px;border:1.5px solid var(--border);background:var(--background-light);font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-tertiary);cursor:pointer;white-space:nowrap;}
          .od-mobile-filter.active{background:var(--brand-01);color:white;border-color:var(--brand-01);}
          .od-mobile-filter .od-mf-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
          .od-mobile-filter .od-mf-count{font-size:11px;opacity:0.7;}
        }
      `}</style>
      <div className="od-main">
        <div className="od-header">
          <div className="od-greeting">{`Hello ${firstName}  👋`}</div>
          <div className="od-subtitle">
            This is your Organiser Vault - within here are all of your competitions - you can filter these on your toolbar into the different status of competitions you currently have.
          </div>
        </div>

        {/* Mobile filter pills — visible only ≤768px */}
        <div className="od-mobile-filters">
          {sidebarFilters.map(f => {
            const count = myEvents.filter(e => e.status === f.value).length;
            const isActive = statusFilter === f.value;
            const sc = statusConfig[f.value] || {};
            return (
              <button key={f.value} className={`od-mobile-filter${isActive ? " active" : ""}`}
                onClick={() => setStatusFilter(prev => prev === f.value ? "all" : f.value)}>
                <span className="od-mf-dot" style={{ background: isActive ? "white" : sc.dot }} />
                {f.label}
                {count > 0 && <span className="od-mf-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Cards area */}
        <div className="od-content">
          {/* Desktop active filter pill — shows current filter with dismiss */}
          {statusFilter !== "all" && (
            <button className="od-active-filter" onClick={() => setStatusFilter("all")}>
              {sidebarFilters.find(f => f.value === statusFilter)?.label || statusFilter}
              <span className="od-active-filter-x">✕</span>
            </button>
          )}

          {/* Empty state — no events at all */}
          {myEvents.length === 0 ? (
            <div className="od-empty-box">
              <button className="od-empty-box-btn" onClick={onNew}>+ New Competition</button>
            </div>
          ) : statusFilter !== "all" && filtered.length === 0 ? (
            <div className="od-empty-msg">No {sidebarFilters.find(f => f.value === statusFilter)?.label?.toLowerCase() || statusFilter} competitions</div>
          ) : statusFilter !== "all" ? (
            /* Filtered view — flat list */
            <div className="od-cards-row">
              {filtered.map(ev => renderCard(ev))}
            </div>
          ) : (
            /* Default view — sectioned */
            <>
              {currentEvents.length > 0 ? (
                <div>
                  <div className="od-section-title">Current Events</div>
                  <div className="od-cards-row">
                    {currentEvents.map(ev => renderCard(ev))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="od-section-title">Current Events</div>
                  <div className="od-empty-box">
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                      <div style={{ fontSize: 14, color: "var(--text-tertiary)", fontFamily: "var(--font-display)", textAlign: "center", lineHeight: 1.5 }}>
                        No current competitions — create one to get started
                      </div>
                      <button className="od-empty-box-btn" onClick={onNew}>+ New Competition</button>
                    </div>
                  </div>
                </div>
              )}
              {completedEvents.length > 0 && (
                <div>
                  <div className="od-section-title">Completed Events</div>
                  <div className="od-cards-row">
                    {completedEvents.map(ev => renderCard(ev))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {archiveConfirm && (
        <ConfirmModal
          message={<>Are you sure you want to archive this event?<br/><span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>By archiving this event you can still access it within your Archive filter on your sidebar.</span></>}
          confirmLabel="Archive"
          isDanger={false}
          onConfirm={() => {
            events.update(archiveConfirm.id, { status: "archived" });
            const ev = events.getAll().find(e => e.id === archiveConfirm.id);
            if (ev?.compId) pushStatusToSupabase(ev.compId, "archived");
            setArchiveConfirm(null); reload();
          }}
          onCancel={() => setArchiveConfirm(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          message={`Permanently delete "${deleteConfirm.snapshot?.compData?.name || "this competition"}"? This cannot be undone.`}
          confirmLabel="Delete permanently"
          isDanger={true}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </>
  );
}

// ============================================================
// ACCOUNT SETTINGS MODAL
// ============================================================
function AccountSettingsModal({ account, profile, onSave, onLogout, onClose }) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [clubName, setClubName] = useState(profile?.club_name || "");
  const [location, setLocation] = useState(profile?.location || "");
  const [saving,  setSaving]   = useState(false);
  const [error,   setError]    = useState("");
  const [success, setSuccess]  = useState("");

  const handleSave = async () => {
    setError(""); setSuccess("");
    if (!fullName.trim()) { setError("Name cannot be empty."); return; }
    setSaving(true);
    const { data: { session } } = await supabaseAuth.auth.getSession();
    const token = session?.access_token ?? SUPABASE_KEY;
    const updated = { id: account.id, full_name: fullName.trim(), club_name: clubName.trim(), location: location.trim() };
    const { error: err } = await supabase.upsertProfile(updated, token);
    setSaving(false);
    if (err) { setError("Couldn't save changes — please try again."); return; }
    setSuccess("Changes saved.");
    onSave({ ...(profile || {}), ...updated });
  };

  return (
    <>
    <style>{`
      .acct-label{font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px;}
      .acct-input{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-light);font-family:var(--font-display);font-size:14px;color:var(--text-primary);outline:none;box-sizing:border-box;transition:border-color 0.15s;}
      .acct-input:focus{border-color:var(--brand-01);}
      .acct-input-disabled{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-neutral);font-family:var(--font-display);font-size:14px;color:var(--text-tertiary);box-sizing:border-box;cursor:default;}
    `}</style>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--background-light)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 440, fontFamily: "var(--font-display)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>Your Account</div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 80, background: "#efefef", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-tertiary)" }}
          >✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label className="acct-label">Email</label>
            <div className="acct-input-disabled">{account.email}</div>
          </div>
          <div>
            <label className="acct-label">Name</label>
            <input className="acct-input" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="acct-label">Club / Organisation</label>
            <input className="acct-input" value={clubName} onChange={e => setClubName(e.target.value)} />
          </div>
          <div>
            <label className="acct-label">Location</label>
            <input className="acct-input" value={location} onChange={e => setLocation(e.target.value)} />
          </div>

          {error && <div style={{ fontSize: 13, color: "#e53e3e", padding: "10px 16px", background: "#fff5f5", borderRadius: 8 }}>{error}</div>}
          {success && <div style={{ fontSize: 13, color: "#22c55e", padding: "10px 16px", background: "#f0fdf4", borderRadius: 8 }}>{success}</div>}

          <button
            onClick={handleSave} disabled={saving}
            style={{
              width: "100%", padding: "14px", borderRadius: 56, background: "var(--brand-01)", border: "none",
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text-alternate)",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

          <div style={{ height: 1, background: "#f5f5f5" }} />

          <button
            onClick={onLogout}
            style={{
              width: "100%", height: 46, borderRadius: 56, border: "1px solid var(--brand-01)", background: "none",
              cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ============================================================
// PROFILE ONBOARDING — shown once on first login
// ============================================================
function ProfileOnboardingScreen({ user, onComplete }) {
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ""
  );
  const [clubName,  setClubName]  = useState("");
  const [location,  setLocation]  = useState("");
  const [role,      setRole]      = useState("");
  const [referral,  setReferral]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const handleSave = async () => {
    setError("");
    if (!fullName.trim()) { setError("Please enter your name."); return; }
    if (!role)            { setError("Please select your role."); return; }
    setSaving(true);
    const { data: { session } } = await supabaseAuth.auth.getSession();
    const token = session?.access_token ?? SUPABASE_KEY;
    const profile = {
      id:        user.id,
      full_name: fullName.trim(),
      club_name: clubName.trim(),
      location:  location.trim(),
      role,
      referral,
    };
    const { error: err } = await supabase.upsertProfile(profile, token);
    setSaving(false);
    if (err) { setError("Couldn't save your profile — please try again."); return; }
    onComplete(profile);
  };

  const lbl = (text) => (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 7 }}>
      {text}
    </label>
  );

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", minHeight: "100vh" }}>
      <div style={{ width: "100%", maxWidth: 500 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, letterSpacing: 3, color: "var(--accent)", lineHeight: 1, marginBottom: 14 }}>
            GYMCOMP
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
            Welcome — let's get you set up
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
            Just a few quick details and you'll be ready to run your first competition.
          </div>
        </div>

        <div className="card" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Name */}
            <div>
              {lbl("Your name *")}
              <input className="input" placeholder="Jane Smith" value={fullName}
                onChange={e => setFullName(e.target.value)} autoFocus />
            </div>

            {/* Club + Location */}
            <div className="grid-2">
              <div>
                {lbl("Club / Organisation")}
                <input className="input" placeholder="Springers GC" value={clubName}
                  onChange={e => setClubName(e.target.value)} />
              </div>
              <div>
                {lbl("Location")}
                <input className="input" placeholder="Manchester" value={location}
                  onChange={e => setLocation(e.target.value)} />
              </div>
            </div>

            {/* Role */}
            <div>
              {lbl("Your role *")}
              <select className="select" value={role} onChange={e => setRole(e.target.value)}>
                <option value="">Select your role…</option>
                <option value="Organiser">Organiser</option>
                <option value="Club Secretary">Club Secretary</option>
                <option value="Coach">Coach</option>
              </select>
            </div>

            {/* Referral */}
            <div>
              {lbl("How did you hear about us?")}
              <select className="select" value={referral} onChange={e => setReferral(e.target.value)}>
                <option value="">Select an option…</option>
                <option value="Google">Google</option>
                <option value="Social Media">Social Media</option>
                <option value="Word of Mouth">Word of Mouth</option>
                <option value="British Gymnastics">British Gymnastics</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 15, marginTop: 4 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Let's go →"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
          Signed in as <strong style={{ color: "var(--text)" }}>{user?.email}</strong>
        </div>
      </div>
    </div>
  );
}

// ── Tiny inline QR code component (uses QuickChart API) ──
function QRDisplay({ url, size = 120, label }) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://quickchart.io/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(url)}&choe=UTF-8`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)" }}>{label}</div>}
      <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}>
        <img src={qrUrl} alt={`QR code for ${label}`} width={size} height={size}
          style={{ display: "block" }}
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
        />
        <div style={{ display: "none", width: size, height: size, alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "#999", textAlign: "center", padding: 8 }}>
          QR unavailable offline
        </div>
      </div>
      <button onClick={copy} className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }}>
        {copied ? "✅ Copied" : "📋 Copy link"}
      </button>
      <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", maxWidth: size, wordBreak: "break-all" }}>
        {url}
      </div>
    </div>
  );
}

// ── Submissions section for the dashboard (inline, not a modal) ──
function SubmissionsDashboardSection({ compId, compData, gymnasts, onAcceptGymnasts }) {
  const [showReview, setShowReview] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showDisabledWarning, setShowDisabledWarning] = useState(false);

  const enabled = !!compData.allowSubmissions;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
  const submitUrl = `${origin}/submit.html?comp=${compId}`;
  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (!enabled) return;
    if (inSandbox) { setPendingCount(2); return; } // demo count in sandbox
    supabase.fetchSubmissions(compId).then(({ data }) => {
      if (data) setPendingCount(data.filter(s => s.status === "pending").length);
    });
  }, [compId, enabled]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(submitUrl); } catch {}
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const refreshCount = () => {
    if (!inSandbox) {
      supabase.fetchSubmissions(compId).then(({ data }) => {
        if (data) setPendingCount(data.filter(s => s.status === "pending").length);
      });
    } else {
      setPendingCount(c => Math.max(0, (c || 1) - 1));
    }
  };

  const handleAccept = (newGymnasts) => {
    onAcceptGymnasts(newGymnasts);
    refreshCount();
  };

  const handleDecline = () => {
    refreshCount();
  };

  const handleDisabledClick = (e) => {
    if (!enabled) {
      e.preventDefault();
      e.stopPropagation();
      setShowDisabledWarning(true);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--muted)", marginBottom: 14, fontFamily: "var(--font-display)" }}>
          Club Submissions
        </div>
        <div
          title={!enabled ? "Enable Club Submissions in Setup to use this feature" : undefined}
          style={{
            background: "var(--background-light)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px 28px",
            position: "relative",
            ...(enabled ? {} : { opacity: 0.45 })
          }}
        >
          {/* Disabled overlay — blocks all inner clicks, triggers warning */}
          {!enabled && (
            <div onClick={handleDisabledClick} style={{
              position: "absolute", inset: 0, borderRadius: 16, cursor: "pointer", zIndex: 2
            }} />
          )}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* QR + link */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 6 }}>Submission Link</div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16, lineHeight: 1.6, fontFamily: "var(--font-display)" }}>
                Share this with club contacts so they can submit their gymnast list before the competition.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, fontSize: 12, color: "var(--text-tertiary)", background: "var(--background-neutral)", borderRadius: 56, padding: "10px 16px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid var(--border)" }}>
                  {submitUrl}
                </div>
                <button onClick={copyLink} style={{
                  flexShrink: 0, padding: "10px 18px", borderRadius: 56, border: "none", cursor: "pointer",
                  background: "var(--brand-01)", color: "var(--text-alternate)",
                  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
                }}>
                  {linkCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>
            {/* QR */}
            <QRDisplay url={submitUrl} size={110} label="Scan to submit" />
          </div>

          {/* Review button with badge */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", fontFamily: "var(--font-display)" }}>
              {!enabled ? "Submissions disabled" : pendingCount === null ? "Loading…" : pendingCount === 0 ? "No pending submissions" : (
                <span style={{ color: "var(--brand-01)", fontWeight: 600 }}>{pendingCount} submission{pendingCount !== 1 ? "s" : ""} awaiting review</span>
              )}
            </div>
            <button onClick={() => setShowReview(true)} style={{
              padding: "10px 20px", borderRadius: 56, border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
              display: "inline-flex", alignItems: "center", gap: 8
            }}>
              Review Submissions
              {enabled && pendingCount > 0 && <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>}
            </button>
          </div>
        </div>

        {/* Disabled warning */}
        {showDisabledWarning && (
          <div style={{
            marginTop: 12, background: "#fef3cd", border: "1px solid #f0d78c", borderRadius: 12, padding: "14px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap"
          }}>
            <div style={{ fontSize: 13, color: "#664d03", fontFamily: "var(--font-display)", lineHeight: 1.5 }}>
              Club Submissions is currently disabled. Enable it in <strong>Setup</strong> to allow clubs to submit gymnast lists.
            </div>
            <button onClick={() => setShowDisabledWarning(false)} style={{
              flexShrink: 0, padding: "6px 14px", borderRadius: 56, border: "1px solid #c9a706", background: "none",
              cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600, color: "#664d03"
            }}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      {showReview && (
        <SubmissionsReviewPanel
          compId={compId}
          compData={compData}
          gymnasts={gymnasts}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onClose={() => setShowReview(false)}
        />
      )}
    </>
  );
}

function CompDashboard({ compData, gymnasts, compId, compPin, onStartComp, onEditSetup, onAcceptSubmissions, onManageGymnasts, onSetPin, eventStatus }) {
  const [showId, setShowId] = useState(false);
  const [submLinkCopied, setSubmLinkCopied] = useState(false);
  const [showSubmReview, setShowSubmReview] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (!compData.allowSubmissions || !compId) return;
    if (inSandbox) { setPendingCount(2); return; }
    supabase.fetchSubmissions(compId).then(({ data }) => {
      if (data) setPendingCount(data.filter(s => s.status === "pending").length);
    });
  }, [compId, compData.allowSubmissions]);

  const refreshSubmCount = () => {
    if (!inSandbox) {
      supabase.fetchSubmissions(compId).then(({ data }) => {
        if (data) setPendingCount(data.filter(s => s.status === "pending").length);
      });
    } else {
      setPendingCount(c => Math.max(0, (c || 1) - 1));
    }
  };

  const copySubmitLink = async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/submit.html?comp=${compId}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    setSubmLinkCopied(true);
    setTimeout(() => setSubmLinkCopied(false), 2500);
  };
  const totalGymnasts = gymnasts.length;
  const clubs = [...new Set(gymnasts.map(g => g.club))].filter(Boolean);
  const hasGymnasts = gymnasts.length > 0;
  const hasApparatus = (compData.apparatus || []).length > 0;
  const colour = compData.brandColour || "#000dff";

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
  const coachUrl = `${origin}/coach.html?comp=${compId}`;
  const parentUrl = `${origin}/results.html?comp=${compId}`;

  const statCard = (label, value, accent) => (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
      padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 36, lineHeight: 1, color: accent || "var(--text)" }}>{value}</div>
    </div>
  );

  const docBtn = (icon, label, available, action, note) => (
    <div style={{
      background: "var(--surface)", border: `1px solid ${available ? "var(--border)" : "var(--border)"}`,
      borderRadius: "var(--radius)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 14,
      opacity: available ? 1 : 0.55
    }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{label}</div>
        {!available && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>{note}</div>}
      </div>
      {available ? (
        <button className="btn btn-primary btn-sm"
          style={{ background: colour, color: "#fff", flexShrink: 0 }}
          onClick={action}>
          ⬇ PDF
        </button>
      ) : (
        <button className="btn btn-secondary btn-sm" disabled style={{ flexShrink: 0 }}>⬇ PDF</button>
      )}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px" }}>
      <div style={{ width: "100%", maxWidth: 860, margin: "0 auto" }}>

        {/* Topbar — styled like setup topbar */}
        <div className="setup-topbar" style={{ marginBottom: 32 }}>
          <div className="setup-topbar-left">
            <div className="setup-topbar-name">{compData.name || "Untitled Competition"}</div>
            {compData.date && <div className="setup-topbar-meta">{new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>}
            {compData.location && <div className="setup-topbar-meta">{compData.location}</div>}
          </div>
          <div className="setup-topbar-right">
            <button onClick={onEditSetup} style={{
              padding: "7px 18px", borderRadius: 56, border: "1.5px solid rgba(255,255,255,0.3)", background: "none",
              cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600, color: "var(--text-alternate)"
            }}>
              Edit Setup
            </button>
          </div>
        </div>

        {/* Title + meta */}
        <div style={{ marginBottom: 32 }}>
          <div className="dash-hero-title" style={{ fontFamily: "var(--font-display)", fontSize: 58, fontWeight: 500, lineHeight: 1, marginBottom: 12 }}>
            {compData.name}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            {compData.date && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>
              {new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>}
            {compData.location && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="7" r="2"/><path d="M8 15S3 10 3 7a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
              {compData.location}
            </span>}
          </div>
        </div>

        {/* ── COMPETITION DETAILS — ROUNDS ─────────────────────────── */}
        {compData.rounds.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              Rounds
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {compData.rounds.map((r, i) => {
                const formatTime = (t) => {
                  if (!t) return "—";
                  const [h, m] = t.split(":");
                  const hour = parseInt(h);
                  return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? "PM" : "AM"}`;
                };
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "14px 18px", fontSize: 14, fontFamily: "var(--font-display)",
                    borderBottom: i < compData.rounds.length - 1 ? "1px solid var(--border)" : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)"
                  }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                      {r.start || r.end ? `${formatTime(r.start)} – ${formatTime(r.end)}` : "No times set"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {statCard("Gymnasts", totalGymnasts, "var(--accent)")}
          {statCard("Clubs", clubs.length)}
          {statCard("Levels", compData.levels.length)}
          {statCard("Apparatus", compData.apparatus.length)}
        </div>

        {/* ── GYMNASTS SECTION ───────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Gymnasts
          </div>
          {hasGymnasts ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 1fr", gap: 0, borderBottom: "1px solid var(--border)", padding: "8px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)" }}>
                <div>#</div>
                <div>Name</div>
                <div>Club</div>
                <div>Level</div>
                <div>Round</div>
              </div>
              {[...gymnasts].sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)).map((g, i) => {
                const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level || "—";
                const roundName = compData.rounds.find(r => r.id === g.round)?.name || g.round || "—";
                return (
                  <div key={g.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 1fr", gap: 0, padding: "10px 16px", fontSize: 13, borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)" }}>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>{g.number || i + 1}</div>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div style={{ color: "var(--muted)" }}>{g.club || "—"}</div>
                    <div style={{ color: "var(--muted)" }}>{levelName}</div>
                    <div style={{ color: "var(--muted)" }}>{roundName}</div>
                  </div>
                );
              })}
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <button onClick={onManageGymnasts} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 56,
                  background: "var(--brand-01)", color: "var(--text-alternate)", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
                }}>
                  + Manage Gymnasts
                </button>
                {compData.allowSubmissions && compId && pendingCount > 0 && (
                  <button onClick={() => setShowSubmReview(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 56,
                    border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)"
                  }}>
                    Review Submissions
                    <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "40px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🤸</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>No gymnasts added yet</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 420, margin: "0 auto 28px" }}>
                You need to add gymnasts before the competition can start. Add them manually or share the submission link so clubs can send their own lists.
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary" style={{ fontSize: 14, padding: "12px 24px", background: colour, color: "#fff" }}
                  onClick={onManageGymnasts}>
                  + Add Gymnasts Manually
                </button>
                {compData.allowSubmissions && compId && (
                  <button className="btn btn-secondary" style={{ fontSize: 14, padding: "12px 24px" }}
                    onClick={copySubmitLink}>
                    {submLinkCopied ? "✅ Link copied!" : "Share Submission Link with Clubs"}
                  </button>
                )}
              </div>
              {compData.allowSubmissions && compId && pendingCount > 0 && (
                <div style={{ marginTop: 20 }}>
                  <button onClick={() => setShowSubmReview(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 56,
                    border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)"
                  }}>
                    Review Submissions
                    <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── PRE-COMPETITION DOCUMENTS ─────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Pre-Competition Documents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {docBtn("📋", "Competition Agenda",
              hasGymnasts,
              () => printDocument(buildAgendaHTML(compData, gymnasts, compId), "gymcomp-agenda.pdf"),
              "Add gymnasts in Setup to generate"
            )}
            {docBtn("✍️", "Judge Score Sheets",
              hasGymnasts && hasApparatus,
              () => printDocument(buildJudgeSheetsHTML(compData, gymnasts), "gymcomp-judge-sheets.pdf"),
              "Add gymnasts and apparatus in Setup"
            )}
            {docBtn("✅", "Attendance List",
              hasGymnasts,
              () => printDocument(buildAttendanceHTML(compData, gymnasts), "gymcomp-attendance.pdf"),
              "Add gymnasts in Setup to generate"
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            PDFs download directly to your device
          </div>
        </div>


        {/* ── LIVE VIEWS + QR CODES ─────────────────────────────── */}
        {compId && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              Live View Links
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                Share these links with coaches and parents <strong style={{ color: "var(--text)" }}>before the competition</strong> — they can scan the QR code on the printed Agenda to follow along in real time.
              </div>
              <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>
                <QRDisplay url={coachUrl} size={140} label="Coach View (D/E breakdown)" />
                <QRDisplay url={parentUrl} size={140} label="Parent View (scores + rankings)" />
              </div>
            </div>
          </div>
        )}

        {/* ── START CTA ─────────────────────────────────────────── */}
        <div style={{ background: hasGymnasts ? (eventStatus === "live" ? "#22c55e12" : `${colour}12`) : "var(--surface)", border: `1px solid ${hasGymnasts ? (eventStatus === "live" ? "#22c55e33" : colour + "33") : "var(--border)"}`, borderRadius: "var(--radius)", padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
              {!hasGymnasts ? "Almost ready" : eventStatus === "live" ? "Competition in progress" : "Ready to begin?"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {hasGymnasts
                ? eventStatus === "live"
                  ? "Return to the scoring interface to continue judging"
                  : "Opens the scoring interface — you can return here any time via \"← Dashboard\""
                : "Add at least one gymnast above before starting the competition."}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <button className="btn btn-primary"
              style={{ fontSize: 16, padding: "14px 36px", letterSpacing: 1, background: hasGymnasts ? (eventStatus === "live" ? "#22c55e" : colour) : "var(--surface2)", color: hasGymnasts ? "#fff" : "var(--muted)", opacity: hasGymnasts ? 1 : 0.55 }}
              onClick={onStartComp}
              disabled={!hasGymnasts}>
              {eventStatus === "live" ? "Resume Competition →" : "Start Competition →"}
            </button>
            {!hasGymnasts && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, textAlign: "center" }}>
                Add gymnasts before starting the competition
              </div>
            )}
          </div>
        </div>

        {/* ── COMP ID + PIN ─────────────────────────────────────── */}
        {compId && (
          <div style={{ padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Competition ID</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, cursor: "pointer", color: "var(--text)" }} onClick={() => setShowId(v => !v)}>
                {showId ? compId : "•••••• (tap to reveal)"}
              </div>
              {showId && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 10 }}
                  onClick={() => { try { navigator.clipboard.writeText(compId); } catch {} }}>
                  Copy ID
                </button>
              )}
            </div>
            <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>PIN Protection</div>
              <div style={{ fontSize: 13, color: compPin ? "var(--success)" : "var(--muted)", marginBottom: 6 }}>
                {compPin ? "🔒 PIN set" : "🔓 No PIN"}
              </div>
              {onSetPin && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={onSetPin}>
                  {compPin ? "Change PIN" : "Set PIN"}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", width: "100%" }}>
              Save your Competition ID to resume this session from any device
            </div>
          </div>
        )}

      </div>

      {showSubmReview && (
        <SubmissionsReviewPanel
          compId={compId}
          compData={compData}
          gymnasts={gymnasts}
          onAccept={(newGymnasts) => { onAcceptSubmissions(newGymnasts); refreshSubmCount(); }}
          onDecline={refreshSubmCount}
          onClose={() => setShowSubmReview(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// HOME SCREEN
// ============================================================
// ============================================================
// CLUB SUBMISSION SCREEN — public form for clubs to submit gymnasts
// ============================================================
function ClubSubmissionScreen({ compId }) {
  const [compConfig, setCompConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [clubName, setClubName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [gymnasts, setGymnasts] = useState([
    { id: generateId(), name: "", level: "", ageCategory: "" }
  ]);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!compId) { setError("No competition ID provided."); setLoading(false); return; }
    supabase.fetchOne("competitions", compId).then(({ data, error }) => {
      if (error || !data) { setError("Competition not found. Please check your link."); setLoading(false); return; }
      const cd = data.data?.compData;
      if (!cd?.allowSubmissions) { setError("This competition is not currently accepting submissions."); setLoading(false); return; }
      setCompConfig(cd);
      setLoading(false);
    });
  }, [compId]);

  const addGymnast = () => {
    setGymnasts(g => [...g, { id: generateId(), name: "", level: "", ageCategory: "" }]);
  };

  const removeGymnast = (id) => {
    setGymnasts(g => g.filter(x => x.id !== id));
  };

  const updateGymnast = (id, field, value) => {
    setGymnasts(g => g.map(x => x.id === id ? { ...x, [field]: value } : x));
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!clubName.trim()) { setFormError("Please enter your club name."); return; }
    const filled = gymnasts.filter(g => g.name.trim());
    if (!filled.length) { setFormError("Please add at least one gymnast."); return; }
    const incomplete = filled.find(g => !g.level);
    if (incomplete) { setFormError(`Please select a level for ${incomplete.name}.`); return; }

    setSubmitting(true);
    const submission = {
      id: generateId(),
      comp_id: compId,
      club_name: clubName.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      gymnasts: filled.map(g => ({ id: generateId(), name: g.name.trim(), level: g.level, ageCategory: g.ageCategory })),
      submitted_at: new Date().toISOString(),
      status: "pending",
    };

    const { error } = await supabase.insertSubmission(submission);
    setSubmitting(false);
    if (error) { setFormError("Submission failed — please try again or contact the organiser."); return; }
    setSubmitted(true);
  };

  const colour = compConfig?.brandColour || "#000dff";

  const inputStyle = { width: "100%", padding: "12px 16px", background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 56, color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-display)", boxSizing: "border-box", outline: "none" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", display: "block", marginBottom: 8, fontFamily: "var(--font-display)" };
  const selectStyle = { ...inputStyle, borderRadius: 56, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center", paddingRight: 40 };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", fontFamily: "var(--font-display)" }}>
      <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Loading competition details…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", padding: 24, fontFamily: "var(--font-display)" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8, color: "var(--text-primary)" }}>Unable to load</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", padding: 24, fontFamily: "var(--font-display)" }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎉</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: colour, marginBottom: 8 }}>Submitted!</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          Your gymnast list has been sent to the organiser for review.
          You will be contacted if any details need to be confirmed.
        </div>
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "20px 24px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "left" }}>
          <strong style={{ color: "var(--text-primary)", fontSize: 15 }}>{compConfig.name}</strong><br />
          {compConfig.date && <span style={{ fontSize: 12 }}>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>}<br />
          <span style={{ color: colour, fontWeight: 600, marginTop: 8, display: "block" }}>
            {gymnasts.filter(g => g.name.trim()).length} gymnast{gymnasts.filter(g => g.name.trim()).length !== 1 ? "s" : ""} submitted from {clubName}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-neutral)", fontFamily: "var(--font-display)" }}>
      {/* Header */}
      <div style={{ background: "var(--background-light)", borderBottom: "1px solid #e4e4e4", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        {compConfig.logo && <img src={compConfig.logo} alt="Logo" style={{ height: 44, objectFit: "contain" }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 20, color: "var(--text-primary)" }}>{compConfig.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", display: "flex", gap: 16, marginTop: 3 }}>
            {compConfig.date && <span>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
            {(compConfig.venue || compConfig.location) && <span>{compConfig.venue || compConfig.location}</span>}
          </div>
        </div>
        <div style={{ background: colour + "14", border: "1px solid " + colour + "30", borderRadius: 56, padding: "6px 14px", fontSize: 11, fontWeight: 600, color: colour, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
          Gymnast Submission
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>

        {/* Club details */}
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "28px", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20, color: "var(--text-primary)" }}>Club Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Club Name <span style={{ color: colour }}>*</span></label>
              <input style={inputStyle} placeholder="e.g. Acton Gymnastics Club" value={clubName} onChange={e => setClubName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Contact Name <span style={{ fontWeight: 400, color: "#bbb" }}>(optional)</span></label>
                <input style={inputStyle} placeholder="Your name" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Contact Email <span style={{ fontWeight: 400, color: "#bbb" }}>(optional)</span></label>
                <input type="email" style={inputStyle} placeholder="coach@example.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Gymnast list */}
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)" }}>
              Gymnasts <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)" }}>({gymnasts.filter(g => g.name.trim()).length} entered)</span>
            </div>
            <button onClick={addGymnast}
              style={{ padding: "8px 16px", background: colour, color: "var(--text-alternate)", border: "none", borderRadius: 56, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-display)" }}>
              + Add gymnast
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gymnasts.map((g, idx) => (
              <div key={g.id} style={{ background: "var(--background-neutral)", border: "1px solid #e4e4e4", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: colour + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: colour, flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <input style={{ ...inputStyle, flex: 1, width: "auto" }} placeholder="Full name" value={g.name} onChange={e => updateGymnast(g.id, "name", e.target.value)} />
                  {gymnasts.length > 1 && (
                    <button onClick={() => removeGymnast(g.id)}
                      style={{ width: 32, height: 32, background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 8, color: "var(--text-tertiary)", cursor: "pointer", fontSize: 16, flexShrink: 0, fontFamily: "var(--font-display)" }}>
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11, marginBottom: 6 }}>Level <span style={{ color: colour }}>*</span></label>
                    <select style={{ ...selectStyle, color: g.level ? "var(--text-primary)" : "var(--text-tertiary)" }} value={g.level} onChange={e => updateGymnast(g.id, "level", e.target.value)}>
                      <option value="">Select level…</option>
                      {(compConfig.levels || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                  {(compConfig.levels || []).some(l => l.rankBy === "level+age") && (
                    <div style={{ flex: 1 }}>
                      <label style={{ ...labelStyle, fontSize: 11, marginBottom: 6 }}>Age Category</label>
                      <select style={{ ...selectStyle, color: g.ageCategory ? "var(--text-primary)" : "var(--text-tertiary)" }} value={g.ageCategory} onChange={e => updateGymnast(g.id, "ageCategory", e.target.value)}>
                        <option value="">Select…</option>
                        <option value="Junior">Junior</option>
                        <option value="Senior">Senior</option>
                        <option value="U9">Under 9</option>
                        <option value="U11">Under 11</option>
                        <option value="U13">Under 13</option>
                        <option value="U15">Under 15</option>
                        <option value="U18">Under 18</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {formError && (
          <div style={{ background: "rgba(220,53,69,0.06)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#c53030", marginBottom: 16, fontFamily: "var(--font-display)" }}>
            {formError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: "100%", padding: "16px", background: colour, color: "var(--text-alternate)", border: "none", borderRadius: 56,
            fontWeight: 600, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, fontFamily: "var(--font-display)" }}>
          {submitting ? "Submitting…" : "Submit Gymnast List"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", marginTop: 20, fontFamily: "var(--font-display)" }}>
          Powered by GYMCOMP · Your details will only be used for this competition
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUBMISSIONS REVIEW PANEL — organiser reviews pending submissions
// ============================================================
function SubmissionsReviewPanel({ compId, compData, gymnasts, onAccept, onDecline, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  // Per-gymnast round assignment (set during review)
  const [roundAssignments, setRoundAssignments] = useState({});
  // Editable gymnast names
  const [editedNames, setEditedNames] = useState({});

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  const load = async () => {
    setLoading(true);
    if (inSandbox) {
      // Demo data in sandbox
      setSubmissions([
        { id: "demo1", club_name: "Acton GC", contact_name: "Jane Smith", status: "pending", submitted_at: new Date().toISOString(),
          gymnasts: [
            { id: "g1", name: "Emma Wilson", level: compData.levels[0]?.name || "Level 1", ageCategory: "U13" },
            { id: "g2", name: "Sophie Brown", level: compData.levels[0]?.name || "Level 1", ageCategory: "U11" },
          ]},
        { id: "demo2", club_name: "Harrow Gymnastics", contact_name: "Mike Jones", status: "pending", submitted_at: new Date(Date.now() - 3600000).toISOString(),
          gymnasts: [
            { id: "g3", name: "Lily Chen", level: compData.levels[1]?.name || "Level 2", ageCategory: "U15" },
          ]},
      ]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.fetchSubmissions(compId);
    if (error) console.error("[SubmissionsReviewPanel] load error:", error);
    setSubmissions(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [compId]);

  const pending = submissions.filter(s => s.status === "pending");
  const accepted = submissions.filter(s => s.status === "accepted");

  const nextNumber = () => {
    const used = gymnasts.map(g => parseInt(g.number)).filter(n => !isNaN(n));
    if (!used.length) return 1;
    return Math.max(...used) + 1;
  };

  const acceptSubmission = async (sub) => {
    setProcessing(sub.id);

    if (!inSandbox) {
      const { error } = await supabase.updateSubmission(sub.id, { status: "accepted" });
      if (error) {
        console.error("[acceptSubmission] Supabase update failed:", error);
        alert("Could not save acceptance to Supabase — please check your RLS policies on the submissions table, then try again.\n\n" + error);
        setProcessing(null);
        return;
      }
    }

    let num = nextNumber();
    const newGymnasts = sub.gymnasts.map(g => ({
      id: generateId(),
      name: (editedNames[g.id] ?? g.name).trim(),
      club: sub.club_name,
      level: compData.levels.find(l => l.name === g.level)?.id || "",
      ageCategory: g.ageCategory || "",
      round: roundAssignments[g.id] || compData.rounds[0]?.id || "",
      group: "",
      number: String(num++),
      dns: false,
    }));

    onAccept(newGymnasts);
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "accepted" } : x));
    setProcessing(null);
  };

  const declineSubmission = async (sub) => {
    setProcessing(sub.id);
    if (!inSandbox) {
      const { error } = await supabase.updateSubmission(sub.id, { status: "declined" });
      if (error) {
        console.error("[declineSubmission] Supabase update failed:", error);
        setProcessing(null);
        return;
      }
    }
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "declined" } : x));
    setProcessing(null);
    onDecline?.();
  };

  const colour = compData.brandColour || "#000dff";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end"
    }}>
      <div style={{
        width: "min(560px, 100vw)", height: "100vh", background: "var(--surface)", overflowY: "auto",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Club Submissions</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {pending.length} pending · {accepted.length} accepted
            </div>
          </div>
          <button onClick={load} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>↻ Refresh</button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>

        {inSandbox && (
          <div style={{ margin: "12px 24px 0", padding: "8px 12px", background: "rgba(0,13,255,0.05)", border: "1px solid rgba(0,13,255,0.12)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }}>
            ⚪ Preview mode — showing demo submissions. Real submissions load when deployed.
          </div>
        )}

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading submissions…</div>}

          {!loading && submissions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No submissions yet</div>
              <div style={{ fontSize: 12 }}>Share your submission link with clubs to get started</div>
            </div>
          )}

          {!loading && pending.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", marginBottom: 12 }}>
                Pending Review ({pending.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {pending.map(sub => (
                  <div key={sub.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    {/* Club header */}
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{sub.club_name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          {sub.contact_name && <span>{sub.contact_name} · </span>}
                          {sub.contact_email && <><a href={`mailto:${sub.contact_email}`} style={{ color: "var(--muted)", textDecoration: "underline" }}>{sub.contact_email}</a>{" · "}</>}
                          {new Date(sub.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(sub.submitted_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          · {sub.gymnasts.length} gymnast{sub.gymnasts.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Gymnast rows */}
                    <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {sub.gymnasts.map(g => (
                        <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            style={{ flex: 1, minWidth: 120, padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13 }}
                            value={editedNames[g.id] ?? g.name}
                            onChange={e => setEditedNames(n => ({ ...n, [g.id]: e.target.value }))}
                          />
                          <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", whiteSpace: "nowrap" }}>
                            {g.level}{g.ageCategory ? ` · ${g.ageCategory}` : ""}
                          </div>
                          <select
                            style={{ padding: "6px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, minWidth: 90 }}
                            value={roundAssignments[g.id] || ""}
                            onChange={e => setRoundAssignments(r => ({ ...r, [g.id]: e.target.value }))}>
                            <option value="">Round…</option>
                            {(compData.rounds || []).map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => declineSubmission(sub)} disabled={!!processing}
                        className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--muted)" }}>
                        Decline
                      </button>
                      <button onClick={() => acceptSubmission(sub)} disabled={!!processing}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: 12, background: colour, color: "#fff" }}>
                        {processing === sub.id ? "Accepting…" : "Accept All →"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && accepted.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", marginBottom: 12 }}>
                Accepted ({accepted.length})
              </div>
              {accepted.map(sub => (
                <div key={sub.id} style={{ padding: "10px 14px", background: "rgba(0,13,255,0.04)", border: "1px solid rgba(0,13,255,0.12)", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span> {sub.club_name} · {sub.gymnasts.length} gymnast{sub.gymnasts.length !== 1 ? "s" : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ onNew, onResume }) {
  const [recentComps, setRecentComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [resuming, setResuming] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (inSandbox) { setLoading(false); return; }
    supabase.fetchList("competitions").then(({ data }) => {
      setRecentComps(data || []);
      setLoading(false);
    });
  }, []);

  const handleIdChange = (val) => {
    setResumeId(val);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setResuming(true);
    const { data, error } = await supabase.fetchOne("competitions", id);
    setResuming(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      onResume(id, data.data);
    }
  };

  const handlePinSubmit = () => {
    if (!fetchedData) return;
    if (fetchedData.pin !== resumePin) { setResumeError("Incorrect PIN."); return; }
    onResume(resumeId.trim(), fetchedData);
  };

  const handleResume = compChecked ? handlePinSubmit : handleCheck;

  return (
    <div className="home-wrap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, minHeight: "calc(100vh - 65px)" }}>
      <div style={{ width: "100%", maxWidth: 700 }}>

        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="home-logo" style={{ fontFamily: "var(--font-display)", fontSize: 72, letterSpacing: 4, lineHeight: 1, color: "var(--accent)" }}>GYMCOMP</div>
          <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 15 }}>Competition management & live results</div>
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "16px 24px", marginBottom: 24 }}
          onClick={onNew}>
          + New Competition
        </button>

        <div className="card">
          <div className="card-title">Resume Existing Competition</div>
          <div className="home-resume-row" style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="input" placeholder="Competition ID" style={{ flex: 2, minWidth: 160 }}
              value={resumeId} onChange={e => handleIdChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResume()} />
            {compChecked && compHasPin && (
              <input className="input" placeholder="Enter PIN" style={{ flex: 1, minWidth: 100 }}
                type="password" maxLength={4} autoFocus
                value={resumePin} onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePinSubmit()} />
            )}
            <button className="btn btn-secondary" onClick={handleResume} disabled={resuming || !resumeId.trim() || (compChecked && compHasPin && !resumePin.trim())}>
              {resuming ? "Checking…" : compChecked && compHasPin ? "Enter →" : "Continue →"}
            </button>
          </div>
          {resumeError && <div className="error-box" style={{ marginTop: 8 }}>{resumeError}</div>}
        </div>

        {!inSandbox && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">Recent Competitions</div>
            {loading && <div className="empty">Loading…</div>}
            {!loading && recentComps.length === 0 && <div className="empty">No competitions yet</div>}
            {recentComps.map(c => (
              <div key={c.id} className="list-item" style={{ cursor: "pointer" }}
                onClick={() => { setResumeId(c.id); }}>
                <div className="list-item-content">
                  <strong>{c.name || "Untitled"}</strong>
                  {c.date && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 10 }}>
                    {new Date(c.date + "T12:00:00").toLocaleDateString("en-GB")}
                  </span>}
                  {c.location && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>· {c.location}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{c.id}</div>
              </div>
            ))}
          </div>
        )}

        {inSandbox && (
          <div className="warn-box" style={{ marginTop: 20, textAlign: "center" }}>
            ⚪ Running in preview mode — deploy to enable Supabase sync & recent competitions list
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// JUDGE PIN MODAL — competition ID + PIN entry overlay
// ============================================================
function JudgePinModal({ onResume, onClose }) {
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  // Reset to step 1 if ID changes after check
  const handleIdChange = (e) => {
    setResumeId(e.target.value);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  // Step 1: check competition ID
  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setChecking(true);
    const { data, error } = await supabase.fetchOne("competitions", id);
    setChecking(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      // No PIN — proceed directly
      onResume(id, data.data);
    }
  };

  // Step 2: verify PIN
  const handlePinSubmit = () => {
    if (!fetchedData) return;
    const pin = fetchedData.pin;
    if (pin !== resumePin) { setResumeError("Incorrect PIN."); return; }
    onResume(resumeId.trim(), fetchedData);
  };

  const inputStyle = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border)",
    borderRadius: 72, padding: "16px 24px", fontFamily: "inherit",
    fontSize: 16, color: "var(--text-primary)", outline: "none", background: "transparent",
  };

  const btnStyle = (disabled) => ({
    width: "100%", background: "var(--brand-01)", border: "none", borderRadius: 72,
    padding: 16, fontFamily: "inherit", fontWeight: 400,
    fontSize: 16, color: "var(--text-alternate)", textAlign: "center",
    letterSpacing: "0.3px", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--background-light)", borderRadius: 24, padding: 32,
          width: 347, maxWidth: "calc(100vw - 32px)", position: "relative",
          display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box",
          fontFamily: "var(--font-display)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 13, right: 13, width: 25, height: 25,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: "inherit", fontSize: 16, color: "var(--text-tertiary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Close"
        >
          &#x2715;
        </button>

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 18, color: "var(--text-primary)", lineHeight: 1.2 }}>
            Enter Competition
          </div>
          <div style={{ fontFamily: "inherit", fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            {compChecked && compHasPin
              ? "This competition requires a PIN. Please enter the PIN provided by the organiser."
              : "If you are a Judge or someone entering the Scores please enter the Competition ID — if you are unsure please contact your Competition Organiser."}
          </div>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            placeholder="Competition ID"
            value={resumeId}
            onChange={handleIdChange}
            onKeyDown={e => e.key === "Enter" && (!compChecked ? handleCheck() : handlePinSubmit())}
            autoFocus={!compChecked}
            style={inputStyle}
          />
          {compChecked && compHasPin && (
            <input
              placeholder="Enter PIN"
              type="password"
              maxLength={4}
              value={resumePin}
              onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
              onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
              autoFocus
              style={inputStyle}
            />
          )}
          {resumeError && <div style={{ fontSize: 13, color: "#e53e3e", paddingLeft: 24 }}>{resumeError}</div>}
          {!compChecked ? (
            <button
              onClick={handleCheck}
              disabled={checking || !resumeId.trim()}
              style={btnStyle(checking || !resumeId.trim())}
            >
              {checking ? "Checking…" : "Continue →"}
            </button>
          ) : (
            <button
              onClick={handlePinSubmit}
              disabled={!resumePin.trim()}
              style={btnStyle(!resumePin.trim())}
            >
              Enter Competition →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PIN SETUP MODAL
// ============================================================
function PinSetupModal({ onSet, onSkip }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const handleSet = () => {
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits."); return; }
    if (pin !== confirm) { setErr("PINs don't match."); return; }
    onSet(pin);
  };

  return (
    <>
    <style>{`
      .pin-input{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-light);font-family:var(--font-display);font-size:14px;color:var(--text-primary);outline:none;box-sizing:border-box;transition:border-color 0.15s;}
      .pin-input:focus{border-color:var(--brand-01);}
      .pin-input::placeholder{color:var(--text-tertiary);}
      .pin-label{font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px;}
    `}</style>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--background-light)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, fontFamily: "var(--font-display)" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Set a PIN</div>
        <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 24, lineHeight: 1.5 }}>
          Set a PIN to restrict score entry to authorised judges and scorers. Anyone entering scores will need this PIN to access the competition.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label className="pin-label">PIN (4 digits)</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} placeholder="e.g. 1234"
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,""))} />
          </div>
          <div>
            <label className="pin-label">Confirm PIN</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} placeholder="Repeat PIN"
              value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g,""))}
              onKeyDown={e => e.key === "Enter" && handleSet()} />
          </div>
          {err && <div style={{ fontSize: 13, color: "#e53e3e", padding: "10px 16px", background: "#fff5f5", borderRadius: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSet}
              style={{
                flex: 1, padding: "14px", borderRadius: 56, background: "var(--brand-01)", border: "none",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-alternate)",
              }}
            >Set PIN</button>
            <button
              onClick={onSkip}
              style={{
                flex: 1, padding: "14px", borderRadius: 56, background: "none", border: "1px solid #e4e4e4",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
              }}
            >Skip — no PIN</button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// ============================================================
// PRINT / PDF EXPORT
// ============================================================
function exportResultsPDF(compData, gymnasts, scores) {
  const APPARATUS_ICONS_PLAIN = { Beam:"🤸", Bar:"🏋️", Vault:"⚡", Floor:"🌟", Range:"🎯" };

  const getScore = (roundId, gid, app) => {
    const v = parseFloat(scores[`${roundId}__${gid}__${app}`]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (roundId, gid) => compData.apparatus.reduce((s, a) => s + getScore(roundId, gid, a), 0);

  const denseRankLocal = (items, key) => {
    const sorted = [...items].sort((a, b) => b[key] - a[key]);
    const result = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][key] < sorted[i - 1][key]) rank++;
      result.push({ ...sorted[i], rank });
    }
    return result;
  };

  const medalEmoji = (rank) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}th`;

  let body = "";

  compData.rounds.forEach(round => {
    const roundGymnasts = gymnasts.filter(g => g.round === round.id);
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });

    body += `<div class="round-header">${round.name} &nbsp;·&nbsp; ${round.start} – ${round.end}</div>`;

    Object.values(map).sort((a,b)=>(a.levelName+a.ageLabel).localeCompare(b.levelName+b.ageLabel)).forEach(({ levelName, ageLabel, gymnasts: glist }) => {
      const label = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
      body += `<div class="level-header">${label}</div>`;

      // Overall ranking table
      const withTotals = glist.map(g => ({ ...g, total: getTotal(round.id, g.id) }));
      const ranked = denseRankLocal(withTotals.filter(g => g.total > 0), "total");
      const dns = withTotals.filter(g => g.total === 0);

      const appHeaders = compData.apparatus.map(a => `<th>${APPARATUS_ICONS_PLAIN[a] || ""} ${a}</th>`).join("");

      body += `<table><thead><tr><th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th>${appHeaders}<th>Total</th></tr></thead><tbody>`;
      [...ranked, ...dns.map(g=>({...g,rank:null}))].forEach(g => {
        const cells = compData.apparatus.map(a => `<td>${getScore(round.id, g.id, a) > 0 ? getScore(round.id, g.id, a).toFixed(2) : "—"}</td>`).join("");
        const rankCell = g.rank === null ? `<td class="dns">DNS</td>` : `<td class="rank">${medalEmoji(g.rank)}</td>`;
        body += `<tr class="${g.rank === null ? "dns-row" : ""}">${rankCell}<td>${g.number || ""}</td><td><strong>${g.name}</strong></td><td>${g.club || ""}</td>${cells}<td><strong>${g.total > 0 ? g.total.toFixed(2) : "—"}</strong></td></tr>`;
      });
      body += `</tbody></table>`;
    });
  });

  const dateFmt = compData.date
    ? new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${compData.name || "Competition"} — Results</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; padding: 20px; }
  .header { text-align: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .header h1 { font-size: 26px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
  .header .meta { font-size: 11px; color: #555; }
  .round-header { font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 8px; padding: 6px 10px; background: #111; color: #fff; border-radius: 4px; }
  .level-header { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #555; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; }
  th { background: #f0f0f0; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; border: 1px solid #ddd; }
  td { padding: 6px 8px; border: 1px solid #ddd; }
  .rank { font-weight: bold; }
  .dns { color: #999; font-style: italic; }
  .dns-row td { color: #999; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { padding: 10px; } .round-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>
<div class="header">
  <h1>${compData.name || "Competition Results"}</h1>
  <div class="meta">${[dateFmt, compData.location, compData.holder ? `Holder: ${compData.holder}` : ""].filter(Boolean).join("  ·  ")}</div>
</div>
${body}
<div class="footer">Generated by GYMCOMP · ${new Date().toLocaleDateString("en-GB")}</div>
</body></html>`;

  generatePDF(html, "gymcomp-results.pdf");
}

// ============================================================
// MC MODE — Read-off screen for awards ceremony
// ============================================================
function MCMode({ compData, gymnasts, scores }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("overall"); // "overall" | "apparatus"
  const [activeApparatus, setActiveApparatus] = useState(compData.apparatus[0] || "");
  const [fullscreen, setFullscreen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const getScore = (gid, app) => {
    const v = parseFloat(scores[gymnast_key(activeRound, gid, app)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (gid) => compData.apparatus.reduce((s, a) => s + getScore(gid, a), 0);

  const roundGymnasts = gymnasts.filter(g => g.round === activeRound && !g.dns);

  const buildRankGroups = () => {
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([key, val]) => ({ key, ...val }));
  };

  const rankGroups = buildRankGroups();

  // Build flat announcement list: for each level group, gymnasts in reverse order (worst first → best last)
  const buildAnnouncementList = () => {
    const list = [];
    rankGroups.forEach(({ levelName, ageLabel, gymnasts: glist }) => {
      const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
      if (view === "overall") {
        const withTotals = glist.map(g => ({ ...g, total: getTotal(g.id) }))
          .filter(g => g.total > 0);
        const ranked = denseRank(withTotals, "total");
        // Reverse: announce from last place to first
        const reversed = [...ranked].sort((a, b) => b.rank - a.rank);
        reversed.forEach(g => {
          const medal = g.rank === 1 ? "🥇" : g.rank === 2 ? "🥈" : g.rank === 3 ? "🥉" : "";
          const placing = g.rank === 1 ? "1st place" : g.rank === 2 ? "2nd place" : g.rank === 3 ? "3rd place" : `${g.rank}th place`;
          list.push({
            group: groupLabel,
            gymnast: g,
            rank: g.rank,
            medal,
            score: g.total.toFixed(3),
            text: `In ${placing}… with a score of ${g.total.toFixed(3)}… ${medal} ${g.name}… from ${g.club || "—"}`,
          });
        });
      } else {
        const withScores = glist.map(g => ({ ...g, score: getScore(g.id, activeApparatus) }))
          .filter(g => g.score > 0);
        const ranked = denseRank(withScores, "score");
        const reversed = [...ranked].sort((a, b) => b.rank - a.rank);
        reversed.forEach(g => {
          const medal = g.rank === 1 ? "🥇" : g.rank === 2 ? "🥈" : g.rank === 3 ? "🥉" : "";
          const placing = g.rank === 1 ? "1st place" : g.rank === 2 ? "2nd place" : g.rank === 3 ? "3rd place" : `${g.rank}th place`;
          list.push({
            group: groupLabel,
            gymnast: g,
            rank: g.rank,
            medal,
            score: g.score.toFixed(3),
            text: `In ${placing}… with a score of ${g.score.toFixed(3)}… ${medal} ${g.name}… from ${g.club || "—"}`,
          });
        });
      }
    });
    return list;
  };

  const announcements = buildAnnouncementList();
  const current = announcements[currentIdx];

  const prev = () => setCurrentIdx(i => Math.max(0, i - 1));
  const next = () => setCurrentIdx(i => Math.min(announcements.length - 1, i + 1));

  const rankBg = (rank) => {
    if (rank === 1) return "linear-gradient(135deg, #FFD700, #FFA500)";
    if (rank === 2) return "linear-gradient(135deg, #C0C0C0, #A0A0A0)";
    if (rank === 3) return "linear-gradient(135deg, #CD7F32, #A0522D)";
    return "var(--surface)";
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">MC <span>Mode</span></div>
        <div className="page-sub">Read off results during the awards ceremony — one gymnast at a time</div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {compData.rounds.map(r => (
            <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
              onClick={() => { setActiveRound(r.id); setCurrentIdx(0); }}>{r.name}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-sm ${view === "overall" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => { setView("overall"); setCurrentIdx(0); }}>Overall</button>
          {compData.apparatus.map(a => (
            <button key={a} className={`btn btn-sm ${view === "apparatus" && activeApparatus === a ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setView("apparatus"); setActiveApparatus(a); setCurrentIdx(0); }}>
              {APPARATUS_ICONS[a] || "🏅"} {a}
            </button>
          ))}
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="empty">No scored gymnasts in this round yet</div>
      ) : (
        <>
          {/* Progress */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {announcements.map((ann, i) => (
              <button key={i}
                onClick={() => setCurrentIdx(i)}
                style={{
                  width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: i === currentIdx ? "var(--accent)" : i < currentIdx ? "var(--success)" : "var(--surface2)",
                  color: i === currentIdx ? "#000" : i < currentIdx ? "#fff" : "var(--muted)"
                }}>
                {ann.rank === 1 ? "🥇" : ann.rank === 2 ? "🥈" : ann.rank === 3 ? "🥉" : ann.rank}
              </button>
            ))}
          </div>

          {/* Group label */}
          {current && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>
              {current.group} {view === "apparatus" ? `· ${activeApparatus}` : "· Overall"}
            </div>
          )}

          {/* Main announcement card */}
          {current && (
            <div style={{
              background: rankBg(current.rank),
              borderRadius: 16, padding: "40px 48px", textAlign: "center", marginBottom: 24,
              boxShadow: current.rank <= 3 ? "0 8px 40px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>{current.medal || "🏅"}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: current.rank <= 3 ? 64 : 48, lineHeight: 1, letterSpacing: 2, marginBottom: 12, color: current.rank <= 3 ? "#fff" : "var(--text)" }}>
                {current.gymnast.name}
              </div>
              <div style={{ fontSize: 20, color: current.rank <= 3 ? "rgba(255,255,255,0.8)" : "var(--muted)", marginBottom: 16 }}>
                {current.gymnast.club}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 48, color: current.rank <= 3 ? "#fff" : "var(--accent)", letterSpacing: 1 }}>
                {current.score}
              </div>
              <div style={{ fontSize: 14, color: current.rank <= 3 ? "rgba(255,255,255,0.7)" : "var(--muted)", marginTop: 6 }}>
                {current.rank === 1 ? "🥇 1st Place" : current.rank === 2 ? "🥈 2nd Place" : current.rank === 3 ? "🥉 3rd Place" : `${current.rank}th Place`}
              </div>
            </div>
          )}

          {/* MC script text */}
          {current && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px 20px", marginBottom: 24, fontSize: 18, lineHeight: 1.8, color: "var(--text)", fontStyle: "italic" }}>
              "{current.text}"
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={prev} disabled={currentIdx === 0} style={{ fontSize: 16, padding: "12px 32px" }}>
              ← Previous
            </button>
            <div style={{ display: "flex", alignItems: "center", color: "var(--muted)", fontSize: 13 }}>
              {currentIdx + 1} of {announcements.length}
            </div>
            <button className="btn btn-primary" onClick={next} disabled={currentIdx === announcements.length - 1} style={{ fontSize: 16, padding: "12px 32px" }}>
              Next →
            </button>
          </div>

          {currentIdx === announcements.length - 1 && (
            <div style={{ textAlign: "center", marginTop: 24, fontSize: 20, color: "var(--accent)", fontFamily: "var(--font-display)", letterSpacing: 2 }}>
              🎉 End of ceremony — congratulations to all competitors!
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// LIVE VIEW LAUNCHER — generates public coach/parent links
// ============================================================
function LiveViewPanel({ compId, compData }) {
  const [coachCopied, setCoachCopied] = useState(false);
  const [parentCopied, setParentCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const coachUrl = `${origin}/coach.html?comp=${compId}`;
  const parentUrl = `${origin}/results.html?comp=${compId}`;

  const copy = async (url, setFlag) => {
    try { await navigator.clipboard.writeText(url); } catch {}
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>Live:</div>
      <button className="btn btn-sm btn-secondary" onClick={() => copy(coachUrl, setCoachCopied)}>
        {coachCopied ? "✅ Coach link copied" : "📋 Coach View"}
      </button>
      <button className="btn btn-sm btn-secondary" onClick={() => copy(parentUrl, setParentCopied)}>
        {parentCopied ? "✅ Parent link copied" : "👪 Parent View"}
      </button>
    </div>
  );
}

// ============================================================
// APP SIDEBAR (persistent, context-aware)
// ============================================================
function AppSidebar({ screen, phase, step, setStep, collapsed, onToggle, account, statusFilter, setStatusFilter, filterCounts, activeSection, onNew, onMyEvents, onEditSetup, onManageGymnasts, onStartComp, onDashboard, onSettings, onLogout, gymnastsCount, eventStatus }) {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // SVG icon helpers (16x16)
  const icons = {
    plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
    back: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>,
    edit: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>,
    users: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M12 9.5c1.5.3 2.5 1.5 2.5 3"/></svg>,
    play: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>,
    score: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 2v12"/></svg>,
    trophy: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6v5a3 3 0 01-6 0V2zM8 10v3M5 13h6"/><path d="M5 4H3a1 1 0 00-1 1v1a2 2 0 002 2h1M11 4h2a1 1 0 011 1v1a2 2 0 01-2 2h-1"/></svg>,
    doc: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/></svg>,
    mic: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="6" height="8" rx="3"/><path d="M3 8a5 5 0 0010 0M8 13v2"/></svg>,
    account: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>,
    logout: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M6 8h8"/></svg>,
    info: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.5v0"/></svg>,
    palette: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="10" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="9" r="1" fill="currentColor"/></svg>,
    club: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14l2-8h8l2 8M5 2a3 3 0 016 0"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>,
    bars: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10M3 8h10M3 12h10"/></svg>,
    layers: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L2 5.5 8 9l6-3.5L8 2zM2 10.5L8 14l6-3.5M2 8l6 3.5L14 8"/></svg>,
    gauge: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 14A6 6 0 118 2a6 6 0 010 12zM8 5v3l2 1"/></svg>,
    send: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z"/></svg>,
    grid: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>,
    collapse: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4L7 8l4 4"/><path d="M7 4L3 8l4 4"/></svg>,
    expand: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4-4-4-4"/><path d="M9 12l4-4-4-4"/></svg>,
    judge: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14V3a1 1 0 00-1-1H5a1 1 0 00-1 1v11M6 5h4M6 8h4M6 11h2"/></svg>,
    home: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l6-5.5L14 8M3.5 9v4.5a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>,
  };

  const NavItem = ({ icon, label, active, done, onClick, count, title: tip }) => (
    <button className={`as-nav-item${active ? " active" : ""}${done ? " done" : ""}`} onClick={onClick} title={collapsed ? (tip || label) : undefined}>
      {icon}
      <span className="as-label">{label}</span>
      {count !== undefined && count > 0 && <span className="as-count">{count}</span>}
    </button>
  );

  const sidebarFilters = [
    { value: "draft", label: "Draft", color: "#f59e0b",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg> },
    { value: "active", label: "Active", color: "var(--brand-01)",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--brand-01)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 1.5"/></svg> },
    { value: "live", label: "Live", color: "#22c55e",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg> },
    { value: "completed", label: "Complete", color: "#15803d",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5L6.5 11.5 12.5 4.5"/></svg> },
    { value: "archived", label: "Archived", color: "#909090",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#909090" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="3" rx="1"/><path d="M3 6v6.5a1 1 0 001 1h8a1 1 0 001-1V6M6.5 9h3"/></svg> },
  ];

  const setupAnchors = [
    { id: "setup-basic", label: "Basic Info", icon: icons.info },
    { id: "setup-branding", label: "Branding", icon: icons.palette },
    { id: "setup-clubs", label: "Clubs", icon: icons.club },
    { id: "setup-rounds", label: "Rounds", icon: icons.clock },
    { id: "setup-apparatus", label: "Apparatus", icon: icons.bars },
    { id: "setup-levels", label: "Levels", icon: icons.layers },
    { id: "setup-scoring", label: "Scoring", icon: icons.gauge },
    { id: "setup-submissions", label: "Submissions", icon: icons.send },
    { id: "setup-judges", label: "Judges", icon: icons.judge },
  ];

  const phase2Steps = [
    { label: "Score Input", icon: icons.score, step: 1 },
    { label: "Results", icon: icons.trophy, step: 2 },
    { label: "Exports", icon: icons.doc, step: 3 },
    { label: "MC Mode", icon: icons.mic, step: 4 },
  ];

  const initial = (account?.name || account?.email || "?")[0].toUpperCase();

  return (
    <div className={`app-sidebar${collapsed ? " collapsed" : ""}`}>
      <button className="as-toggle" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {collapsed ? <path d="M3 1l3 3-3 3"/> : <path d="M5 1L2 4l3 3"/>}
        </svg>
      </button>
      <div className="as-top">
        <div className="as-header">
          <div className="as-logo">
            <img src={GymCompLogotype} alt="GymComp" className="as-logo-logotype" />
            <img src={GymCompLogomark} alt="GC" className="as-logo-logomark" />
          </div>
        </div>

        <div className="as-nav">
          {/* ── org-dashboard context ── */}
          {screen === "org-dashboard" && (<>
            <NavItem icon={icons.plus} label="New Competition" onClick={onNew} />
            <div className="as-divider" />
            <div className="as-section-title">Filter</div>
            {sidebarFilters.map(f => (
              <NavItem key={f.value} icon={f.icon} label={f.label}
                active={statusFilter === f.value}
                count={filterCounts[f.value]}
                onClick={() => setStatusFilter(prev => prev === f.value ? "all" : f.value)} />
            ))}
          </>)}

          {/* ── active / phase 1 (edit setup) ── */}
          {screen === "active" && phase === 1 && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <div className="as-divider" />
            <div className="as-section-title">Setup Sections</div>
            {setupAnchors.map(a => (
              <NavItem key={a.id} icon={a.icon} label={a.label} active={activeSection === a.id} onClick={() => scrollTo(a.id)} />
            ))}
          </>)}

          {/* ── active / dashboard ── */}
          {screen === "active" && phase === "dashboard" && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <div className="as-divider" />
            <NavItem icon={icons.edit} label="Edit Setup" onClick={onEditSetup} />
            <NavItem icon={icons.users} label="Manage Gymnasts" onClick={onManageGymnasts} />
            {gymnastsCount > 0 && (
              <NavItem icon={icons.play} label={eventStatus === "live" ? "Resume Competition" : "Start Competition"} onClick={onStartComp} />
            )}
          </>)}

          {/* ── active / gymnasts ── */}
          {screen === "active" && phase === "gymnasts" && (<>
            <NavItem icon={icons.back} label="Back to Comp" onClick={onDashboard} />
          </>)}

          {/* ── active / phase 2 (competition) ── */}
          {screen === "active" && phase === 2 && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <NavItem icon={icons.home} label="Dashboard" onClick={onDashboard} />
            <div className="as-divider" />
            <div className="as-section-title">Competition</div>
            {phase2Steps.map(s => (
              <NavItem key={s.step} icon={s.icon} label={s.label}
                active={step === s.step}
                onClick={() => setStep(s.step)} />
            ))}
          </>)}
        </div>
      </div>

      <div className="as-bottom">
        <button className="as-account" onClick={onSettings} title={collapsed ? "Account" : undefined}>
          <div className="as-account-avatar">{initial}</div>
          <span className="as-account-label">{account?.name || account?.email || "Account"}</span>
        </button>
        <button className="as-signout" onClick={onLogout}>
          {icons.logout}
          <span className="as-label">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MOBILE LOGO HEADER — pill at top, hides on scroll down
// ============================================================
function MobileLogoHeader({ onGoHome }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const el = document.querySelector(".app-main");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      if (y > lastY.current && y > 48) setHidden(true);
      else if (y < lastY.current) setHidden(false);
      lastY.current = y;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`mobile-logo-header${hidden ? " hidden" : ""}`} onClick={onGoHome} style={{ cursor: "pointer" }}>
      <img src={GymCompLogotype} alt="GymComp" className="mlh-logotype" />
      <img src={GymCompLogomark} alt="" className="mlh-logomark" />
    </div>
  );
}

// ============================================================
// MOBILE TAB BAR
// ============================================================
function MobileTabBar({ screen, phase, step, setStep, onNew, onMyEvents, onEditSetup, onManageGymnasts, onStartComp, onDashboard, onSettings, onSave }) {
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
        <Tab icon={icons.save} label="Save" onClick={onSave} />
      </>)}

      {screen === "active" && phase === "dashboard" && (<>
        <Tab icon={icons.home} label="My Events" onClick={onMyEvents} />
        <D />
        <Tab icon={icons.edit} label="Edit" onClick={onEditSetup} />
        <D />
        <Tab icon={icons.users} label="Gymnasts" onClick={onManageGymnasts} />
        <D />
        <Tab icon={icons.play} label="Start" onClick={onStartComp} />
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
        <D />
        <Tab icon={icons.mic} label="MC" active={step === 4} onClick={() => setStep(4)} />
      </>)}
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  // ── Auth state (Supabase Auth) ──────────────────────────────────────────
  const [currentUser,    setCurrentUser]    = useState(null);  // supabase user object
  const hasAuthed = useRef(false); // guard against token-refresh re-navigation
  const [currentProfile, setCurrentProfile] = useState(null);  // row from profiles table
  const [authLoading,    setAuthLoading]    = useState(true);
  // "loading" | "auth-login" | "profile-onboarding" | "org-dashboard" | "new-pin" | "active"
  const [screen, setScreen] = useState("loading");
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterCounts, setFilterCounts] = useState({ draft: 0, active: 0, completed: 0, archived: 0 });
  // Current event record (from events store) — links comp to account
  const [currentEventId, setCurrentEventId] = useState(null);

  // Derived account shape — keeps all downstream component code unchanged
  const currentAccount = currentUser ? {
    id:       currentUser.id,
    email:    currentUser.email,
    name:     currentProfile?.full_name || currentUser.email?.split("@")[0] || "",
    clubName: currentProfile?.club_name || "",
  } : null;

  const [phase, setPhase] = useState(1);
  const [step, setStep] = useState(1);
  const [setupWarn, setSetupWarn] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);
  const [leaveEditConfirm, setLeaveEditConfirm] = useState(null);

  // Supabase sync state
  const [compId, setCompId] = useState(() => generateId());
  const [compPin, setCompPin] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const pinModalCallback = useRef(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [shareUrl, setShareUrl] = useState(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showCompId, setShowCompId] = useState(false);
  const syncTimer = useRef(null);

  const [compData, setCompDataRaw] = useState({
    name: "", location: "", date: "", holder: "",
    organiserName: "", venue: "", brandColour: "#000dff", logo: "",
    useDEScoring: false, allowSubmissions: false,
    clubs: [], rounds: [], apparatus: [], levels: [], judges: []
  });
  const [gymnasts, setGymnasts] = useState([]);
  const [scores, setScores] = useState({});

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  // ── Auth initialisation ──────────────────────────────────────────────────
  const loadUserProfile = async (user) => {
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const { data: profile } = await supabase.fetchProfile(user.id, token);
      setCurrentProfile(profile || null);
      setAuthLoading(false);
      // Only navigate on initial auth — not on token refreshes that re-trigger loadUserProfile
      if (!hasAuthed.current) {
        hasAuthed.current = true;
        setScreen(profile?.full_name ? "org-dashboard" : "profile-onboarding");
      }
    } catch (e) {
      console.error("Profile load error:", e);
      setAuthLoading(false);
      setScreen("auth-login");
    }
  };

  useEffect(() => {
    // Resolve any existing session on page load (also handles magic-link / OAuth redirect tokens)
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadUserProfile(session.user);
      } else {
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        setCurrentUser(session.user);
        loadUserProfile(session.user);
      } else if (event === "SIGNED_OUT") {
        hasAuthed.current = false;
        setCurrentUser(null);
        setCurrentProfile(null);
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Supabase sync ----
  const pushToSupabase = useCallback(async (nextCompData, nextGymnasts, nextScores, pin, status) => {
    if (inSandbox) { setSyncStatus("sandbox"); return; }
    if (!currentUser) { console.error("pushToSupabase: no authenticated user"); setSyncStatus("error"); return; }
    setSyncStatus("saving");
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) { console.error("pushToSupabase: no active session"); setSyncStatus("error"); return; }
      const token = session.access_token;
      const payload = { compData: nextCompData, gymnasts: nextGymnasts, scores: nextScores, pin: pin ?? compPin };
      const record = { id: compId, data: payload, user_id: currentUser.id };
      // Always include status — use explicit param, or look up from local events by compId (not currentEventId which may be stale in closure)
      const localEv = events.getAll().find(e => e.compId === compId);
      record.status = status || localEv?.status || "draft";
      const { error } = await supabase.upsert("competitions", record, token);
      if (error) throw new Error(error);
      setSyncStatus("saved");
    } catch (e) {
      console.error("Supabase sync failed:", e.message);
      setSyncStatus("error");
    }
  }, [compId, compPin, inSandbox, currentUser]);

  const scheduleSync = useCallback((cd, g, s) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      pushToSupabase(cd, g, s);
      // Also snapshot to local events store
      if (currentEventId) events.snapshot(currentEventId, cd, g, s);
    }, 800);
  }, [pushToSupabase, currentEventId]);

  const setCompData = useCallback((updater) => {
    setCompDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (gymnasts.length > 0) {
        const apparatusChanged = JSON.stringify(prev.apparatus) !== JSON.stringify(next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      scheduleSync(next, gymnasts, scores);
      return next;
    });
  }, [gymnasts, scores, scheduleSync]);

  // Local-only version of setCompData — updates React state without syncing to Supabase.
  // Used in Phase 1 setup so edits aren't auto-saved.
  const setCompDataLocal = useCallback((updater) => {
    setCompDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (gymnasts.length > 0) {
        const apparatusChanged = JSON.stringify(prev.apparatus) !== JSON.stringify(next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      return next;
    });
  }, [gymnasts]);

  const setGymnastsWithSync = useCallback((updater) => {
    setGymnasts(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      scheduleSync(compData, next, scores);
      return next;
    });
  }, [compData, scores, scheduleSync]);

  const setScoresWithSync = useCallback((updater) => {
    setScores(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      scheduleSync(compData, gymnasts, next);
      return next;
    });
  }, [compData, gymnasts, scheduleSync]);

  const confirmSetupChange = () => {
    setCompDataRaw(pendingChange);
    setSetupWarn(null);
    setPendingChange(null);
  };

  // ---- Auth actions ----
  /* OLD handleLogin — navigation now driven by onAuthStateChange
  const handleLogin = (account) => {
    setCurrentAccount(account);
    setScreen("org-dashboard");
  };
  */

  const handleLogout = async () => {
    events.clear(); // Wipe local events so stale data never leaks to the next session
    await supabaseAuth.auth.signOut();
    // setCurrentUser(null) + setScreen("auth-login") handled by onAuthStateChange
  };

  const handleAccountSave = (updatedProfile) => {
    setCurrentProfile(updatedProfile);
  };

  // ---- New competition flow ----
  const handleNew = () => {
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    setCompDataRaw({ name:"", location:"", date:"", holder: currentProfile?.full_name || "", organiserName: currentProfile?.club_name || "", venue:"", brandColour:"#000dff", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
    setGymnasts([]);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    // Create event record if logged in
    if (currentAccount) {
      const ev = events.create(currentAccount.id, newCompId);
      setCurrentEventId(ev.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  // Open an existing event from the organiser dashboard
  const handleOpenEvent = (ev) => {
    const snapshot = ev.snapshot;
    if (snapshot) {
      setCompId(ev.compId);
      setCompPin(snapshot.compData?.pin || null);
      setCompDataRaw(snapshot.compData || {});
      setGymnasts(snapshot.gymnasts || []);
      setScores(snapshot.scores || {});
      // Draft events open in edit mode; live opens into competition; others to dashboard
      if (ev.status === "draft") { setPhase(1); setStep(1); }
      else if (ev.status === "live") { setPhase(2); setStep(1); }
      else { setPhase("dashboard"); setStep(1); }
      setSyncStatus("saved");
    } else {
      // No snapshot yet — start fresh setup
      setCompId(ev.compId);
      setCompPin(null);
      setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#000dff", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
      setGymnasts([]);
      setScores({});
      setPhase(1); setStep(1);
      setSyncStatus("idle");
    }
    setCurrentEventId(ev.id);

    setScreen("active");
  };

  // Open an existing event directly into edit mode (phase 1)
  const handleEditEvent = (ev) => {
    const snapshot = ev.snapshot;
    if (snapshot) {
      setCompId(ev.compId);
      setCompPin(snapshot.compData?.pin || null);
      setCompDataRaw(snapshot.compData || {});
      setGymnasts(snapshot.gymnasts || []);
      setScores(snapshot.scores || {});
      setSyncStatus("saved");
    } else {
      setCompId(ev.compId);
      setCompPin(null);
      setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#000dff", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
      setGymnasts([]);
      setScores({});
      setSyncStatus("idle");
    }
    setPhase(1); setStep(1);
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Open an existing event into the dashboard overview (comp details + PDFs)
  const handleViewEvent = (ev) => {
    const snapshot = ev.snapshot;
    if (snapshot) {
      setCompId(ev.compId);
      setCompPin(snapshot.compData?.pin || null);
      setCompDataRaw(snapshot.compData || {});
      setGymnasts(snapshot.gymnasts || []);
      setScores(snapshot.scores || {});
      setSyncStatus("saved");
    }
    setPhase("dashboard"); setStep(1);
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Duplicate an event as a new competition
  const handleDuplicateEvent = (ev) => {
    const snapshot = ev.snapshot;
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    // Copy comp setup but clear date and reset gymnasts/scores
    const baseData = snapshot?.compData
      ? { ...snapshot.compData, name: `${snapshot.compData.name || "Competition"} (Copy)`, date: "", gymnasts: [], judges: [] }
      : { name:"Copy", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#000dff", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] };
    setCompDataRaw(baseData);
    setGymnasts([]);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    if (currentAccount) {
      const newEv = events.create(currentAccount.id, newCompId);
      events.snapshot(newEv.id, baseData, [], {});
      setCurrentEventId(newEv.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  const handlePinSet = (pin) => {
    setCompPin(pin); setShowPinModal(false);
    // Sync PIN to Supabase + local snapshot
    pushToSupabase(compData, gymnasts, scores, pin);
    if (currentEventId) events.snapshot(currentEventId, { ...compData, pin }, gymnasts, scores);
    if (pinModalCallback.current) { pinModalCallback.current(); pinModalCallback.current = null; }
  };
  const handlePinSkip = () => {
    setCompPin(null); setShowPinModal(false);
    if (pinModalCallback.current) { pinModalCallback.current(); pinModalCallback.current = null; }
  };

  // Navigate back to org dashboard
  const goBackToDashboard = () => {
    const doLeave = () => { setScreen("org-dashboard"); };
    // Always warn during phase 1 setup — nothing auto-saves
    if (phase === 1) {
      setLeaveEditConfirm(() => doLeave);
    } else {
      doLeave();
    }
  };

  // ---- Sidebar nav callbacks for active screen ----
  const handleSaveSetup = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    pushToSupabase(compData, gymnasts, scores);
    if (currentEventId) events.snapshot(currentEventId, compData, gymnasts, scores);
  };

  const handleStartComp = () => {
    setPhase(2); setStep(1);
    if (currentEventId) {
      events.update(currentEventId, { status: "live" });
      const ev = events.getAll().find(e => e.id === currentEventId);
      if (ev?.compId) {
        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
          if (session) supabase.patch("competitions", ev.compId, { status: "live" }, session.access_token);
        });
      }
    }
  };
  const handleCompleteComp = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    pushToSupabase(compData, gymnasts, scores);
    if (currentEventId) {
      events.snapshot(currentEventId, compData, gymnasts, scores);
      events.update(currentEventId, { status: "completed" });
      const ev = events.getAll().find(e => e.id === currentEventId);
      if (ev?.compId) {
        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
          if (session) supabase.patch("competitions", ev.compId, { status: "completed" }, session.access_token);
        });
      }
    }
    setScreen("org-dashboard");
  };
  const handleEditSetup = () => { setPhase(1); setStep(1); };
  const handleManageGymnasts = () => setPhase("gymnasts");
  const handleGoToDashboard = () => { setPhase("dashboard"); setStep(1); };

  // Scroll .app-main to top on phase/screen transitions
  const appMainRef = useRef(null);
  useEffect(() => {
    if (appMainRef.current) appMainRef.current.scrollTop = 0;
  }, [phase, step, screen]);

  // Track which setup section is in view (Phase 1 scroll-spy)
  const [activeSection, setActiveSection] = useState("");
  useEffect(() => {
    if (screen !== "active" || phase !== 1) { setActiveSection(""); return; }
    const ids = ["setup-basic","setup-branding","setup-clubs","setup-rounds","setup-apparatus","setup-levels","setup-scoring","setup-submissions","setup-judges"];
    const root = appMainRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) setActiveSection(visible[0].target.id);
    }, { root, rootMargin: "-10% 0px -60% 0px", threshold: 0 });
    // Small delay so DOM has rendered the cards
    const t = setTimeout(() => {
      ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    }, 100);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [screen, phase]);

  // ---- Resume competition (PIN-only path for judges / no-account users) ----
  const handleResume = (id, savedData) => {
    setCompId(id);
    setCompPin(savedData.pin || null);
    setCompDataRaw(savedData.compData || {});
    setGymnasts(savedData.gymnasts || []);
    setScores(savedData.scores || {});
    // Judges land directly on scoring view, not dashboard
    setPhase(2); setStep(1);
    setSyncStatus("saved");
    setCurrentEventId(null);
    setScreen("active");
  };

  // ---- Share link ----
  const handleShare = async () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    await pushToSupabase(compData, gymnasts, scores);
    const url = `${window.location.origin}/results.html?comp=${compId}`;
    setShareUrl(url);
    try { await navigator.clipboard.writeText(url); } catch {}
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 4000);
  };

  const phase2Steps = [
    { label: "Score Input", done: Object.keys(scores).length > 0 },
    { label: "Results", done: false },
    { label: "Exports & Docs", done: false },
    { label: "MC Mode", done: false },
  ];

  const syncDot = { idle:null, saving:"🟡", saved:"🟢", error:"🔴", sandbox:"⚪" }[syncStatus];
  const syncLabel = { idle:"", saving:"Saving…", saved:"Saved ✓", error:"Sync error", sandbox:"Preview mode" }[syncStatus];

  // ---- LOADING — blank dark screen while session resolves ----
  if (authLoading) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ background: "var(--bg)", minHeight: "100vh" }} />
      </>
    );
  }

  // ---- AUTH SCREEN (Google OAuth + Magic Link) ----
  if (screen === "auth-login") {
    return (
      <>
        <style>{css}</style>
        <AuthScreen onResume={handleResume} />
      </>
    );
  }

  // ---- PROFILE ONBOARDING (first login only) ----
  if (screen === "profile-onboarding") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <ProfileOnboardingScreen
            user={currentUser}
            onComplete={(profile) => {
              setCurrentProfile(profile);
              setScreen("org-dashboard");
            }}
          />
        </div>
      </>
    );
  }

  // ---- ORGANISER DASHBOARD ----
  if (screen === "org-dashboard") {
    return (
      <>
        <style>{css}</style>
        <div className="app-shell">
          <AppSidebar screen="org-dashboard" phase={null} step={null} setStep={null}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection=""
            onNew={handleNew} onMyEvents={null} onEditSetup={null} onManageGymnasts={null}
            onStartComp={null} onDashboard={null}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout} />
          <div className="app-main">
            <OrganizerDashboard
              account={currentAccount}
              onNew={handleNew}
              onOpen={handleOpenEvent}
              onView={handleViewEvent}
              onEdit={handleEditEvent}
              onDuplicate={handleDuplicateEvent}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onFilterCountsChange={setFilterCounts}
            />
          </div>
        </div>
        <MobileLogoHeader onGoHome={() => setScreen("org-dashboard")} />
        <MobileTabBar screen="org-dashboard" phase={null} step={null} setStep={null}
          onNew={handleNew} onMyEvents={null} onEditSetup={null} onManageGymnasts={null}
          onStartComp={null} onDashboard={null}
          onSettings={() => setShowAccountSettings(true)} />
        {showAccountSettings && (
          <AccountSettingsModal
            account={currentAccount}
            profile={currentProfile}
            onSave={handleAccountSave}
            onLogout={handleLogout}
            onClose={() => setShowAccountSettings(false)}
          />
        )}
      </>
    );
  }

  // ---- PIN SETUP ----
  if (screen === "new-pin") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <nav className="nav"><div className="nav-logo">GYMCOMP<span>.</span></div><div /><div /></nav>
          <PinSetupModal onSet={handlePinSet} onSkip={handlePinSkip} />
        </div>
      </>
    );
  }

  // ---- ACTIVE COMPETITION ----
  // Organisers get app-shell with sidebar; judges (no account) get minimal nav
  const activeContent = (
    <>
      {/* SHARE TOAST */}
      {showShareToast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          background: "var(--accent)", color: "#fff", borderRadius: 16, padding: "12px 24px",
          fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxWidth: "90vw", textAlign: "center", lineHeight: 1.6
        }}>
          Link copied — share with parents<br />
          <span style={{ fontWeight: 400, wordBreak: "break-all", fontSize: 11 }}>{shareUrl}</span>
        </div>
      )}

      {/* Nav bar — hidden during setup (phase 1) and dashboard for organisers */}
      {!(currentAccount && (phase === 1 || phase === "dashboard")) && (
        <nav className="nav">
          {!currentAccount && (
            <div className="nav-logo" style={{ cursor: "pointer" }} onClick={() => setScreen("auth-login")}>GYMCOMP<span>.</span></div>
          )}
          {currentAccount && <div style={{ width: 8 }} />}

          <div className="nav-centre" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
            {compData.name && (
              <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                <strong style={{ color: "var(--text)" }}>{compData.name}</strong>
                {compData.date && <> · {new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB")}</>}
              </div>
            )}
            {syncStatus !== "idle" && (
              <div style={{ fontSize: 11, color: syncStatus === "saved" ? "var(--success)" : "var(--muted)", cursor: "pointer" }}
                onClick={() => setShowCompId(v => !v)}>
                {syncDot} {syncLabel}
                {syncStatus === "saved" && <> · <span style={{ fontFamily: "monospace", fontSize: 10 }}>{showCompId ? compId : "ID"}</span></>}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {phase === 2 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResultsPDF(compData, gymnasts, scores)}>
                  Export PDF
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleShare}>
                  Share Results
                </button>
              </>
            )}
            {!currentAccount && phase === 2 && <div style={{ width: 8 }} />}
          </div>
        </nav>
      )}

      {/* DASHBOARD */}
      {phase === "dashboard" && (
        <CompDashboard
          compData={compData} gymnasts={gymnasts}
          compId={compId} compPin={compPin}
          eventStatus={currentEventId ? events.getAll().find(e => e.id === currentEventId)?.status : undefined}
          onStartComp={handleStartComp}
          onEditSetup={handleEditSetup}
          onManageGymnasts={handleManageGymnasts}
          onSetPin={() => {
            pinModalCallback.current = null;
            setShowPinModal(true);
          }}
          onAcceptSubmissions={(newGymnasts) => {
            setGymnastsWithSync(prev => [...prev, ...newGymnasts]);
          }}
        />
      )}

      {/* SETUP phase 1 */}
      {phase === 1 && (
        <main className="content" style={{ maxWidth: 1200 }}>
          <Step1_CompDetails data={compData} setData={setCompDataLocal} syncStatus={syncStatus} onSave={handleSaveSetup}
            onSaveExit={() => {
              // Partial save — persist and go back to organiser dashboard (event list)
              if (syncTimer.current) clearTimeout(syncTimer.current);
              pushToSupabase(compData, gymnasts, scores);
              if (currentEventId) events.snapshot(currentEventId, compData, gymnasts, scores);
              setScreen("org-dashboard");
            }}
            onNext={() => {
              // Full save — all mandatory fields complete
              if (syncTimer.current) clearTimeout(syncTimer.current);
              const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
              const isDraft = ev && ev.status === "draft";
              pushToSupabase(compData, gymnasts, scores, undefined, isDraft ? "active" : undefined);
              if (currentEventId) {
                events.snapshot(currentEventId, compData, gymnasts, scores);
                if (isDraft) events.update(currentEventId, { status: "active" });
              }
              if (!compPin) {
                pinModalCallback.current = () => setPhase("dashboard");
                setShowPinModal(true);
              } else {
                setPhase("dashboard");
              }
            }} />
        </main>
      )}

      {/* GYMNAST MANAGEMENT */}
      {phase === "gymnasts" && (
        <main className="content" style={{ maxWidth: 1200 }}>
          <Step2_Gymnasts compData={compData} setCompDataFn={setCompData} data={gymnasts} setData={setGymnastsWithSync}
            onNext={() => setPhase("dashboard")} onBack={() => setPhase("dashboard")} />
        </main>
      )}

      {/* COMPETITION phase 2 — no old sidebar, just content */}
      {phase === 2 && (
        <main className="content" style={{ maxWidth: 1200 }}>
          {step === 1 && <Phase2_Step1 compData={compData} gymnasts={gymnasts} scores={scores} setScores={setScoresWithSync} />}
          {step === 2 && <Phase2_Step2 compData={compData} gymnasts={gymnasts} scores={scores} onComplete={handleCompleteComp} />}
          {step === 3 && <Phase2_Exports compData={compData} gymnasts={gymnasts} scores={scores} />}
          {step === 4 && <MCMode compData={compData} gymnasts={gymnasts} scores={scores} />}
        </main>
      )}
    </>
  );

  return (
    <>
      <style>{css}</style>
      {currentAccount ? (
        <div className="app-shell">
          <AppSidebar screen="active" phase={phase} step={step} setStep={setStep}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection={activeSection}
            onNew={handleNew} onMyEvents={goBackToDashboard} onEditSetup={handleEditSetup}
            onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
            onDashboard={handleGoToDashboard}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout}
            gymnastsCount={gymnasts.length}
            eventStatus={currentEventId ? events.getAll().find(e => e.id === currentEventId)?.status : undefined} />
          <div className="app-main" ref={appMainRef}>
            {activeContent}
          </div>
        </div>
      ) : (
        /* Judge mode — no sidebar, current layout */
        <div className="app">
          {activeContent}
        </div>
      )}

      {currentAccount && (<>
        <MobileLogoHeader onGoHome={goBackToDashboard} />
        <MobileTabBar screen="active" phase={phase} step={step} setStep={setStep}
          onNew={handleNew} onMyEvents={goBackToDashboard} onEditSetup={handleEditSetup}
          onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
          onDashboard={handleGoToDashboard}
          onSettings={() => setShowAccountSettings(true)} onSave={handleSaveSetup} />
      </>)}

      {showAccountSettings && (
        <AccountSettingsModal
          account={currentAccount}
          profile={currentProfile}
          onSave={handleAccountSave}
          onLogout={handleLogout}
          onClose={() => setShowAccountSettings(false)}
        />
      )}

      {setupWarn && (
        <ConfirmModal message={setupWarn} confirmLabel="Yes, continue" isDanger={false}
          onConfirm={confirmSetupChange}
          onCancel={() => { setSetupWarn(null); setPendingChange(null); }} />
      )}

      {showPinModal && (
        <PinSetupModal onSet={handlePinSet} onSkip={handlePinSkip} />
      )}

      {leaveEditConfirm && (
        <ConfirmModal
          message="You have unsaved changes. Are you sure you want to leave?"
          confirmLabel="Leave" isDanger={false}
          onConfirm={() => { const fn = leaveEditConfirm; setLeaveEditConfirm(null); fn(); }}
          onCancel={() => setLeaveEditConfirm(null)}
        />
      )}
    </>
  );
}
