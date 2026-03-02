import React, { useState, useCallback, useRef, useEffect } from "react";

// ============================================================
// SUPABASE — lightweight REST client (no external imports)
// ============================================================
const SUPABASE_URL = "https://xjuwbgitqsvrmoejvzwb.supabase.co";
const SUPABASE_KEY = "sb_publishable_7jhhejhXAH8hlX-gnsElnA_1ih0G-2f";

const supabase = {
  async upsert(table, record) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(record),
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
  // Fetch submissions for a competition
  async fetchSubmissions(compId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?comp_id=eq.${compId}&order=submitted_at.desc&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { data: [], error: await res.text() };
    return { data: await res.json(), error: null };
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(patch),
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
// AUTH HELPERS — localStorage-based account management
// ============================================================
const AUTH_KEY = "gymcomp_accounts";
const SESSION_KEY = "gymcomp_session";
const EVENTS_KEY = "gymcomp_events";

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

const events = {
  getAll: () => {
    try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); } catch { return []; }
  },
  save: (allEvents) => localStorage.setItem(EVENTS_KEY, JSON.stringify(allEvents)),

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
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f; --surface: #111118; --surface2: #1a1a24; --border: #2a2a3a;
    --accent: #c8f53a; --accent2: #7c5af5; --text: #f0f0f8; --muted: #6b6b85;
    --danger: #f53a5a; --success: #3af5a0; --warn: #f5b43a;
    --radius: 8px; --font-display: 'Bebas Neue', sans-serif; --font-body: 'DM Sans', sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 100; }
  .nav-logo { font-family: var(--font-display); font-size: 28px; letter-spacing: 2px; color: var(--accent); }
  .nav-logo span { color: var(--text); }

  .main { flex: 1; display: flex; }
  .sidebar { width: 220px; min-height: calc(100vh - 65px); background: var(--surface); border-right: 1px solid var(--border); padding: 24px 0; flex-shrink: 0; }
  .sidebar-step { display: flex; align-items: center; gap: 12px; padding: 12px 24px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; color: var(--muted); font-size: 13px; font-weight: 500; }
  .sidebar-step.active { color: var(--text); border-left-color: var(--accent); background: rgba(200,245,58,0.05); }
  .sidebar-step.done { color: var(--success); }
  .step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--surface2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .sidebar-step.active .step-num { background: var(--accent); color: #000; border-color: var(--accent); }
  .sidebar-step.done .step-num { background: var(--success); color: #000; border-color: var(--success); }

  .content { flex: 1; padding: 40px; max-width: 1200px; }
  .page-header { margin-bottom: 36px; }
  .page-title { font-family: var(--font-display); font-size: 48px; letter-spacing: 2px; line-height: 1; }
  .page-title span { color: var(--accent); }
  .page-sub { color: var(--muted); margin-top: 8px; font-size: 14px; }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin-bottom: 20px; }
  .card-title { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; }

  .field { margin-bottom: 16px; }
  .label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .input, .select { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-family: var(--font-body); font-size: 14px; padding: 10px 14px; transition: border-color 0.2s; outline: none; }
  .input:focus, .select:focus { border-color: var(--accent); }
  .input::placeholder { color: var(--muted); }
  .input.error { border-color: var(--danger); }
  .select option { background: var(--surface2); }
  .field-error { font-size: 11px; color: var(--danger); margin-top: 4px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: var(--radius); border: none; font-family: var(--font-body); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px; white-space: nowrap; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover:not(:disabled) { background: #d8ff4a; transform: translateY(-1px); }
  .btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  .btn-danger { background: rgba(245,58,90,0.12); color: var(--danger); border: 1px solid rgba(245,58,90,0.3); }
  .btn-danger:hover { background: rgba(245,58,90,0.22); }
  .btn-warn { background: rgba(245,180,58,0.12); color: var(--warn); border: 1px solid rgba(245,180,58,0.3); }
  .btn-ghost { background: transparent; color: var(--muted); border: none; }
  .btn-ghost:hover { color: var(--text); }
  .btn-sm { padding: 5px 11px; font-size: 12px; }
  .btn-icon { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); color: var(--muted); cursor: pointer; transition: all 0.2s; font-size: 15px; line-height: 1; }
  .btn-icon:hover { color: var(--danger); border-color: var(--danger); background: rgba(245,58,90,0.08); }

  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; font-size: 13px; }
  .chip button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; }
  .chip button:hover { color: var(--danger); }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 24px; flex-wrap: wrap; }
  .tab-btn { padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-family: var(--font-body); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

  .list-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 6px; }
  .list-item-content { flex: 1; font-size: 14px; }

  .table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: var(--surface2); padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 9px 14px; border-bottom: 1px solid rgba(42,42,58,0.5); color: var(--text); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }

  .score-input { width: 76px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 6px 8px; outline: none; text-align: center; }
  .score-input:focus { border-color: var(--accent); }
  .score-input.de { width: 58px; }

  .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--border); border-radius: 24px; transition: 0.2s; }
  .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; }
  .toggle-switch input:checked + .toggle-slider { background: var(--accent); }
  .toggle-switch input:checked + .toggle-slider:before { transform: translateX(18px); }

  .group-header { display: flex; align-items: center; gap: 10px; padding: 6px 0; margin: 16px 0 8px; }
  .group-label { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent2); white-space: nowrap; }
  .group-line { flex: 1; height: 1px; background: var(--border); }
  .sub-group-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); margin: 10px 0 6px; }

  .badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
  .badge-gold { background: rgba(255,200,0,0.15); color: #ffc800; }
  .badge-silver { background: rgba(180,180,200,0.15); color: #b4b4c8; }
  .badge-bronze { background: rgba(180,100,40,0.15); color: #c87028; }
  .badge-rank { background: var(--surface2); color: var(--muted); }

  .summary-box { background: rgba(200,245,58,0.05); border: 1px solid rgba(200,245,58,0.2); border-radius: var(--radius); padding: 10px 16px; font-size: 13px; color: var(--accent); }
  .warn-box { background: rgba(245,180,58,0.08); border: 1px solid rgba(245,180,58,0.25); border-radius: var(--radius); padding: 12px 16px; font-size: 13px; color: var(--warn); margin-bottom: 12px; }
  .error-box { background: rgba(245,58,90,0.08); border: 1px solid rgba(245,58,90,0.25); border-radius: var(--radius); padding: 12px 16px; font-size: 13px; color: var(--danger); margin-bottom: 12px; }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.78); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 32px; max-width: 460px; width: 90%; }

  .pc-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); margin-top: 4px; overflow: hidden; }
  .pc-option { padding: 8px 14px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; color: var(--text); line-height: 1.3; }
  .pc-option:last-child { border-bottom: none; }
  .pc-option:hover { background: var(--surface); color: var(--accent); }

  .step-nav { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }

  .inline-row { display: flex; gap: 8px; align-items: flex-end; }
  .inline-row .field { margin-bottom: 0; }

  .club-edit-input { background: var(--bg); border: 1px solid var(--accent); border-radius: 6px; color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 3px 8px; outline: none; min-width: 120px; }

  .csv-zone { border: 2px dashed var(--border); border-radius: var(--radius); padding: 24px; text-align: center; color: var(--muted); font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .csv-zone:hover { border-color: var(--accent); color: var(--accent); }

  .empty { text-align: center; padding: 32px; color: var(--muted); font-size: 13px; }

  .apparatus-section { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 12px; overflow: hidden; }
  .apparatus-section-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--surface2); border-bottom: 1px solid var(--border); }
  .apparatus-section-body { padding: 12px 16px; }

  .results-level-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin-bottom: 24px; }
  .results-level-header { font-family: var(--font-display); font-size: 22px; letter-spacing: 1px; color: var(--text); margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .results-level-header span { color: var(--accent); }

  /* ============================================================
     RESPONSIVE
     ============================================================ */

  @media (max-width: 768px) {
    .nav { padding: 12px 16px; gap: 10px; }
    .nav-logo { font-size: 22px; }

    .main { flex-direction: column; }
    .sidebar {
      width: 100%; min-height: unset; border-right: none;
      border-bottom: 1px solid var(--border);
      display: flex; padding: 0; overflow-x: auto;
    }
    .sidebar-step {
      flex-direction: row; padding: 12px 16px;
      border-left: none; border-bottom: 3px solid transparent;
      white-space: nowrap; flex-shrink: 0;
    }
    .sidebar-step.active { border-left-color: transparent; border-bottom-color: var(--accent); background: rgba(200,245,58,0.05); }

    .content { padding: 20px 16px; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .card { padding: 16px; }

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
    .content { padding: 16px 12px; }
    .card { padding: 14px 12px; }

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
function Step1_CompDetails({ data, setData, onNext }) {
  const [pendingRemove, setPendingRemove] = useState(null);
  const [editingClubId, setEditingClubId] = useState(null);
  const [editingClubVal, setEditingClubVal] = useState("");
  const [newClub, setNewClub] = useState("");
  const [roundCount, setRoundCount] = useState(data.rounds.length || 1);
  const [newLevel, setNewLevel] = useState("");

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

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Competition <span>Details</span></div>
        <div className="page-sub">Set up the core details of your competition</div>
      </div>

      {/* Basic Info */}
      <div className="card">
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
      <div className="card">
        <div className="card-title">Organiser Branding</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
          Used on all printed documents — agenda, judge sheets, attendance list and results.
        </div>
        <div style={{ marginBottom: 14 }}>
          <div className="field">
            <label className="label">Organising Club / Organisation Name</label>
            <input className="input" placeholder="e.g. Midlands Gymnastics Club"
              value={data.organiserName || ""} onChange={e => setData(d => ({ ...d, organiserName: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Brand Colour</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={data.brandColour || "#c8f53a"}
                onChange={e => setData(d => ({ ...d, brandColour: e.target.value }))}
                style={{ width: 44, height: 44, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", padding: 2, background: "var(--bg)" }} />
              <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "monospace" }}>{data.brandColour || "#c8f53a"}</span>
            </div>
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label className="label">Club Logo</label>
            {data.logo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={data.logo} alt="Logo" style={{ height: 52, maxWidth: 160, objectFit: "contain", borderRadius: 6, border: "1px solid var(--border)", padding: 4, background: "#fff" }} />
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
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Appears on all printed documents</div>
          </div>
        </div>
      </div>


      <div className="card">
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
      <div className="card">
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
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
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
      <div className="card">
        <div className="card-title">Apparatus</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {APPARATUS_OPTIONS.map(a => {
            const checked = data.apparatus.includes(a);
            return (
              <label key={a} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                background: checked ? "rgba(200,245,58,0.06)" : "var(--bg)",
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
      <div className="card">
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
      <div className="card">
        <div className="card-title">Scoring Format</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

          {/* Simple option */}
          <div onClick={() => setData(d => ({ ...d, useDEScoring: false }))}
            style={{ flex: 1, minWidth: 200, cursor: "pointer", borderRadius: 10, padding: "14px 16px",
              border: `2px solid ${!data.useDEScoring ? "var(--accent)" : "var(--border)"}`,
              background: !data.useDEScoring ? "rgba(200,245,58,0.06)" : "var(--surface2)",
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
            style={{ flex: 1, minWidth: 200, cursor: "pointer", borderRadius: 10, padding: "14px 16px",
              border: `2px solid ${data.useDEScoring ? "var(--accent)" : "var(--border)"}`,
              background: data.useDEScoring ? "rgba(200,245,58,0.06)" : "var(--surface2)",
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
              <div style={{ marginTop: 10, marginLeft: 26, padding: "7px 10px", borderRadius: 6,
                background: "rgba(200,245,58,0.08)", border: "1px solid rgba(200,245,58,0.2)",
                fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
                DV (0–10) · Bonus · E scores per judge (raw, 0–10) · Time fault · OOB · Fall · Neutral deduction
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Club Submissions */}
      <div className="card">
        <div className="card-title">Club Submissions <span style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)", marginLeft: 8 }}>Optional</span></div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
          Allow clubs to submit their gymnast lists online before the competition. You review and approve each submission — nothing is added automatically.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          background: "var(--surface2)", borderRadius: 8, border: `1px solid ${data.allowSubmissions ? "rgba(200,245,58,0.4)" : "var(--border)"}` }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {data.allowSubmissions ? "Submissions open" : "Submissions closed"}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {data.allowSubmissions
                ? "Clubs can submit gymnasts via your submission link. Share the link from your Competition Dashboard."
                : "Enable this to generate a submission link you can share with clubs."}
            </div>
          </div>
          <button
            onClick={() => setData(d => ({ ...d, allowSubmissions: !d.allowSubmissions }))}
            style={{
              width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
              background: data.allowSubmissions ? "var(--accent)" : "var(--surface2)",
              position: "relative", transition: "background 0.2s",
              boxShadow: "inset 0 0 0 1.5px var(--border)"
            }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", background: data.allowSubmissions ? "#000" : "var(--muted)",
              position: "absolute", top: 3, transition: "left 0.2s",
              left: data.allowSubmissions ? 25 : 3
            }} />
          </button>
        </div>
        {data.allowSubmissions && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 6,
            background: "rgba(200,245,58,0.06)", border: "1px solid rgba(200,245,58,0.2)",
            fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
            Clubs will see your competition name, date and venue on their submission form. They select from your configured levels and age categories. You assign round and gymnast numbers during review.
          </div>
        )}
      </div>

      {/* Judges — per apparatus */}
      {data.apparatus.length > 0 && (
        <div className="card">
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
                        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
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
            <div style={{ margin: "10px 0 0", padding: "10px 14px", borderRadius: 8,
              background: "rgba(240,173,78,0.1)", border: "1px solid rgba(240,173,78,0.4)",
              fontSize: 12, color: "#c8862a" }}>
              ⚠ FIG scoring is enabled — each apparatus needs at least one E judge before scores can be entered.
              The number of E judges determines how many execution score columns appear in Score Input.
            </div>
          )}
        </div>
      )}

      <div className="step-nav">
        <div />
        <button className="btn btn-primary" onClick={onNext} disabled={!canProceed}>
          Next: Gymnast Details →
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
  const colour = compData.brandColour || "#c8f53a";
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

function printDocument(htmlContent) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to generate PDFs."); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title><style>${PRINT_BASE_CSS}</style></head><body>${htmlContent}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// Build agenda content
function buildAgendaHTML(compData, gymnasts, compId) {
  const colour = compData.brandColour || "#c8f53a";
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
    const coachQR = "https://chart.googleapis.com/chart?cht=qr&chs=" + qrSize + "x" + qrSize + "&chl=" + encodeURIComponent(coachUrl) + "&choe=UTF-8";
    const parentQR = "https://chart.googleapis.com/chart?cht=qr&chs=" + qrSize + "x" + qrSize + "&chl=" + encodeURIComponent(parentUrl) + "&choe=UTF-8";

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
  const colour = compData.brandColour || "#c8f53a";
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
  const colour = compData.brandColour || "#c8f53a";
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
  const colour = compData.brandColour || "#c8f53a";
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
      action: () => printDocument(buildResultsHTML(compData, gymnasts, scores)),
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
      action: () => printDocument(buildDiagnosticHTML(compData, gymnasts, scores)),
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
                style={{ width: "100%", background: colour, color: "#000" }}
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

      <div className="card" style={{ marginTop: 16, background: "rgba(200,245,58,0.04)", borderColor: "rgba(200,245,58,0.2)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>How it works:</strong> Documents open in a new tab formatted for printing.
          Use your browser's <strong>Print</strong> menu (Ctrl+P / ⌘P) and choose <strong>"Save as PDF"</strong> as the destination.
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
  const colour = compData.brandColour || "#c8f53a";
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
  const colour = compData.brandColour || "#c8f53a";
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
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={data.length === 0}>
          Phase 2: Competition Day →
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
        <div style={{ background: "rgba(200,245,58,0.06)", border: "1px solid rgba(200,245,58,0.2)",
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
                                        justifyContent: "center", background: appTotal > 0 ? "rgba(200,245,58,0.1)" : "var(--surface2)",
                                        borderRadius: 5, fontSize: 13, fontWeight: 800,
                                        color: appTotal > 0 ? "var(--accent)" : "var(--muted)",
                                        border: `1px solid ${appTotal > 0 ? "rgba(200,245,58,0.4)" : "var(--border)"}` }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 420 }}>
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
function Phase2_Step2({ compData, gymnasts, scores }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("apparatus");

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
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
// ============================================================
// AUTH SCREENS — Login, Register
// ============================================================
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

// ============================================================
// ORGANISER DASHBOARD — list of events for logged-in account
// ============================================================
function OrganizerDashboard({ account, onNew, onOpen, onDuplicate, onLogout, onSettings }) {
  const [myEvents, setMyEvents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const reload = () => setMyEvents(events.getForAccount(account.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));

  useEffect(() => { reload(); }, [account.id]);

  const handleStatusChange = (eventId, newStatus) => {
    events.update(eventId, { status: newStatus });
    reload();
  };

  const handleDelete = (ev) => {
    if (ev.status !== "archived") {
      // First archive it
      events.update(ev.id, { status: "archived" });
      reload();
      return;
    }
    setDeleteConfirm(ev);
  };

  const confirmDelete = () => {
    events.remove(deleteConfirm.id);
    setDeleteConfirm(null);
    reload();
  };

  const getPublicLink = (ev) => `${window.location.origin}/results.html?comp=${ev.compId}`;

  const copyLink = async (ev) => {
    const link = getPublicLink(ev);
    try { await navigator.clipboard.writeText(link); } catch {}
    // Show brief feedback
    setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: true } : e));
    setTimeout(() => setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: false } : e)), 1800);
  };

  const filtered = statusFilter === "all" ? myEvents : myEvents.filter(e => e.status === statusFilter);

  return (
    <div style={{ flex: 1, padding: "32px 40px", maxWidth: 900, margin: "0 auto", width: "100%" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, letterSpacing: 2, lineHeight: 1, marginBottom: 6 }}>
            My Competitions
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {account.name}{account.clubName ? ` · ${account.clubName}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={onSettings}>⚙ Account</button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign Out</button>
          <button className="btn btn-primary" onClick={onNew} style={{ letterSpacing: 0.5 }}>+ New Competition</button>
        </div>
      </div>

      {/* Status filter tabs */}
      {myEvents.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {[{ value: "all", label: `All (${myEvents.length})` }, ...EVENT_STATUSES.map(s => ({ value: s.value, label: `${s.label} (${myEvents.filter(e => e.status === s.value).length})` }))].map(tab => (
            <button key={tab.value}
              className={`btn btn-sm ${statusFilter === tab.value ? "btn-secondary" : "btn-ghost"}`}
              onClick={() => setStatusFilter(tab.value)}
              style={{ fontSize: 12 }}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Events list */}
      {myEvents.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 48, color: "var(--muted)", marginBottom: 16 }}>🏅</div>
          <div style={{ color: "var(--text)", fontSize: 16, marginBottom: 8 }}>No competitions yet</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>Create your first competition to get started</div>
          <button className="btn btn-primary" onClick={onNew}>+ New Competition</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 24px", color: "var(--muted)" }}>
          No {statusFilter} competitions
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(ev => {
            const cd = ev.snapshot?.compData || {};
            const sm = statusMeta(ev.status);
            const gymnasts = ev.snapshot?.gymnasts || [];
            const isCompleted = ev.status === "completed" || ev.status === "archived";
            return (
              <div key={ev.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                  {/* Status stripe */}
                  <div style={{ width: 5, background: sm.color, flexShrink: 0, borderRadius: "var(--radius) 0 0 var(--radius)" }} />

                  {/* Main content */}
                  <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>
                          {cd.name || "Untitled Competition"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                          {cd.date && <span>📅 {new Date(cd.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
                          {cd.location && <span>📍 {cd.location}</span>}
                          {gymnasts.length > 0 && <span>👤 {gymnasts.length} gymnast{gymnasts.length !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>

                      {/* Status selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                        <select
                          value={ev.status}
                          onChange={e => handleStatusChange(ev.id, e.target.value)}
                          style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}>
                          {EVENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      {!isCompleted && (
                        <button className="btn btn-primary btn-sm" onClick={() => onOpen(ev)}>
                          {ev.status === "active" ? "Continue →" : "Open →"}
                        </button>
                      )}
                      {isCompleted && (
                        <button className="btn btn-secondary btn-sm" onClick={() => onOpen(ev)}>
                          View Results →
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => onDuplicate(ev)} title="Duplicate as new competition">
                        ⧉ Duplicate
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => copyLink(ev)} title="Copy public results link">
                        {ev._copied ? "✅ Copied!" : "🔗 Share Link"}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", color: ev.status === "archived" ? "var(--danger)" : "var(--muted)" }}
                        onClick={() => handleDelete(ev)} title={ev.status === "archived" ? "Delete permanently" : "Archive"}>
                        {ev.status === "archived" ? "🗑 Delete" : "Archive"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <ConfirmModal
          message={`Permanently delete "${deleteConfirm.snapshot?.compData?.name || "this competition"}"? This cannot be undone.`}
          confirmLabel="Delete permanently"
          isDanger={true}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// ACCOUNT SETTINGS MODAL
// ============================================================
function AccountSettingsModal({ account, onSave, onDelete, onClose }) {
  const [name, setName] = useState(account.name || "");
  const [clubName, setClubName] = useState(account.clubName || "");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const handleSave = () => {
    setError(""); setSuccess("");
    if (!name.trim()) { setError("Name cannot be empty."); return; }

    let updates = { name: name.trim(), clubName: clubName.trim() };

    if (oldPwd || newPwd || confirmPwd) {
      if (hashPassword(oldPwd) !== account.passwordHash) { setError("Current password is incorrect."); return; }
      if (newPwd.length < 6) { setError("New password must be at least 6 characters."); return; }
      if (newPwd !== confirmPwd) { setError("New passwords don't match."); return; }
      updates.passwordHash = hashPassword(newPwd);
    }

    const { account: updated, error: err } = auth.updateAccount(account.email, updates);
    if (err) { setError(err); return; }
    auth.setSession(updated);
    setSuccess("Changes saved.");
    setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    onSave(updated);
  };

  const handleDelete = () => {
    if (deleteConfirmText !== "DELETE") { setError("Type DELETE to confirm."); return; }
    auth.deleteAccount(account.email);
    auth.clearSession();
    onDelete();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: 1 }}>Account Settings</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 6 }}>Club / Organisation</label>
            <input className="input" value={clubName} onChange={e => setClubName(e.target.value)} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", marginBottom: 14 }}>Change Password</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="input" type="password" placeholder="Current password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
              <input className="input" type="password" placeholder="New password (min 6 chars)" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              <input className="input" type="password" placeholder="Confirm new password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}
          {success && <div style={{ color: "var(--success)", fontSize: 13, padding: "10px 14px", background: "rgba(100,220,130,0.1)", borderRadius: 6, border: "1px solid var(--success)" }}>{success}</div>}

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleSave}>
            Save Changes
          </button>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            {!showDelete ? (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setShowDelete(true)}>
                Delete Account…
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, color: "var(--danger)" }}>This will permanently delete your account and all event records. Type <strong>DELETE</strong> to confirm.</div>
                <input className="input" placeholder="Type DELETE" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowDelete(false); setDeleteConfirmText(""); setError(""); }}>Cancel</button>
                  <button className="btn btn-sm" style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer" }} onClick={handleDelete}>
                    Delete Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tiny inline QR code component (uses Google Charts API — works when printed/opened online) ──
function QRDisplay({ url, size = 120, label }) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(url)}&choe=UTF-8`;
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

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
  const submitUrl = `${origin}/submit.html?comp=${compId}`;
  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (inSandbox) { setPendingCount(2); return; } // demo count in sandbox
    supabase.fetchSubmissions(compId).then(({ data }) => {
      if (data) setPendingCount(data.filter(s => s.status === "pending").length);
    });
  }, [compId]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(submitUrl); } catch {}
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleAccept = (newGymnasts) => {
    onAcceptGymnasts(newGymnasts);
    // Refresh count
    if (!inSandbox) {
      supabase.fetchSubmissions(compId).then(({ data }) => {
        if (data) setPendingCount(data.filter(s => s.status === "pending").length);
      });
    }
  };

  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--muted)", marginBottom: 14 }}>
          Club Submissions
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* QR + link */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Submission Link</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Share this with club contacts so they can submit their gymnast list before the competition.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div style={{ flex: 1, fontSize: 11, color: "var(--muted)", background: "var(--surface2)", borderRadius: 6, padding: "7px 10px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {submitUrl}
                </div>
                <button onClick={copyLink} className="btn btn-primary btn-sm" style={{ flexShrink: 0, fontSize: 11 }}>
                  {linkCopied ? "✅ Copied!" : "📋 Copy"}
                </button>
              </div>
            </div>
            {/* QR */}
            <QRDisplay url={submitUrl} size={110} label="Scan to submit" />
          </div>

          {/* Review button with badge */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {pendingCount === null ? "Loading…" : pendingCount === 0 ? "No pending submissions" : (
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>⚡ {pendingCount} submission{pendingCount !== 1 ? "s" : ""} awaiting review</span>
              )}
            </div>
            <button onClick={() => setShowReview(true)} className="btn btn-secondary btn-sm" style={{ fontSize: 12 }}>
              Review Submissions {pendingCount > 0 && <span style={{ marginLeft: 6, background: "var(--accent)", color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{pendingCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {showReview && (
        <SubmissionsReviewPanel
          compId={compId}
          compData={compData}
          gymnasts={gymnasts}
          onAccept={handleAccept}
          onClose={() => setShowReview(false)}
        />
      )}
    </>
  );
}

function CompDashboard({ compData, gymnasts, compId, compPin, onStartComp, onEditSetup, onAcceptSubmissions }) {
  const [showId, setShowId] = useState(false);
  const totalGymnasts = gymnasts.length;
  const clubs = [...new Set(gymnasts.map(g => g.club))].filter(Boolean);
  const hasGymnasts = gymnasts.length > 0;
  const hasApparatus = (compData.apparatus || []).length > 0;
  const colour = compData.brandColour || "#c8f53a";

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
          style={{ background: colour, color: "#000", flexShrink: 0 }}
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

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div className="dash-hero-title" style={{ fontFamily: "var(--font-display)", fontSize: 58, letterSpacing: 3, lineHeight: 1, marginBottom: 12 }}>
            {compData.name}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            {compData.date && <span>📅 {new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>}
            {compData.location && <span>📍 {compData.location}</span>}
            {compData.holder && <span>👤 {compData.holder}</span>}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
          {statCard("Gymnasts", totalGymnasts, "var(--accent)")}
          {statCard("Clubs", clubs.length)}
          {statCard("Levels", compData.levels.length)}
          {statCard("Apparatus", compData.apparatus.length)}
        </div>

        {/* ── PRE-COMPETITION DOCUMENTS ─────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--muted)", marginBottom: 14 }}>
            Pre-Competition Documents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {docBtn("📋", "Competition Agenda",
              hasGymnasts,
              () => printDocument(buildAgendaHTML(compData, gymnasts, compId)),
              "Add gymnasts in Setup to generate"
            )}
            {docBtn("✍️", "Judge Score Sheets",
              hasGymnasts && hasApparatus,
              () => printDocument(buildJudgeSheetsHTML(compData, gymnasts)),
              "Add gymnasts and apparatus in Setup"
            )}
            {docBtn("✅", "Attendance List",
              hasGymnasts,
              () => printDocument(buildAttendanceHTML(compData, gymnasts)),
              "Add gymnasts in Setup to generate"
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            Documents open in a new tab — use Ctrl+P / ⌘P → Save as PDF
          </div>
        </div>

        {/* ── CLUB SUBMISSIONS ──────────────────────────────────── */}
        {compData.allowSubmissions && compId && (
          <SubmissionsDashboardSection compId={compId} compData={compData} gymnasts={gymnasts} onAcceptGymnasts={onAcceptSubmissions} />
        )}

        {/* ── LIVE VIEWS + QR CODES ─────────────────────────────── */}
        {compId && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--muted)", marginBottom: 14 }}>
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
        <div style={{ background: `${colour}12`, border: `1px solid ${colour}33`, borderRadius: "var(--radius)", padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Ready to begin?</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Opens the scoring interface — you can return here any time via "← Dashboard"</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <button className="btn btn-primary" style={{ fontSize: 16, padding: "14px 36px", letterSpacing: 1, background: colour, color: "#000" }}
              onClick={onStartComp}>
              Start Competition →
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onEditSetup} style={{ fontSize: 11 }}>
              Edit setup
            </button>
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
              <div style={{ fontSize: 13, color: compPin ? "var(--success)" : "var(--muted)" }}>
                {compPin ? "🔒 PIN set" : "🔓 No PIN"}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", width: "100%" }}>
              Save your Competition ID to resume this session from any device
            </div>
          </div>
        )}

      </div>
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
      gymnasts: filled.map(g => ({ id: generateId(), name: g.name.trim(), level: g.level, ageCategory: g.ageCategory })),
      submitted_at: new Date().toISOString(),
      status: "pending",
    };

    const { error } = await supabase.insertSubmission(submission);
    setSubmitting(false);
    if (error) { setFormError("Submission failed — please try again or contact the organiser."); return; }
    setSubmitted(true);
  };

  const colour = compConfig?.brandColour || "#c8f53a";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <div style={{ fontSize: 14, color: "#888" }}>Loading competition details…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", color: "#fff", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Unable to load</div>
        <div style={{ color: "#888", fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", color: "#fff", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎉</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color: colour, marginBottom: 8 }}>Submitted!</div>
        <div style={{ color: "#aaa", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          Your gymnast list has been sent to the organiser for review.
          You will be contacted if any details need to be confirmed.
        </div>
        <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "#ccc", textAlign: "left" }}>
          <strong style={{ color: "#fff" }}>{compConfig.name}</strong><br />
          {compConfig.date && <span style={{ color: "#888", fontSize: 12 }}>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>}<br />
          <span style={{ color: colour, fontWeight: 600, marginTop: 8, display: "block" }}>
            {gymnasts.filter(g => g.name.trim()).length} gymnast{gymnasts.filter(g => g.name.trim()).length !== 1 ? "s" : ""} submitted from {clubName}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `3px solid ${colour}`, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        {compConfig.logo && <img src={compConfig.logo} alt="Logo" style={{ height: 44, objectFit: "contain" }} />}
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: colour }}>{compConfig.name}</div>
          <div style={{ fontSize: 13, color: "#888", display: "flex", gap: 16, marginTop: 2 }}>
            {compConfig.date && <span>📅 {new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
            {(compConfig.venue || compConfig.location) && <span>📍 {compConfig.venue || compConfig.location}</span>}
          </div>
        </div>
        <div style={{ marginLeft: "auto", background: colour + "22", border: "1px solid " + colour + "44", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: colour, letterSpacing: 1, textTransform: "uppercase" }}>
          Gymnast Submission
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>

        {/* Club details */}
        <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, color: colour }}>Club Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Club Name <span style={{ color: colour }}>*</span>
              </label>
              <input
                style={{ width: "100%", padding: "10px 14px", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }}
                placeholder="e.g. Acton Gymnastics Club"
                value={clubName}
                onChange={e => setClubName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Contact Name <span style={{ color: "#555", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                style={{ width: "100%", padding: "10px 14px", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }}
                placeholder="Your name"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Gymnast list */}
        <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: colour }}>
              Gymnasts <span style={{ fontSize: 13, fontWeight: 400, color: "#666" }}>({gymnasts.filter(g => g.name.trim()).length} entered)</span>
            </div>
            <button onClick={addGymnast}
              style={{ padding: "7px 14px", background: colour, color: "#000", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              + Add gymnast
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gymnasts.map((g, idx) => (
              <div key={g.id} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#666", flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <input
                    style={{ flex: 1, padding: "8px 12px", background: "#222", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 14 }}
                    placeholder="Full name"
                    value={g.name}
                    onChange={e => updateGymnast(g.id, "name", e.target.value)}
                  />
                  {gymnasts.length > 1 && (
                    <button onClick={() => removeGymnast(g.id)}
                      style={{ width: 28, height: 28, background: "transparent", border: "1px solid #333", borderRadius: 6, color: "#666", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "#666", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                      Level <span style={{ color: colour }}>*</span>
                    </label>
                    <select
                      style={{ width: "100%", padding: "8px 12px", background: "#222", border: "1px solid #333", borderRadius: 6, color: g.level ? "#fff" : "#666", fontSize: 13 }}
                      value={g.level}
                      onChange={e => updateGymnast(g.id, "level", e.target.value)}>
                      <option value="">Select level…</option>
                      {(compConfig.levels || []).map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  {(compConfig.levels || []).some(l => l.rankBy === "level+age") && (
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "#666", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                        Age Category
                      </label>
                      <select
                        style={{ width: "100%", padding: "8px 12px", background: "#222", border: "1px solid #333", borderRadius: 6, color: g.ageCategory ? "#fff" : "#666", fontSize: 13 }}
                        value={g.ageCategory}
                        onChange={e => updateGymnast(g.id, "ageCategory", e.target.value)}>
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
          <div style={{ background: "rgba(220,53,69,0.12)", border: "1px solid rgba(220,53,69,0.4)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>
            ⚠ {formError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: "100%", padding: "16px", background: colour, color: "#000", border: "none", borderRadius: 10,
            fontWeight: 800, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
          {submitting ? "Submitting…" : "Submit Gymnast List"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "#555", marginTop: 16 }}>
          Powered by GYMCOMP · Your details will only be used for this competition
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUBMISSIONS REVIEW PANEL — organiser reviews pending submissions
// ============================================================
function SubmissionsReviewPanel({ compId, compData, gymnasts, onAccept, onClose }) {
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
    const { data } = await supabase.fetchSubmissions(compId);
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

    if (!inSandbox) {
      await supabase.updateSubmission(sub.id, { status: "accepted" });
    }
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "accepted" } : x));
    setProcessing(null);
  };

  const declineSubmission = async (sub) => {
    setProcessing(sub.id);
    if (!inSandbox) {
      await supabase.updateSubmission(sub.id, { status: "declined" });
    }
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "declined" } : x));
    setProcessing(null);
  };

  const colour = compData.brandColour || "#c8f53a";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200,
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
          <div style={{ margin: "12px 24px 0", padding: "8px 12px", background: "rgba(200,245,58,0.08)", border: "1px solid rgba(200,245,58,0.2)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }}>
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
                        style={{ fontSize: 12, background: colour, color: "#000" }}>
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
                <div key={sub.id} style={{ padding: "10px 14px", background: "rgba(200,245,58,0.05)", border: "1px solid rgba(200,245,58,0.2)", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
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

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (inSandbox) { setLoading(false); return; }
    supabase.fetchList("competitions").then(({ data }) => {
      setRecentComps(data || []);
      setLoading(false);
    });
  }, []);

  const handleResume = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setResuming(true);
    const { data, error } = await supabase.fetchOne("competitions", id);
    setResuming(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    if (pin && pin !== resumePin) { setResumeError("Incorrect PIN."); return; }
    onResume(id, data.data);
  };

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
              value={resumeId} onChange={e => setResumeId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResume()} />
            <input className="input" placeholder="PIN (if set)" style={{ flex: 1, minWidth: 100 }}
              type="password" maxLength={4}
              value={resumePin} onChange={e => setResumePin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResume()} />
            <button className="btn btn-secondary" onClick={handleResume} disabled={resuming || !resumeId.trim()}>
              {resuming ? "Loading…" : "Open →"}
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
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginBottom: 8 }}>Set a PIN</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.7 }}>
          Protect this competition with a 4-digit PIN. Anyone resuming it will need the PIN to make changes. The public results page is always open.
        </div>
        <div className="field">
          <label className="label">PIN (4 digits)</label>
          <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="e.g. 1234"
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,""))} />
        </div>
        <div className="field">
          <label className="label">Confirm PIN</label>
          <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="Repeat PIN"
            value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g,""))}
            onKeyDown={e => e.key === "Enter" && handleSet()} />
        </div>
        {err && <div className="field-error" style={{ marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSet}>Set PIN</button>
          <button className="btn btn-ghost" onClick={onSkip}>Skip — no PIN</button>
        </div>
      </div>
    </div>
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

  // Use Blob URL — avoids popup blockers and works reliably cross-browser
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Clean up the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
// APP ROOT
// ============================================================
export default function App() {
  // Auth state
  const [currentAccount, setCurrentAccount] = useState(() => auth.getSession());
  // "auth-login" | "auth-register" | "org-dashboard" | "home" | "new-pin" | "active"
  const [screen, setScreen] = useState(() => {
    const session = auth.getSession();
    return session ? "org-dashboard" : "auth-login";
  });
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  // Current event record (from events store) — links comp to account
  const [currentEventId, setCurrentEventId] = useState(null);

  const [phase, setPhase] = useState(1);
  const [step, setStep] = useState(1);
  const [setupWarn, setSetupWarn] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);

  // Supabase sync state
  const [compId, setCompId] = useState(() => generateId());
  const [compPin, setCompPin] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [shareUrl, setShareUrl] = useState(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showCompId, setShowCompId] = useState(false);
  const syncTimer = useRef(null);

  const [compData, setCompDataRaw] = useState({
    name: "", location: "", date: "", holder: "",
    organiserName: "", venue: "", brandColour: "#c8f53a", logo: "",
    useDEScoring: false, allowSubmissions: false,
    clubs: [], rounds: [], apparatus: [], levels: [], judges: []
  });
  const [gymnasts, setGymnasts] = useState([]);
  const [scores, setScores] = useState({});

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  // ---- Supabase sync ----
  const pushToSupabase = useCallback(async (nextCompData, nextGymnasts, nextScores, pin) => {
    if (inSandbox) { setSyncStatus("sandbox"); return; }
    setSyncStatus("saving");
    try {
      const payload = { compData: nextCompData, gymnasts: nextGymnasts, scores: nextScores, pin: pin ?? compPin };
      const { error } = await supabase.upsert("competitions", { id: compId, data: payload });
      if (error) throw new Error(error);
      setSyncStatus("saved");
    } catch (e) {
      console.error("Supabase sync failed:", e.message);
      setSyncStatus("error");
    }
  }, [compId, compPin, inSandbox]);

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
    scheduleSync(pendingChange, gymnasts, scores);
    setSetupWarn(null);
    setPendingChange(null);
  };

  // ---- Auth actions ----
  const handleLogin = (account) => {
    setCurrentAccount(account);
    setScreen("org-dashboard");
  };

  const handleLogout = () => {
    auth.clearSession();
    setCurrentAccount(null);
    setCurrentEventId(null);
    setScreen("auth-login");
  };

  const handleAccountSave = (updated) => {
    setCurrentAccount(updated);
  };

  // ---- New competition flow ----
  const handleNew = () => {
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#c8f53a", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
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

    setScreen("new-pin");
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
      setPhase("dashboard"); setStep(1);
      setSyncStatus("saved");
    } else {
      // No snapshot yet — start fresh setup
      setCompId(ev.compId);
      setCompPin(null);
      setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#c8f53a", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
      setGymnasts([]);
      setScores({});
      setPhase(1); setStep(1);
      setSyncStatus("idle");
    }
    setCurrentEventId(ev.id);

    // Mark active if still draft
    if (ev.status === "draft") events.update(ev.id, { status: "active" });

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
      : { name:"Copy", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#c8f53a", logo:"", clubs:[], rounds:[], apparatus:[], levels:[], judges:[] };
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

    setScreen("new-pin");
  };

  const handlePinSet = (pin) => { setCompPin(pin); setScreen("active"); };
  const handlePinSkip = () => { setCompPin(null); setScreen("active"); };

  // ---- Resume competition (PIN-only path for judges / no-account users) ----
  const handleResume = (id, savedData) => {
    setCompId(id);
    setCompPin(savedData.pin || null);
    setCompDataRaw(savedData.compData || {});
    setGymnasts(savedData.gymnasts || []);
    setScores(savedData.scores || {});
    setPhase("dashboard"); setStep(1);
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

  const phase1Steps = [
    { label: "Competition Details", done: !!(compData.name && compData.date) },
    { label: "Gymnast Details", done: gymnasts.length > 0 },
  ];
  const phase2Steps = [
    { label: "Score Input", done: Object.keys(scores).length > 0 },
    { label: "Results", done: false },
    { label: "Exports & Docs", done: false },
    { label: "MC Mode", done: false },
  ];

  const syncDot = { idle:null, saving:"🟡", saved:"🟢", error:"🔴", sandbox:"⚪" }[syncStatus];
  const syncLabel = { idle:"", saving:"Saving…", saved:"Saved ✓", error:"Sync error", sandbox:"Preview mode" }[syncStatus];

  // ---- AUTH SCREENS ----
  if (screen === "auth-login") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <nav className="nav">
            <div className="nav-logo">GYMCOMP<span>.</span></div>
            <div />
            <div />
          </nav>
          <LoginScreen
            onLogin={handleLogin}
            onGoRegister={() => setScreen("auth-register")}
          />
        </div>
      </>
    );
  }

  if (screen === "auth-register") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <nav className="nav">
            <div className="nav-logo">GYMCOMP<span>.</span></div>
            <div />
            <div />
          </nav>
          <RegisterScreen
            onRegister={handleLogin}
            onGoLogin={() => setScreen("auth-login")}
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
        <div className="app">
          <nav className="nav">
            <div className="nav-logo">GYMCOMP<span>.</span></div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Organiser Portal</div>
            <div />
          </nav>
          <OrganizerDashboard
            account={currentAccount}
            onNew={handleNew}
            onOpen={handleOpenEvent}
            onDuplicate={handleDuplicateEvent}
            onLogout={handleLogout}
            onSettings={() => setShowAccountSettings(true)}
          />
          {showAccountSettings && (
            <AccountSettingsModal
              account={currentAccount}
              onSave={handleAccountSave}
              onDelete={handleLogout}
              onClose={() => setShowAccountSettings(false)}
            />
          )}
        </div>
      </>
    );
  }

  // ---- HOME (no-account / judge path) ----
  if (screen === "home") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <nav className="nav">
            <div className="nav-logo">GYMCOMP<span>.</span></div>
            <div />
            <button className="btn btn-ghost btn-sm" onClick={() => setScreen("auth-login")}>Sign In</button>
          </nav>
          <HomeScreen onNew={handleNew} onResume={handleResume} />
        </div>
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
  return (
    <>
      <style>{css}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-logo" style={{ cursor: "pointer" }} onClick={() => {
            if (currentAccount) setScreen("org-dashboard");
            else setScreen("home");
          }}>GYMCOMP<span>.</span></div>

          <div className="nav-centre" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
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
            {currentAccount && (
              <button className="btn btn-ghost btn-sm" onClick={() => setScreen("org-dashboard")} style={{ fontSize: 11 }}>
                ← My Events
              </button>
            )}
            {phase === 2 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResultsPDF(compData, gymnasts, scores)}>
                  🖨 Export PDF
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleShare}>
                  🔗 Share Results
                </button>
              </>
            )}
            {phase === 2 ? (
              <button className="btn btn-secondary btn-sm" onClick={() => { setPhase("dashboard"); setStep(1); }}>
                ← Dashboard
              </button>
            ) : phase === "dashboard" ? (
              <button className="btn btn-secondary btn-sm" onClick={() => { setPhase(1); setStep(1); }}>
                ← Edit Setup
              </button>
            ) : (
              <div style={{ width: 80 }} />
            )}
          </div>
        </nav>

        {/* SHARE TOAST */}
        {showShareToast && (
          <div style={{
            position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
            background: "var(--accent)", color: "#000", borderRadius: 8, padding: "12px 24px",
            fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxWidth: "90vw", textAlign: "center", lineHeight: 1.6
          }}>
            ✅ Link copied — share with parents<br />
            <span style={{ fontWeight: 400, wordBreak: "break-all", fontSize: 11 }}>{shareUrl}</span>
          </div>
        )}

        {/* DASHBOARD */}
        {phase === "dashboard" && (
          <CompDashboard
            compData={compData} gymnasts={gymnasts}
            compId={compId} compPin={compPin}
            onStartComp={() => { setPhase(2); setStep(1); }}
            onEditSetup={() => { setPhase(1); setStep(1); }}
            onAcceptSubmissions={(newGymnasts) => {
              setGymnastsWithSync(prev => [...prev, ...newGymnasts]);
            }}
          />
        )}

        {/* SETUP phase 1 */}
        {phase === 1 && (
          <div className="main">
            <aside className="sidebar">
              {phase1Steps.map((s, i) => (
                <div key={i}
                  className={`sidebar-step ${step === i+1 ? "active" : ""} ${s.done && step !== i+1 ? "done" : ""}`}
                  onClick={() => setStep(i+1)}>
                  <div className="step-num">{s.done && step !== i+1 ? "✓" : i+1}</div>
                  <span>{s.label}</span>
                </div>
              ))}
            </aside>
            <main className="content">
              {step === 1 && <Step1_CompDetails data={compData} setData={setCompData} onNext={() => setStep(2)} />}
              {step === 2 && <Step2_Gymnasts compData={compData} setCompDataFn={setCompData} data={gymnasts} setData={setGymnastsWithSync}
                onNext={() => setPhase("dashboard")} onBack={() => setStep(1)} />}
            </main>
          </div>
        )}

        {/* COMPETITION phase 2 */}
        {phase === 2 && (
          <div className="main">
            <aside className="sidebar">
              {phase2Steps.map((s, i) => (
                <div key={i}
                  className={`sidebar-step ${step === i+1 ? "active" : ""} ${s.done && step !== i+1 ? "done" : ""}`}
                  onClick={() => setStep(i+1)}>
                  <div className="step-num">{s.done && step !== i+1 ? "✓" : i+1}</div>
                  <span>{s.label}</span>
                </div>
              ))}
            </aside>
            <main className="content">
              {step === 1 && <Phase2_Step1 compData={compData} gymnasts={gymnasts} scores={scores} setScores={setScoresWithSync} />}
              {step === 2 && <Phase2_Step2 compData={compData} gymnasts={gymnasts} scores={scores} />}
              {step === 3 && <Phase2_Exports compData={compData} gymnasts={gymnasts} scores={scores} />}
              {step === 4 && <MCMode compData={compData} gymnasts={gymnasts} scores={scores} />}
            </main>
          </div>
        )}
      </div>

      {setupWarn && (
        <ConfirmModal message={setupWarn} confirmLabel="Yes, continue" isDanger={false}
          onConfirm={confirmSetupChange}
          onCancel={() => { setSetupWarn(null); setPendingChange(null); }} />
      )}
    </>
  );
}
