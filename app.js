/* CS Network Board — vanilla JS
 * Reads live from Supabase (publishable key). Narrow writes:
 *   - interactions (log a touch)
 *   - dashboard_state (top-10 order/why, calendar notes, list pins)
 */

// ---------- Config ----------
const SUPABASE_URL = "https://fpgcorarhyopljrwjzls.supabase.co";
const SUPABASE_KEY = "sb_publishable_BM8Y63T9YuXj4q-dZzgejA_oJVBMWYm";
const REST = SUPABASE_URL + "/rest/v1";
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: "Bearer " + SUPABASE_KEY,
  "Content-Type": "application/json",
  "Range-Unit": "items",
  Prefer: "return=representation",
};
const AUTHOR = "board-web";

// ---------- REST helpers with retry ----------
async function req(path, opts = {}, retries = 4) {
  const url = REST + path;
  const merged = {
    ...opts,
    headers: { ...HEADERS, Range: "0-99999", ...(opts.headers || {}) },
  };
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, merged);
      if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}: ${await r.text()}`);
      if (r.status === 204) return null;
      const ct = r.headers.get("content-type") || "";
      return ct.includes("application/json") ? r.json() : r.text();
    } catch (e) {
      lastErr = e;
      await new Promise(res => setTimeout(res, 200 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ---------- Date helpers ----------
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const YEAR_NOW = TODAY.getFullYear();

function iso(d)  { return d.toISOString().slice(0, 10); }
function parseD(s){ if (!s) return null; const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function daysSince(s){ const d = parseD(s); if (!d) return null; return Math.floor((TODAY - d)/86400000); }
function fmtDate(s, includeYearWhenPast=true){
  const d = parseD(s); if (!d) return "";
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  const md = `${d.getMonth()+1}/${d.getDate()}`;
  const showYear = includeYearWhenPast && d.getFullYear() !== YEAR_NOW;
  return `${wd} ${md}${showYear ? "/"+String(d.getFullYear()).slice(2) : ""}`;
}
function fmtShort(s){
  const d = parseD(s); if (!d) return "—";
  const md = `${d.getMonth()+1}/${d.getDate()}`;
  return d.getFullYear() !== YEAR_NOW ? `${md}/${String(d.getFullYear()).slice(2)}` : md;
}
function mondayOf(d){ const c=new Date(d); const day=(c.getDay()+6)%7; c.setDate(c.getDate()-day); c.setHours(0,0,0,0); return c; }

// Yom Kippur and Rosh Hashanah observance dates (Gregorian). Extend as needed.
const YOM_KIPPUR_DATES = {
  2025: "2025-10-02",
  2026: "2026-09-21",
  2027: "2027-10-11",
  2028: "2028-09-30",
  2029: "2029-09-19",
  2030: "2030-10-07",
};
const ROSH_HASHANAH_DATES = {
  2025: "2025-09-23",
  2026: "2026-09-12",
  2027: "2027-10-02",
  2028: "2028-09-21",
  2029: "2029-09-10",
  2030: "2030-09-28",
};
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Returns holiday info for the week starting `monday`, or null.
// Shape: { name, dates: [Date, ...] } — dates is the specific day(s) affected.
// Rendering never blanks the whole week; only the listed day(s) are surfaced.
function holidayForWeek(monday){
  const yr = monday.getFullYear();
  const wkStart = new Date(monday); wkStart.setHours(0,0,0,0);
  const wkEnd = new Date(monday); wkEnd.setDate(wkEnd.getDate()+6); wkEnd.setHours(23,59,59,999);
  const inWeek = (d) => d >= wkStart && d <= wkEnd;

  // Fixed-date holidays — surface just the day
  const july4 = new Date(yr, 6, 4);
  if (inWeek(july4)) return { name: "July 4", dates: [july4] };
  const xmas = new Date(yr, 11, 25);
  if (inWeek(xmas)) return { name: "Christmas", dates: [xmas] };
  const nye = new Date(yr, 11, 31);
  if (inWeek(nye)) return { name: "New Year's Eve", dates: [nye] };
  const nyd = new Date(yr, 0, 1);
  if (inWeek(nyd)) return { name: "New Year's Day", dates: [nyd] };
  const nydNext = new Date(yr+1, 0, 1);
  if (inWeek(nydNext)) return { name: "New Year's Day", dates: [nydNext] };

  // Memorial Day: last Monday of May
  const memDay = (() => {
    const d = new Date(yr, 4, 31);
    while (d.getDay() !== 1) d.setDate(d.getDate()-1);
    return d;
  })();
  if (inWeek(memDay)) return { name: "Memorial Day", dates: [memDay] };
  // Labor Day: 1st Monday of September
  const labor = (() => {
    const d = new Date(yr, 8, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate()+1);
    return d;
  })();
  if (inWeek(labor)) return { name: "Labor Day", dates: [labor] };
  // Indigenous Peoples' Day / Columbus Day: 2nd Monday of October
  const indig = (() => {
    const d = new Date(yr, 9, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate()+1);
    d.setDate(d.getDate()+7);
    return d;
  })();
  if (inWeek(indig)) return { name: "Indigenous Peoples' Day", dates: [indig] };
  // Thanksgiving: 4th Thursday of November (Thu–Fri closed)
  const thx = (() => {
    const d = new Date(yr, 10, 1);
    while (d.getDay() !== 4) d.setDate(d.getDate()+1);
    d.setDate(d.getDate()+21);
    return d;
  })();
  if (inWeek(thx)) {
    const fri = new Date(thx); fri.setDate(fri.getDate()+1);
    // Thanksgiving week is treated as quiet by default (no suggestions, muted styling).
    return { name: "Thanksgiving", dates: [thx, fri], quiet: true };
  }

  // Yom Kippur
  const ykIso = YOM_KIPPUR_DATES[yr] || YOM_KIPPUR_DATES[yr+1];
  if (ykIso) {
    const yk = parseD(ykIso);
    if (inWeek(yk)) return { name: "Yom Kippur", dates: [yk] };
  }
  // Rosh Hashanah (day 1; include day 2 if also in-week)
  const rhIso = ROSH_HASHANAH_DATES[yr] || ROSH_HASHANAH_DATES[yr+1];
  if (rhIso) {
    const rh = parseD(rhIso);
    if (inWeek(rh)) {
      const rh2 = new Date(rh); rh2.setDate(rh2.getDate()+1);
      const dates = inWeek(rh2) ? [rh, rh2] : [rh];
      return { name: "Rosh Hashanah", dates };
    }
  }

  return null;
}

// Format a holiday's affected day(s) as "Thu 11/26" or "Thu 11/26–Fri 11/27".
function formatHolidayDays(dates){
  const one = (d) => `${DAY_NAMES[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;
  if (!dates || !dates.length) return "";
  if (dates.length === 1) return one(dates[0]);
  return `${one(dates[0])}–${one(dates[dates.length-1])}`;
}

// ---------- State ----------
const S = {
  contacts: [],
  contactById: {},
  interactions: [],
  events: [],
  invitees: [],
  followups: [],       // followups rows (Follow-Ups tab)
  lastByContact: {},   // contact_id -> most recent interaction date
  golfWith: new Set(), // contact_ids that ever played golf with CS
  ds: {},              // dashboard_state
};

// ---------- Load everything ----------
async function loadAll() {
  const contactCols = "id,full_name,company,title,city,state,tags,priority,preferred_formats,memberships,personal_interests,frequency,industry";
  const [contacts, interactions, events, invitees, dsRows, followups] = await Promise.all([
    req(`/contacts?select=${contactCols}&order=full_name.asc`),
    req(`/interactions?select=id,contact_id,date,type,source&order=date.desc`),
    req(`/events?select=id,name,event_date,type,venue,notes,outcome_notes&order=event_date.asc`),
    req(`/event_invitees?select=id,event_id,contact_id,status`),
    req(`/dashboard_state?select=key,value`),
    req(`/followups?select=id,contact_id,due_date,note,status,completed_at,created_at,source_type,source_ref,thread,owner,extra_contact_ids,item_kind&order=created_at.desc`),
  ]);

  S.contacts = contacts;
  S.contactById = Object.fromEntries(contacts.map(c => [c.id, c]));
  S.interactions = interactions;
  S.events = events;
  S.invitees = invitees;
  S.followups = followups || [];
  S.ds = Object.fromEntries((dsRows||[]).map(r => [r.key, r.value]));

  // Precompute last-touch, first-touch, meaningful-touch, and "played golf with CS"
  S.lastByContact = {};
  S.firstByContact = {};
  S.lastMeaningfulByContact = {};
  S.golfWith = new Set();
  const MEANINGFUL = new Set(["golf","dinner","lunch","breakfast","event","dinner_event"]);
  for (const it of interactions) {
    if (!S.lastByContact[it.contact_id] || it.date > S.lastByContact[it.contact_id]) {
      S.lastByContact[it.contact_id] = it.date;
    }
    if (!S.firstByContact[it.contact_id] || it.date < S.firstByContact[it.contact_id]) {
      S.firstByContact[it.contact_id] = it.date;
    }
    if (MEANINGFUL.has(it.type)) {
      if (!S.lastMeaningfulByContact[it.contact_id] || it.date > S.lastMeaningfulByContact[it.contact_id]) {
        S.lastMeaningfulByContact[it.contact_id] = it.date;
      }
    }
    if (it.type === "golf") S.golfWith.add(it.contact_id);
  }
  // Also count event attendance as a real touch (fixes gap where events
  // never got auto-mirrored into interactions). Only past events with
  // status = accepted/attended count.
  const todayStr = new Date().toISOString().slice(0,10);
  const eventById = Object.fromEntries((events||[]).map(e => [e.id, e]));
  for (const iv of (invitees || [])) {
    const status = String(iv.status || "").toLowerCase();
    if (status !== "accepted" && status !== "attended" && status !== "confirmed") continue;
    const ev = eventById[iv.event_id];
    if (!ev || !ev.event_date) continue;
    if (ev.event_date > todayStr) continue; // future events aren't touches yet
    if (!S.lastByContact[iv.contact_id] || ev.event_date > S.lastByContact[iv.contact_id]) {
      S.lastByContact[iv.contact_id] = ev.event_date;
    }
    if (!S.firstByContact[iv.contact_id] || ev.event_date < S.firstByContact[iv.contact_id]) {
      S.firstByContact[iv.contact_id] = ev.event_date;
    }
    // Treat any accepted event attendance as a meaningful touch.
    if (!S.lastMeaningfulByContact[iv.contact_id] || ev.event_date > S.lastMeaningfulByContact[iv.contact_id]) {
      S.lastMeaningfulByContact[iv.contact_id] = ev.event_date;
    }
  }

  // Precompute invite stats per contact (from invitees table + event dates).
  // Tracks totals by bucket + the LAST invite (event + status + invitee_id for undo).
  S.inviteStats = {};
  for (const iv of (invitees || [])) {
    const ev = eventById[iv.event_id];
    if (!ev || !ev.event_date) continue;
    const st = String(iv.status || "").toLowerCase();
    const s = S.inviteStats[iv.contact_id] || {
      count: 0, confirmed: 0, declined: 0, pending: 0,
      lastDate: null, lastEventName: null, lastStatus: null, lastInviteId: null
    };
    s.count += 1;
    if (["confirmed","accepted","attended","played"].includes(st)) s.confirmed += 1;
    else if (["declined","regret","no"].includes(st)) s.declined += 1;
    else s.pending += 1;
    if (!s.lastDate || ev.event_date > s.lastDate) {
      s.lastDate = ev.event_date;
      s.lastEventName = ev.name || "";
      s.lastStatus = st;
      s.lastInviteId = iv.id;
    }
    S.inviteStats[iv.contact_id] = s;
  }
}

// ---------- Utility ----------
function loc(c){
  const p = [c.city, c.state].filter(x => x && String(x).trim().length);
  const seen = []; for (const x of p) if (!seen.includes(x)) seen.push(x);
  return seen.join(", ") || "";
}
function industryLabel(c){
  const raw = (c.industry || "").trim();
  const map = {
    "Family Office": "FO", "Wealth Management": "Wealth Mgmt", "RIA": "RIA",
    "PE": "PE", "HF": "HF", "VC": "VC", "Endowment": "Endowment",
    "Sovereign": "Sovereign", "Wall St": "Wall St", "Real Estate": "Real Estate",
    "Fundraising": "Fundraising", "Trader": "Trader", "Tech": "Tech",
    "Finance": "Finance", "Media": "Media", "Law": "Law", "Tax": "Tax",
    "Entrepreneur": "Entrepreneur", "Other": ""
  };
  if (raw && map[raw] !== undefined) return map[raw];
  if ((c.tags||[]).includes("FO_investor")) return "FO";
  return raw;
}
function isGolfer(c){
  const fmt = (c.preferred_formats||[]).map(s=>s.toLowerCase()).join("|");
  const mem = (c.memberships||[]).join("|").toLowerCase();
  const pi  = (c.personal_interests||"").toLowerCase();
  return fmt.includes("golf") || mem.includes("golf") || pi.includes("golf");
}
function score(c){
  const t = c.tags || [];
  let s = 0;
  if (t.includes("connector")) s += 4;
  if (t.includes("Quantinno")) s += 3;
  if (t.includes("FO_investor") || t.includes("FO_provider")) s += 2;
  if (t.some(x => String(x).startsWith("OZ"))) s += 2;
  s += ({hot:2, warm:1, friend:0, back_burner:-1}[c.priority] || 0);
  return s;
}
function futureEventFor(cid){
  const invited = S.invitees
    .filter(i => i.contact_id === cid && i.status === "accepted")
    .map(i => S.events.find(e => e.id === i.event_id))
    .filter(e => e && e.event_date >= iso(TODAY))
    .sort((a,b) => a.event_date.localeCompare(b.event_date));
  return invited[0];
}
function eventGuestNames(eid){
  return S.invitees
    .filter(i => i.event_id === eid)
    .map(i => ({ c: S.contactById[i.contact_id], status: i.status }))
    .filter(x => x.c);
}

// ---------- Render: as-of ----------
function renderAsOf(){
  const now = new Date();
  const fmt = now.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
  document.getElementById("asof").textContent = fmt;
}

// ---------- Render: calendar (forward + look-back) ----------
let CAL_MODE = "upcoming"; // 'upcoming' | 'past'

// ---------- Render: Needs CS Input ----------
// Three sections: Pinned questions, Ideas & Openings (grouped), Travel Planning
// Every item is inline-editable. Path convention: "pins:<i>" | "ideas:<sub>:<i>" | "travel:<i>"

// Get / set an item at a path.
function _needsGet(path) {
  const parts = path.split(":");
  if (parts[0] === "pins") {
    const arr = Array.isArray(S.ds.cs_pins) ? S.ds.cs_pins : [];
    return { arr, key: "cs_pins", idx: +parts[1], get value() { return arr[+parts[1]]; } };
  }
  if (parts[0] === "ideas") {
    const sub = parts[1];
    const obj = { ...(S.ds.ideas_openings || {}) };
    obj[sub] = Array.isArray(obj[sub]) ? [...obj[sub]] : [];
    return { obj, sub, arr: obj[sub], key: "ideas_openings", idx: +parts[2], get value() { return obj[sub][+parts[2]]; } };
  }
  if (parts[0] === "travel") {
    const arr = Array.isArray(S.ds.travel_planning) ? [...S.ds.travel_planning] : [];
    return { arr, key: "travel_planning", idx: +parts[1], get value() { return arr[+parts[1]]; } };
  }
  return null;
}

async function needsUpdateText(path, newText) {
  const ctx = _needsGet(path);
  if (!ctx) return;
  if (ctx.obj) {
    ctx.obj[ctx.sub] = [...ctx.arr];
    if (!newText.trim()) ctx.obj[ctx.sub].splice(ctx.idx, 1);
    else ctx.obj[ctx.sub][ctx.idx] = { ...(ctx.arr[ctx.idx]||{}), text: newText };
    if (!ctx.obj[ctx.sub].length) delete ctx.obj[ctx.sub];
    S.ds.ideas_openings = ctx.obj;
    await saveState("ideas_openings", ctx.obj);
  } else {
    const arr = [...ctx.arr];
    if (!newText.trim()) arr.splice(ctx.idx, 1);
    else arr[ctx.idx] = { ...(ctx.arr[ctx.idx]||{}), text: newText };
    S.ds[ctx.key] = arr;
    await saveState(ctx.key, arr);
  }
  renderNeeds();
  toast(newText.trim() ? "Saved." : "Removed.");
}

async function needsDelete(path) {
  const ctx = _needsGet(path);
  if (!ctx) return;
  // Capture for undo before mutating.
  const removed = ctx.value;
  if (ctx.obj) {
    ctx.obj[ctx.sub] = [...ctx.arr];
    ctx.obj[ctx.sub].splice(ctx.idx, 1);
    if (!ctx.obj[ctx.sub].length) delete ctx.obj[ctx.sub];
    S.ds.ideas_openings = ctx.obj;
    await saveState("ideas_openings", ctx.obj);
  } else {
    const arr = [...ctx.arr];
    arr.splice(ctx.idx, 1);
    S.ds[ctx.key] = arr;
    await saveState(ctx.key, arr);
  }
  renderNeeds();
  toast("Removed.", async () => {
    // Restore at same index (best effort).
    if (ctx.obj) {
      const obj = { ...(S.ds.ideas_openings || {}) };
      const list = Array.isArray(obj[ctx.sub]) ? [...obj[ctx.sub]] : [];
      list.splice(ctx.idx, 0, removed);
      obj[ctx.sub] = list;
      S.ds.ideas_openings = obj;
      await saveState("ideas_openings", obj);
    } else {
      const arr = Array.isArray(S.ds[ctx.key]) ? [...S.ds[ctx.key]] : [];
      arr.splice(ctx.idx, 0, removed);
      S.ds[ctx.key] = arr;
      await saveState(ctx.key, arr);
    }
    renderNeeds();
  });
}

async function needsAdd(kind, sub, text) {
  // kind: 'pins' | 'ideas' | 'travel'; sub: for ideas ('reciprocal' | 'local')
  // `text` is provided by the inline add-row UI (no prompt() — embedded browsers block it).
  if (!text || !text.trim()) return;
  const t = text.trim();
  if (kind === 'pins') {
    const arr = [...(S.ds.cs_pins || []), { text: t, added_at: iso(TODAY), added_by: AUTHOR }];
    S.ds.cs_pins = arr;
    await saveState("cs_pins", arr);
  } else if (kind === 'travel') {
    const arr = [...(S.ds.travel_planning || []), { text: t }];
    S.ds.travel_planning = arr;
    await saveState("travel_planning", arr);
  } else if (kind === 'ideas') {
    const obj = { ...(S.ds.ideas_openings || {}) };
    obj[sub] = [...(obj[sub] || []), { text: t }];
    S.ds.ideas_openings = obj;
    await saveState("ideas_openings", obj);
  }
  renderNeeds();
  toast("Added.");
}

async function saveRecentEventNote(eventId, note) {
  const clean = String(note || "").trim();
  if (!clean) return;
  await req(`/events?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({ outcome_notes: clean }),
  });
  // Update local cache so re-render drops the item without a full reload.
  const ev = (S.events || []).find(e => e.id === eventId);
  if (ev) ev.outcome_notes = clean;
  renderNeeds();
  toast("Note saved.");
}

async function dismissRecentEvent(eventId) {
  const cur = Array.isArray(S.ds.recent_notes_dismissed) ? [...S.ds.recent_notes_dismissed] : [];
  if (!cur.includes(eventId)) cur.push(eventId);
  S.ds.recent_notes_dismissed = cur;
  await saveState("recent_notes_dismissed", cur);
  renderNeeds();
  toast("Skipped.", async () => {
    const back = (S.ds.recent_notes_dismissed || []).filter(id => id !== eventId);
    S.ds.recent_notes_dismissed = back;
    await saveState("recent_notes_dismissed", back);
    renderNeeds();
  });
}

function _needsItemHtml(item, path, opts = {}) {
  const clsExtra = opts.cls || "";
  const meta = opts.meta ? `<div class="needs-meta">${escapeHtml(opts.meta)}</div>` : "";
  const linkBtn = (item && item.link_mod)
    ? `<button class="needs-link" contenteditable="false" data-jump-list="${escapeHtml(item.link_mod)}">${escapeHtml(item.link_label || "Open list →")}</button>`
    : "";
  // Anchor id so the calendar's "PIN" chip can scroll+highlight this item.
  const anchorId = `need-${path.replace(/:/g, "-")}`;
  return `<div class="needs-item ${clsExtra}" id="${anchorId}">
    <span class="dot"></span>
    <div class="needs-txt" data-edit-path="${path}" contenteditable="true" spellcheck="true">${item.text || ""}</div>
    ${linkBtn}
    ${meta}
    <button class="needs-x" data-remove-need="${path}" title="Remove">×</button>
  </div>`;
}

function renderNeeds(){
  const wrap = document.getElementById("needs-body");
  if (!wrap) return;

  // "This Week" strip: two sections.
  //   1. Needs notes — past-week events without outcome_notes (auto-regenerates).
  //   2. Due this week + overdue — commitments (followups with due_date) landing soon or past due.
  // Old Ideas / Reciprocal / Travel / Ask CS sections removed —
  // reciprocity + local now live as takeaways in Threads;
  // travel-specific stuff lives in Calendar and Lists (SF Trip, etc.).

  const parts = [];

  // 0a) Pinned — sticky notes at the top of This Week (persist in cs_pins).
  //     Each pin can optionally link to a Lists module via {link_mod, link_label}.
  const pins = Array.isArray(S.ds.cs_pins) ? S.ds.cs_pins : [];
  if (pins.length) {
    const pinItems = pins.map((p, i) => {
      const linkBtn = p.link_mod
        ? ` <button class="needs-link" data-jump-list="${escapeHtml(p.link_mod)}">${escapeHtml(p.link_label || "Open list →")}</button>`
        : "";
      return `<div class="needs-item pin-need" data-pin-idx="${i}">
        <span class="dot"></span>
        <div class="needs-txt-static">
          <span class="pin-text">${p.text || ""}</span>${linkBtn}
        </div>
        <button class="needs-x" data-remove-pin="${i}" title="Remove pin">×</button>
      </div>`;
    }).join("");
    parts.push(`<div class="needs-group">
      <div class="needs-group-head">
        <span class="needs-group-label">Pinned</span>
        <button class="linky needs-add-btn small" id="pin-add-btn" style="margin-left:auto">+ Add pin</button>
      </div>
      ${pinItems}
    </div>`);
  } else {
    parts.push(`<div class="needs-group">
      <div class="needs-group-head">
        <span class="needs-group-label">Pinned</span>
        <button class="linky needs-add-btn small" id="pin-add-btn" style="margin-left:auto">+ Add pin</button>
      </div>
      <div class="needs-inline-empty">No pins. Add one to keep something visible here.</div>
    </div>`);
  }

  // 0) Recent — needs notes: past-week events with no outcome_notes.
  // These are the touchpoints Katie hasn't caught up on yet.
  // Use LOCAL date (not UTC) so ET events near midnight aren't dropped.
  const _toLocalIso = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const _today = new Date();
  const todayStr = _toLocalIso(_today);
  const _sevenAgo = new Date(_today); _sevenAgo.setDate(_sevenAgo.getDate() - 8);
  const sevenAgoStr = _toLocalIso(_sevenAgo);
  const inviteesByEvent = {};
  for (const iv of (S.invitees || [])) {
    (inviteesByEvent[iv.event_id] = inviteesByEvent[iv.event_id] || []).push(iv);
  }
  const uncaptured = (S.events || [])
    .filter(e => e.event_date >= sevenAgoStr && e.event_date <= todayStr)
    .filter(e => !(e.outcome_notes && e.outcome_notes.trim()))
    .sort((a,b) => (a.event_date < b.event_date ? 1 : -1));
  const dismissed = new Set(Array.isArray(S.ds.recent_notes_dismissed) ? S.ds.recent_notes_dismissed : []);
  const uncapturedShown = uncaptured.filter(e => !dismissed.has(e.id));

  const recentItemsHtml = uncapturedShown.map(e => {
    const guests = (inviteesByEvent[e.id] || [])
      .filter(iv => ["accepted","attended","confirmed"].includes(String(iv.status||"").toLowerCase()))
      .map(iv => S.contactById[iv.contact_id]?.full_name)
      .filter(Boolean);
    const dateLabel = fmtShort(e.event_date);
    const guestLabel = guests.length ? guests.join(", ") : "no guests logged";
    const venueLabel = e.venue ? ` · ${escapeHtml(e.venue)}` : "";
    return `<div class="needs-item recent-need" data-event-id="${e.id}">
      <span class="dot"></span>
      <div class="needs-txt-static">
        <strong>${escapeHtml(e.name || "Untitled event")}</strong>
        <span class="recent-meta">${escapeHtml(dateLabel)}${venueLabel} · ${escapeHtml(guestLabel)}</span>
        <div class="recent-note-row">
          <input type="text" class="recent-note-input" data-note-event="${e.id}" placeholder="How did it go? (saves as event notes)" />
          <button class="needs-add-btn small" data-save-recent="${e.id}">Save</button>
          <button class="linky" data-dismiss-recent="${e.id}" title="Nothing to capture">Skip</button>
        </div>
      </div>
    </div>`;
  }).join("");

  parts.push(`<div class="needs-group">
    <div class="needs-group-head">
      <span class="needs-group-label">Recent — needs notes</span>
      <span class="needs-group-sub">Past 7 days, no notes yet</span>
    </div>
    ${uncapturedShown.length
      ? recentItemsHtml
      : `<div class="needs-inline-empty">Caught up. Nothing from the past week is missing notes.</div>`}
  </div>`);

  // "Due this week" block retired — threads/lists surface commitments; This Week stays lean.

  wrap.innerHTML = parts.join("");

  // Wire Recent — needs notes: save to events.outcome_notes or skip.
  wrap.querySelectorAll("[data-save-recent]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const eid = btn.dataset.saveRecent;
      const input = wrap.querySelector(`[data-note-event="${CSS.escape(eid)}"]`);
      const val = (input?.value || "").trim();
      if (!val) { input?.focus(); return; }
      await saveRecentEventNote(eid, val);
    });
  });
  wrap.querySelectorAll("[data-note-event]").forEach(inp => {
    inp.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const eid = inp.dataset.noteEvent;
        const val = (inp.value || "").trim();
        if (!val) return;
        await saveRecentEventNote(eid, val);
      }
    });
  });
  wrap.querySelectorAll("[data-dismiss-recent]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await dismissRecentEvent(btn.dataset.dismissRecent);
    });
  });

  // Wire commitment Done buttons in the strip.
  wrap.querySelectorAll("[data-fu-done]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await fuUpdate(btn.dataset.fuDone, { status: "completed", completed_at: new Date().toISOString() });
      renderNeeds();
      toast("Marked done.");
    });
  });

  // Jump from strip "Open" link to the Threads tab.
  wrap.querySelectorAll("[data-jump-thread]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const btn = document.querySelector('[data-tab="followups"]');
      if (btn) btn.click();
      const t = a.dataset.jumpThread;
      if (t) window.THREADS_FILTER_THREAD = t;
      renderFollowUps();
    });
  });

  // Pin: add button opens the existing pin modal.
  const pinAddBtn = document.getElementById("pin-add-btn");
  if (pinAddBtn) pinAddBtn.addEventListener("click", (e) => { e.preventDefault(); openAddPinModal(); });

  // Pin: remove.
  wrap.querySelectorAll("[data-remove-pin]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const idx = +btn.dataset.removePin;
      const arr = [...(S.ds.cs_pins || [])];
      arr.splice(idx, 1);
      S.ds.cs_pins = arr;
      await saveState("cs_pins", arr);
      renderNeeds();
      toast("Pin removed.");
    });
  });
}

function openAddPinModal(){
  openModal("Add question", `
    <label>Question</label>
    <textarea id="pin-text" style="min-height:100px" placeholder="e.g. Invite Bill Ackman to Sebonack in October?"></textarea>
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="pin-save">Pin</button>
    </div>`);
  document.getElementById("pin-save").addEventListener("click", async () => {
    const txt = document.getElementById("pin-text").value.trim();
    if (!txt) return alert("Nothing to pin.");
    const arr = [...(S.ds.cs_pins || [])];
    arr.push({ text: txt, added_at: iso(TODAY), added_by: AUTHOR });
    S.ds.cs_pins = arr;
    await saveState("cs_pins", arr);
    closeModal(); renderNeeds();
    toast("Pinned.");
  });
}


// ---------- Pin ↔ week matching ----------
// A pin is scoped to a week when its text contains "week of M/D" (year defaults
// to current). Multiple mentions are supported. Returns pins whose scoped week
// matches `monday`.
function pinsForWeek(monday){
  const pins = Array.isArray(S.ds.cs_pins) ? S.ds.cs_pins : [];
  if (!pins.length) return [];
  const wkStart = new Date(monday); wkStart.setHours(0,0,0,0);
  const wkEnd = new Date(monday); wkEnd.setDate(wkEnd.getDate()+6); wkEnd.setHours(23,59,59,999);

  // Extract every M/D or M/D/YY(YY) from the pin, and every range like
  // "9/22–9/26", "9/22-9/26", or "9/22 to 9/26". A pin matches this week if
  // any single date, or any date inside a range, falls inside it. Year defaults
  // to the target week's year so "9/22" resolves against Mon 9/22 of that year.
  const yr = monday.getFullYear();
  const mkDate = (mo, da, y) => {
    let yy = y ? +y : yr;
    if (yy < 100) yy += 2000;
    return new Date(yy, +mo - 1, +da);
  };
  const inWeek = (d) => d >= wkStart && d <= wkEnd;
  // range covers this week if it overlaps the week window
  const rangeCoversWeek = (start, end) =>
    start <= wkEnd && end >= wkStart;

  // Ranges FIRST (with –, —, -, or " to " as separator) so we don't
  // double-count their endpoints as standalone dates.
  const rangeRe = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:–|—|-|to)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g;
  const singleRe = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g;

  const result = [];
  pins.forEach((p, idx) => {
    const raw = (p.text || "").replace(/<[^>]+>/g, " "); // strip HTML tags
    let matched = false;

    // Mark spans covered by range matches so singleRe can skip them.
    const rangeSpans = [];
    let m;
    rangeRe.lastIndex = 0;
    while ((m = rangeRe.exec(raw)) !== null) {
      const start = mkDate(m[1], m[2], m[3]);
      const end   = mkDate(m[4], m[5], m[6] || m[3]); // inherit year if only first has it
      rangeSpans.push([m.index, m.index + m[0].length]);
      if (rangeCoversWeek(start, end)) { matched = true; break; }
    }

    if (!matched) {
      singleRe.lastIndex = 0;
      while ((m = singleRe.exec(raw)) !== null) {
        const pos = m.index;
        // Skip dates that are already inside a range we consumed above.
        if (rangeSpans.some(([a,b]) => pos >= a && pos < b)) continue;
        const d = mkDate(m[1], m[2], m[3]);
        if (inWeek(d)) { matched = true; break; }
      }
    }

    if (matched) result.push({ idx, text: raw.trim() });
  });
  return result;
}

function renderCalendar(){
  const isPast = CAL_MODE === "past";

  // Range: upcoming = tomorrow .. +90d; past = -90d .. yesterday
  let rangeStart, rangeEnd;
  if (isPast) {
    rangeEnd = new Date(TODAY); rangeEnd.setDate(rangeEnd.getDate()-1);
    rangeStart = new Date(TODAY); rangeStart.setDate(rangeStart.getDate()-90);
  } else {
    rangeStart = new Date(TODAY); rangeStart.setDate(rangeStart.getDate()+1);
    rangeEnd = new Date(TODAY); rangeEnd.setDate(rangeEnd.getDate()+95);
  }
  const startIso = iso(rangeStart);
  const endIso   = iso(rangeEnd);

  const inRange = S.events
    .filter(e => e.event_date >= startIso && e.event_date <= endIso)
    .sort((a,b) => isPast
        ? b.event_date.localeCompare(a.event_date)   // past: newest first
        : a.event_date.localeCompare(b.event_date)); // upcoming: soonest first

  // Group by week (Mon-based)
  const byWeek = new Map();
  for (const e of inRange) {
    const wk = iso(mondayOf(parseD(e.event_date)));
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(e);
  }

  // For upcoming, list ALL weeks in range so empty ones surface as OPEN.
  // For past, only list weeks that actually have events.
  let allWeeks;
  if (isPast) {
    allWeeks = [...byWeek.keys()].sort((a,b) => b.localeCompare(a)); // newest first
  } else {
    allWeeks = [];
    const startWk = mondayOf(rangeStart);
    const endWk   = mondayOf(rangeEnd);
    for (let d = new Date(startWk); d <= endWk; d.setDate(d.getDate()+7)) {
      allWeeks.push(iso(d));
    }
  }

  const weekNotes = S.ds.week_notes || {};

  const rows = [];
  for (const wkKey of allWeeks) {
    const wkDate = parseD(wkKey);
    const wkLabel = `Week of ${wkDate.getMonth()+1}/${wkDate.getDate()}`;
    // Week-scoped pins render inline as a full proposal row under the header,
    // so the pin text is visible without scrolling back up.
    const wkPinsHeader = isPast ? [] : pinsForWeek(wkDate);
    rows.push(`<tr class="wk-sep"><td colspan="4">${wkLabel}</td></tr>`);
    for (const p of wkPinsHeader) {
      rows.push(`<tr class="pin-inline" data-jump-pin="${p.idx}"><td colspan="4"><span class="pin-inline-label">Proposed:</span> <span class="pin-inline-text">${p.text}</span></td></tr>`);
    }
    const evs = byWeek.get(wkKey) || [];
    if (evs.length === 0 && !isPast) {
      const note = weekNotes[wkKey] || "";
      const holiday = holidayForWeek(wkDate);
      const noteLc = note.toLowerCase();
      const noteIsQuiet = /^(holiday|ooo|travel|quiet|out|away|vacation)/.test(noteLc);
      // Holidays surface as a day label. Some holidays (Thanksgiving) are
      // treated as fully quiet weeks; others (Yom Kippur, Indigenous Peoples')
      // stay bookable and only surface the affected day.
      const quiet = noteIsQuiet || (holiday && holiday.quiet);
      const tagHtml = quiet
        ? `<span class="quiet-tag">Quiet</span>`
        : `<span class="open-tag">Open</span>`;
      // Empty weeks show only the tag + note + optional holiday label.
      // A "No events" label is redundant with the OPEN tag itself.
      const labelHtml = holiday
        ? `<span class="open-label">${escapeHtml(formatHolidayDays(holiday.dates))} · ${escapeHtml(holiday.name)}</span>`
        : "";
      // Pin chips already render on the week-sep header above, no need to duplicate.
      rows.push(`<tr class="open-week ${quiet?'is-quiet':''}"><td colspan="4">
        ${tagHtml}
        ${labelHtml}
        <span class="open-note" contenteditable="true" data-week="${wkKey}" data-placeholder="add note">${escapeHtml(note)}</span>
      </td></tr>`);
    } else {
      for (const e of evs) {
        const guestArr = eventGuestNames(e.id);
        const guests = guestArr.map((g, i) => {
          const inv = S.invitees.find(iv => iv.event_id === e.id && iv.contact_id === g.c.id);
          const invId = inv ? inv.id : "";
          const declined = g.status === 'declined';
          const sep = i === 0 ? "" : `<span class="guest-sep">, </span>`;
          return `${sep}<span class="guest-chip ${declined?'guest-declined':''}" data-inv-id="${invId}" data-status="${g.status}" data-cname="${escapeHtml(g.c.full_name)}" title="Click to ${declined?'restore':'mark declined'} · right-click for more">${escapeHtml(g.c.full_name)}</span>`;
        }).join("");
        const guestsCell = (guests || "<span style='color:var(--ink-4)'>—</span>") +
          (isPast ? "" : ` <button class="guest-add" data-add-guest="${e.id}" title="Add guest">+ guest</button>`);
        rows.push(`<tr class="${isPast?'past-row':''}" data-event-id="${e.id}">
          <td class="col-date">${fmtDate(e.event_date, false)}</td>
          <td class="col-event">${escapeHtml(e.name || "(untitled)")}</td>
          <td class="col-venue">${escapeHtml(e.venue || "")}</td>
          <td class="col-guests">${guestsCell}</td>
        </tr>`);
      }
    }
  }

  const emptyMsg = isPast
    ? `<tr><td colspan="4" style="color:var(--ink-4);padding:16px 10px">No events logged in the past 90 days.</td></tr>`
    : ``;

  document.getElementById("calendar-table").innerHTML = `
    <table class="cal">
      <thead><tr>
        <th class="col-date">Date</th>
        <th class="col-event">Event</th>
        <th class="col-venue">Venue</th>
        <th class="col-guests">Guests</th>
      </tr></thead>
      <tbody>${rows.length ? rows.join("") : emptyMsg}</tbody>
    </table>`;

  // Update Forward Calendar subtitle to reflect mode
  const subEl = document.querySelector("#calendar-card .section-head .sub");
  if (subEl) {
    subEl.textContent = isPast
      ? "Past 90 days"
      : "Next 90 days";
  }

  const notes = S.ds.calendar_notes || [];
  document.getElementById("calendar-notes").innerHTML =
    notes.map(n => `<li>${escapeHtml(n)}</li>`).join("");

  // Wire per-week note editing (blur = save) — forward mode only
  document.querySelectorAll(".open-note").forEach(el => {
    el.addEventListener("blur", async () => {
      const wk = el.dataset.week;
      const txt = el.textContent.trim();
      const map = { ...(S.ds.week_notes || {}) };
      if (txt) map[wk] = txt; else delete map[wk];
      S.ds.week_notes = map;
      await saveState("week_notes", map);
      toast("Note saved.");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
      if (e.key === "Escape") { el.blur(); }
    });
  });

  // Pin chips on the calendar jump to the referenced pin in Open Items.
  document.querySelectorAll("[data-jump-pin]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = btn.dataset.jumpPin;
      const target = document.getElementById(`need-pins-${idx}`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("needs-item-flash");
      setTimeout(() => target.classList.remove("needs-item-flash"), 1600);
    });
  });

  // Guest chip: click to toggle declined/accepted
  document.querySelectorAll(".guest-chip").forEach(chip => {
    chip.addEventListener("click", async (ev) => {
      const invId = chip.dataset.invId;
      if (!invId) return;
      const cur = chip.dataset.status;
      const next = cur === "declined" ? "accepted" : "declined";
      try {
        await updateInviteeStatus(invId, next);
        const local = S.invitees.find(i => i.id === invId);
        if (local) local.status = next;
        renderCalendar(); renderNeeds();
        toast(next === "declined" ? "Marked declined." : "Restored.");
      } catch (e) { alert("Save failed: " + e.message); }
    });
  });

  // + guest button: opens picker
  document.querySelectorAll("[data-add-guest]").forEach(btn => {
    btn.addEventListener("click", () => openAddGuestModal(btn.dataset.addGuest));
  });

  // Sync toggle button states
  document.querySelectorAll("[data-cal-mode]").forEach(b => {
    b.classList.toggle("is-active", b.dataset.calMode === CAL_MODE);
  });
}

// ---------- Render: scarce assets ----------
function renderAssets(){
  const usedFor = (needle) => S.events.filter(e => {
    const hay = ((e.name||"") + " " + (e.venue||"")).toLowerCase();
    return hay.includes(needle) &&
           e.event_date <= iso(TODAY) &&
           parseD(e.event_date).getFullYear() === YEAR_NOW;
  }).length;

  const a = S.ds.assets || {};
  // Each tile: k (state key), lbl, group, used (number or null), budget (number or null), note.
  // budget=null means "unlimited/seasonal" — render figure without a denominator.
  const tiles = [
    // GOLF
    { k:"pv_cs",       group:"Golf",    lbl:"Pine Valley (CS)",     used: usedFor("pine valley"),           budget:(a.pv_cs||{}).budget||3,      note:(a.pv_cs||{}).note },
    { k:"pv_chris",    group:"Golf",    lbl:"Pine Valley (CC)",     used:(a.pv_chris||{}).used_manual||0,   budget:(a.pv_chris||{}).budget||3,   note:(a.pv_chris||{}).note },
    { k:"sebonack",    group:"Golf",    lbl:"Sebonack w/ JAV",      used: usedFor("sebonack"),              budget:null,                          note:(a.sebonack||{}).note || "seasonal: summer / fall / overnight / cabin" },
    { k:"sleepy",      group:"Golf",    lbl:"Sleepy Hollow rounds", used: usedFor("sleepy"),                budget:(a.sleepy||{}).budget||12,    note:(a.sleepy||{}).note },
    { k:"chechessee",  group:"Golf",    lbl:"Chechessee (SC)",      used:(a.chechessee||{}).used_manual||0, budget:null,                          note:(a.chechessee||{}).note || "unlimited via owner — play + host" },
    { k:"dye_preserve",group:"Golf",    lbl:"Dye Preserve (FL)",    used: usedFor("dye preserve"),          budget:(a.dye_preserve||{}).budget||2, note:(a.dye_preserve||{}).note || "winter" },
    { k:"floridian",   group:"Golf",    lbl:"Floridian (FL)",       used: usedFor("floridian"),             budget:(a.floridian||{}).budget||2,  note:(a.floridian||{}).note || "winter" },
    // DINNERS
    { k:"nyc_dinner",  group:"Dinners", lbl:"NYC dinner",           used:(a.nyc_dinner||{}).used_manual||0, budget:(a.nyc_dinner||{}).budget||4,  note:(a.nyc_dinner||{}).note },
    { k:"sf_dinner",   group:"Dinners", lbl:"SF dinner",            used:(a.sf_dinner||{}).used_manual||0,  budget:(a.sf_dinner||{}).budget||2,   note:(a.sf_dinner||{}).note },
    { k:"chicago_dinner", group:"Dinners", lbl:"Chicago dinner",    used:(a.chicago_dinner||{}).used_manual||0, budget:(a.chicago_dinner||{}).budget||2, note:(a.chicago_dinner||{}).note },
    { k:"dallas_dinner",  group:"Dinners", lbl:"Dallas dinner",     used:(a.dallas_dinner||{}).used_manual||0,  budget:(a.dallas_dinner||{}).budget||2,  note:(a.dallas_dinner||{}).note },
    { k:"london_dinner",  group:"Dinners", lbl:"London dinner",     used:(a.london_dinner||{}).used_manual||0,  budget:(a.london_dinner||{}).budget||1,  note:(a.london_dinner||{}).note || "2027 idea — Andy Adam" },
    { k:"sc_dinner",   group:"Dinners", lbl:"SC dinner",            used:(a.sc_dinner||{}).used_manual||0,  budget:(a.sc_dinner||{}).budget||1,   note:(a.sc_dinner||{}).note || "host w/ Mike W" },
  ];
  const wrap = document.getElementById("asset-tiles");
  const tileHtml = (t) => {
    const overspend = (t.budget != null) && t.used > t.budget;
    const figure = (t.budget == null)
      ? `${t.used}<span class="budget"> used</span>`
      : `${t.used}<span class="budget"> / ${t.budget}</span>`;
    return `
      <div class="tile ${overspend?'overspend':''}" data-asset="${t.k}">
        <div class="lbl">${t.lbl}</div>
        <div class="figure">${figure}</div>
        <div class="note">${escapeHtml(t.note||"")}</div>
      </div>`;
  };
  const groups = ["Golf","Dinners"];
  wrap.innerHTML = groups.map(g => `
    <div class="asset-group">
      <div class="asset-group-lbl">${g}</div>
      <div class="asset-group-tiles">${tiles.filter(t=>t.group===g).map(tileHtml).join("")}</div>
    </div>
  `).join("");
  const fla = (a.florida||{}).note || "";
  const banner = document.getElementById("florida-banner");
  if (fla) {
    banner.innerHTML = `<strong>Florida</strong> · ${escapeHtml(fla)}`;
    banner.style.display = "";
  } else {
    banner.innerHTML = "";
    banner.style.display = "none";
  }
}

// ---------- Render: focus lists (Hot 10 + Warm 15) ----------
// slot: 'hot10' or 'warm15' — both persist as separate dashboard_state keys.
// Backward compat: if hot10 key is missing/empty, fall back to legacy top10.
function focusItems(slot){
  if (slot === 'hot10') {
    const h = S.ds.hot10;
    if (Array.isArray(h) && h.length) return h;
    return S.ds.top10 || [];
  }
  return S.ds.warm15 || [];
}

// Compute the display reason for a Hot 10 row.
// Priority: explicit why > recent meaningful touch > recent first meeting > "pinned".
function hotReason(row, c) {
  if (row.why && row.why.trim()) return row.why.trim();
  const first = S.firstByContact[c.id];
  const meaningful = S.lastMeaningfulByContact[c.id];
  if (first && daysSince(first) <= 14) return `New — first met ${fmtShort(first)}`;
  if (meaningful && daysSince(meaningful) <= 30) return `Recent — ${fmtShort(meaningful)}`;
  return "Pinned";
}

// Suggested next action for a Hot 10 row.
function hotNextAction(c) {
  const nx = futureEventFor(c.id);
  if (nx) return { html: `${fmtShort(nx.event_date)} · ${escapeHtml(truncate(nx.name, 24))}`, cls: "planned" };
  const last = S.lastByContact[c.id];
  if (!last) return { html: "Plan first touch", cls: "empty" };
  const d = daysSince(last);
  if (d >= 90) return { html: "Move to Warm 15?", cls: "demote" };
  if (d >= 60) return { html: "Plan a touch", cls: "warn" };
  return { html: "Nothing on calendar", cls: "empty" };
}

// Cooling state: 60d = cooling, 90d = demote-suggest, else fresh
function coolingState(cid) {
  const last = S.lastByContact[cid];
  const nx = futureEventFor(cid);
  if (nx) return null;
  if (!last) return null;
  const d = daysSince(last);
  if (d >= 90) return "demote";
  if (d >= 60) return "cooling";
  return null;
}

function renderFocusList(slot){
  const listId = slot === 'hot10' ? 'top10-list' : 'warm15-list';
  const ol = document.getElementById(listId);
  if (!ol) return;
  const items = focusItems(slot);
  const rankOffset = slot === 'hot10' ? 0 : 10;
  ol.innerHTML = items.map((row, idx) => {
    const c = S.contactById[row.contact_id];
    if (!c) return `<li><span class="rank">${idx+1+rankOffset}</span><div>Missing contact ${row.contact_id}</div></li>`;
    const last = S.lastByContact[c.id];

    if (slot === 'hot10') {
      const reason = hotReason(row, c);
      const next = hotNextAction(c);
      const cool = coolingState(c.id);
      const badge = cool === "cooling"
        ? `<span class="cool-badge" title="60+ days no activity and no plan">cooling</span>`
        : cool === "demote"
        ? `<span class="cool-badge demote" title="90+ days no activity">quiet</span>`
        : "";
      return `<li draggable="true" data-idx="${idx}" data-cid="${c.id}" data-slot="${slot}" class="hot-card ${cool||''}">
        <div class="rank">${idx+1+rankOffset}</div>
        <div class="hot-main">
          <div class="hot-line1">
            <span class="name">${escapeHtml(c.full_name)}${isGolfer(c)?'<span class="golf" title="golfer">⛳</span>':''}</span>
            ${c.company ? `<span class="firm">· ${escapeHtml(c.company)}</span>` : ""}
            ${loc(c) ? `<span class="loc">· ${escapeHtml(loc(c))}</span>` : ""}
            ${badge}
          </div>
          <div class="hot-reason"><span class="k">Why:</span> ${escapeHtml(reason)}</div>
          <div class="hot-next ${next.cls}"><span class="k">Next:</span> ${next.html}</div>
        </div>
        <div class="hot-meta">
          <div class="lt"><span class="k">Last</span> ${last ? fmtShort(last) : "—"}${last?` <span class="days">(${daysSince(last)}d)</span>`:""}</div>
        </div>
        <div class="rm" title="Remove" data-remove-focus="${c.id}" data-slot="${slot}">×</div>
      </li>`;
    }

    // warm15: existing compact layout
    const staleDays = 90;
    const stale = last ? daysSince(last) > staleDays : true;
    const nx = futureEventFor(c.id);
    return `<li draggable="true" data-idx="${idx}" data-cid="${c.id}" data-slot="${slot}" class="${stale?'stale':''}">
      <div class="rank">${idx+1+rankOffset}</div>
      <div class="name">${c.full_name}${isGolfer(c)?'<span class="golf" title="golfer">⛳</span>':''}</div>
      <div class="firm">${c.company || ""}</div>
      <div class="loc">${loc(c)}</div>
      <div class="lt"><span class="k">Last</span>${last ? fmtShort(last) : "—"}</div>
      <div class="nx"><span class="k">Next</span>${nx ? fmtShort(nx.event_date)+" · "+truncate(nx.name,20) : "—"}</div>
      <div class="why">${escapeHtml(row.why || "")}</div>
      <div class="rm" title="Remove" data-remove-focus="${c.id}" data-slot="${slot}">×</div>
    </li>`;
  }).join("");

  ol.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", (e) => {
      if (e.target.matches("[data-remove-focus]")) {
        return removeFromFocus(li.dataset.slot, li.dataset.cid);
      }
    });
  });

  let dragIdx = null;
  ol.querySelectorAll("li").forEach(li => {
    li.addEventListener("dragstart", () => { dragIdx = +li.dataset.idx; li.dataset.dragging = "1"; });
    li.addEventListener("dragend",   () => { delete li.dataset.dragging; });
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      const from = dragIdx;
      const to   = +li.dataset.idx;
      if (from == null || from === to) return;
      const arr = [...focusItems(slot)];
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      S.ds[slot] = arr;
      renderFocusList(slot);
      await saveState(slot, arr);
      toast("Saved order.");
    });
  });

  // Auto-suggest lane below Hot 10
  if (slot === 'hot10') renderHotSuggestions();
}

// Legacy no-ops kept so existing call sites don't error — renderAlerts() replaces both.
async function renderHotSuggestions() { /* deprecated */ }
async function runHotAutoAdd() { /* deprecated — use manual add via Lists */ }

// ---------- Passive alert strip ----------
// Two small chip rows, shown only if there's anything to show:
//   • New this week — first-ever interaction in last 14 days, not already Hot 10 or dismissed.
//   • Going quiet — Hot 10 members with 60+ days since last touch.
// One-click "Add to Hot 10" or "Dismiss". No walls of text.
async function renderAlerts() {
  const wrap = document.getElementById("alerts-strip");
  if (!wrap) return;

  // purge expired snoozes
  const dismissed = { ...(S.ds.hot_dismissed || {}) };
  const today = iso(TODAY);
  let purged = false;
  for (const cid of Object.keys(dismissed)) {
    if (dismissed[cid] && dismissed[cid] !== "forever" && dismissed[cid] < today) {
      delete dismissed[cid]; purged = true;
    }
  }
  if (purged) { S.ds.hot_dismissed = dismissed; }

  const hotSet = new Set(focusItems('hot10').map(r => r.contact_id));

  // New this week: first interaction ≤ 14 days ago, not already Hot 10, not dismissed
  const newFolks = [];
  for (const c of S.contacts) {
    if (hotSet.has(c.id)) continue;
    if (dismissed[c.id]) continue;
    const first = S.firstByContact[c.id];
    if (!first || daysSince(first) > 14) continue;
    newFolks.push({ c, when: first });
  }
  newFolks.sort((a,b) => b.when.localeCompare(a.when));

  // Going quiet: Hot 10 members with 60+ days since last touch
  const quietFolks = [];
  for (const row of focusItems('hot10')) {
    const c = S.contactById[row.contact_id];
    if (!c) continue;
    const last = S.lastByContact[c.id];
    if (!last) { quietFolks.push({ c, days: null }); continue; }
    const d = daysSince(last);
    if (d >= 60) quietFolks.push({ c, days: d });
  }
  quietFolks.sort((a,b) => (b.days||9999) - (a.days||9999));

  if (!newFolks.length && !quietFolks.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;

  // Bucket the "going quiet" list rather than showing raw day counts — exact
  // numbers are alarming and rarely actionable ("1444d" reads as data-quality
  // issue, not a task). Users can drill into the person for the full history.
  const bucketOf = (d) => {
    if (d == null) return "no touch on file";
    if (d >= 365) return "1yr+";
    if (d >= 180) return "6mo+";
    return "60d+";
  };

  const chip = (label, cid, action) =>
    `<span class="alert-chip">${escapeHtml(label)}<button class="alert-x" title="Dismiss" data-dismiss="${cid}">×</button>${
      action === 'add'
        ? `<button class="alert-add" title="Add to Hot 10" data-add="${cid}">+ Hot</button>`
        : ""
    }</span>`;

  // Collapsed by default — a single summary chip. Click to expand.
  const expanded = wrap.dataset.expanded === "1";
  const total = newFolks.length + quietFolks.length;
  const summary = `<button class="alerts-toggle" data-alerts-toggle title="${expanded ? 'Collapse' : 'Expand'}">${
    expanded ? "Hide alerts" : `Alerts (${total})`
  }</button>`;

  const parts = [summary];
  if (expanded) {
    if (newFolks.length) {
      parts.push(`<div class="alert-row"><span class="alert-label">New (last 14d)</span>${
        newFolks.slice(0, 6).map(x => chip(
          `${x.c.full_name}${x.c.company ? ` · ${x.c.company}` : ""}`,
          x.c.id, 'add'
        )).join("")
      }</div>`);
    }
    if (quietFolks.length) {
      parts.push(`<div class="alert-row alert-row-quiet"><span class="alert-label">Hot 10 — going quiet</span>${
        quietFolks.slice(0, 8).map(x => chip(
          `${x.c.full_name} · ${bucketOf(x.days)}`,
          x.c.id, null
        )).join("")
      }</div>`);
    }
  }
  wrap.innerHTML = parts.join("");

  const toggleBtn = wrap.querySelector("[data-alerts-toggle]");
  if (toggleBtn) toggleBtn.addEventListener("click", () => {
    wrap.dataset.expanded = expanded ? "" : "1";
    renderAlerts();
  });

  wrap.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", async () => {
    await addToFocus('hot10', b.dataset.add, "");
    renderAlerts();
  }));
  wrap.querySelectorAll("[data-dismiss]").forEach(b => b.addEventListener("click", async () => {
    const cid = b.dataset.dismiss;
    const next = { ...(S.ds.hot_dismissed || {}) };
    // Dismiss quietly for 30 days (auto-purges after)
    const d = new Date(TODAY); d.setDate(d.getDate() + 30);
    next[cid] = iso(d);
    S.ds.hot_dismissed = next;
    await saveState('hot_dismissed', next);
    renderAlerts();
  }));
}

function renderTop10(){
  // Focus panel was removed; these are guarded no-ops when the DOM is missing.
  renderFocusList('hot10');
  renderFocusList('warm15');
  renderNeeds();
}

async function removeFromFocus(slot, cid) {
  const arr = focusItems(slot).filter(r => r.contact_id !== cid);
  S.ds[slot] = arr;
  renderFocusList(slot); renderLists(); renderAlerts();
  await saveState(slot, arr);
  toast("Removed.");
}

// Add a contact to a state-backed list (currently only 'active'). For the Active
// list, callers should pass tag ('legacy'|'new') — defaults to 'new' since that's
// the common case (a fresh contact CS is starting to build with).
async function addToFocus(slot, cid, why, tag) {
  const arr = [...(S.ds[slot] || [])];
  if (arr.find(r => r.contact_id === cid)) return;
  const row = { contact_id: cid, why: why || "" };
  if (slot === "active") {
    row.tag = tag || "new";
    row.tagged_at = iso(TODAY);
  }
  arr.push(row);
  S.ds[slot] = arr;
  renderLists();
  await saveState(slot, arr);
  const modName = (MODULES.find(m => m.fromState === slot) || {}).name || "list";
  toast(`Added to ${modName}.`);
}

// ---------- Render: list modules ----------
// The "Active" list is the single working-set of relationships CS is deliberately
// nurturing right now. Rows carry {contact_id, why, tag, tagged_at} where tag is
// 'legacy' (long-standing important people to keep warm) or 'new' (recent contacts
// we're trying to solidify). Rendered legacy-first, then new. `tagged_at` powers
// the quarterly "promote or drop?" nudge for 'new' rows older than 180 days.
const MODULES = [
  {
    id: "active",
    name: "Active",
    purpose: "Legacy relationships to keep warm, and new ones we're solidifying.",
    fromState: "active",
    pinned: true,
    hasTags: true,
    noteFor: (c) => "",
  },
  {
    id: "quantinno",
    name: "Friends of Quantinno",
    purpose: "QCM-relevant contacts.",
    filter: (c) => (c.tags||[]).includes("Quantinno"),
    sort:   (a,b) => score(b) - score(a),
    cap: 40,
  },
  {
    id: "summer_golf",
    name: "Summer Golf Targets",
    purpose: "Curated summer-golf invite pool.",
    filter: (c) => (c.tags||[]).includes("summer_golf_target"),
    sort:   (a,b) => score(b) - score(a),
  },
  {
    id: "oz_investors",
    name: "OZ Investors",
    purpose: "LP-side OZ investors (existing + prospective).",
    filter: (c) => (c.tags||[]).some(t => ["OZ_Investor","OZ_LP"].includes(t)),
    sort:   (a,b) => score(b) - score(a),
  },
  {
    id: "oz_deal_flow",
    name: "OZ Deal Flow",
    purpose: "OZ sponsors, developers, deal-flow sources.",
    filter: (c) => (c.tags||[]).some(t => ["OZ_Developer","deal_flow"].includes(t)),
    sort:   (a,b) => score(b) - score(a),
  },
  {
    id: "nyc_dinner_pool",
    name: "NYC Investor Dinner",
    purpose: "Past attendees + candidates.",
    fromState: "nyc_dinner_pool",
    pinned: true,
    noteFor: (c) => "",
  },
  {
    id: "sf_dinner_pool",
    name: "SF Investor Dinner",
    purpose: "Named SF-area candidates from the thematic doc.",
    fromState: "sf_dinner_pool",
    noteFor: (c) => "",
  },
  {
    id: "neotribe_invites",
    name: "Neotribe 10/20 Invites",
    purpose: "Proposed Tishman invites for the Neotribe co-hosted dinner (Tue 10/20 at Moss). Neotribe signs the contract once 5+ Tishman guests are confirmed.",
    fromState: "neotribe_invites",
    pinned: true,
    hasTags: true,
    noteFor: (c) => "",
  },
  {
    id: "sf_trip_sep",
    name: "SF Trip 9/28–30",
    purpose: "Anchors, Palo Alto, and SF slots for the 9/28–30 swing.",
    fromState: "sf_trip_sep",
    pinned: true,
    hasTags: true,
    noteFor: (c) => "",
  },
  {
    id: "cogp_platform",
    name: "Co-GP / Platform Partners",
    purpose: "Sponsors and FOs for co-GP and platform-level partnerships.",
    fromState: "cogp_platform",
    noteFor: (c) => "",
  },
  {
    id: "connectors",
    name: "Connectors",
    purpose: "Door-openers.",
    filter: (c) => (c.tags||[]).includes("connector"),
    sort:   (a,b) => score(b) - score(a),
    cap: 40,
  },
  {
    id: "dallas",
    name: "Dallas",
    purpose: "Pull when a trip firms up.",
    filter: (c) => ["Dallas","Fort Worth"].includes(c.city) || (c.state==="TX" && ["hot","warm","friend"].includes(c.priority)),
    sort: (a,b) => score(b) - score(a),
    cap: 25,
  },
  {
    id: "chicago",
    name: "Chicago",
    purpose: "Pull when a trip firms up.",
    filter: (c) => (["Chicago","Wilmette","Glen Ellyn","Winnetka","Lake Forest"].includes(c.city) || c.state==="IL") && ["hot","warm","friend"].includes(c.priority),
    sort: (a,b) => score(b) - score(a),
    cap: 25,
  },
  {
    id: "sf",
    name: "SF / Bay Area",
    purpose: "Pull when a trip firms up.",
    filter: (c) => ["San Francisco","Palo Alto","Atherton","Menlo Park","San Mateo","Woodside"].includes(c.city) && ["hot","warm","friend"].includes(c.priority),
    sort: (a,b) => score(b) - score(a),
    cap: 25,
  },
  {
    id: "la",
    name: "Los Angeles",
    purpose: "Pull when a trip firms up.",
    filter: (c) => ["Los Angeles","Beverly Hills","Santa Monica","Malibu","Pasadena"].includes(c.city) && ["hot","warm","friend"].includes(c.priority),
    sort: (a,b) => score(b) - score(a),
    cap: 25,
  },
  {
    id: "atlanta",
    name: "Atlanta",
    purpose: "Pull when a trip firms up.",
    filter: (c) => c.city === "Atlanta" && ["hot","warm","friend"].includes(c.priority),
    sort: (a,b) => score(b) - score(a),
    cap: 25,
  },
  {
    id: "golfers",
    name: "Golfers",
    purpose: "Golfers in the network.",
    filter: (c) => isGolfer(c) && ["hot","warm","friend"].includes(c.priority),
    sort: (a,b) => score(b) - score(a),
    cap: 40,
    noteFor: (c) => S.golfWith.has(c.id) ? "played with CS" : "",
  },
];

// Track which list is currently selected in the rolodex
let SELECTED_LIST = MODULES[0].id;
let LISTS_EVENT_FILTER = null; // event.id when Lists panel is in "filter by event" (View B) mode

// Alphabetical by full_name — stable comparator used everywhere in Lists.
function _nameAsc(a, b){
  return String(a.full_name || "").toLowerCase().localeCompare(String(b.full_name || "").toLowerCase());
}

function rowsForModule(m){
  // State-backed lists (Active) come from dashboard_state.
  if (m.fromState) {
    let stateRows = S.ds[m.fromState] || [];
    if (m.hasTags) {
      // Keep tag grouping (legacy first, then new) but ALPHABETICAL within each tag.
      const order = { legacy: 0, new: 1, anchor: 0, palo_alto: 1, sf: 2, first_wave: 0, bench: 1, cs_call: 2 };
      stateRows = [...stateRows].sort((a, b) => {
        const g = (order[a.tag] ?? 9) - (order[b.tag] ?? 9);
        if (g !== 0) return g;
        const ca = S.contactById[a.contact_id], cb = S.contactById[b.contact_id];
        return _nameAsc(ca || {}, cb || {});
      });
    } else {
      stateRows = [...stateRows].sort((a, b) => _nameAsc(S.contactById[a.contact_id] || {}, S.contactById[b.contact_id] || {}));
    }
    return stateRows.map(r => S.contactById[r.contact_id]).filter(Boolean);
  }
  const pins = S.ds.list_pins || {};
  let rows = S.contacts.filter(m.filter);
  const modPins = pins[m.id] || { add:[], hide:[] };
  for (const cid of (modPins.add||[])) {
    if (!rows.find(r => r.id === cid) && S.contactById[cid]) rows.push(S.contactById[cid]);
  }
  rows = rows.filter(r => !(modPins.hide||[]).includes(r.id));
  // Force alphabetical for live-review scan-ability (overrides per-module score sort).
  rows.sort(_nameAsc);
  if (m.cap) rows = rows.slice(0, m.cap);
  return rows;
}

// Look up the persisted row for a contact in a state-backed list (Active).
// Returns {contact_id, why, tag, tagged_at} or null.
function stateRowFor(m, cid) {
  if (!m.fromState) return null;
  return (S.ds[m.fromState] || []).find(r => r.contact_id === cid) || null;
}

function renderLists(){
  renderListsIndex();
  renderListsDetail();
}

function renderListsIndex(){
  const idx = document.getElementById("lists-index");
  if (!idx) return;
  const pinned = MODULES.filter(m => m.pinned);
  const others = MODULES.filter(m => !m.pinned);
  const renderMod = (m) => {
    const count = rowsForModule(m).length;
    const on = m.id === SELECTED_LIST;
    return `<li class="rolodex-index-item ${on?'is-active':''} ${m.pinned?'pinned':''}" data-mod="${m.id}">
      <span class="ri-name">${m.name}</span>
      <span class="ri-count">${count}</span>
    </li>`;
  };
  idx.innerHTML = `
    <div class="rolodex-index-head">Focus</div>
    <ul class="rolodex-index-items">${pinned.map(renderMod).join("")}</ul>
    <div class="rolodex-index-head" style="margin-top:14px">Rolodex</div>
    <ul class="rolodex-index-items">${others.map(renderMod).join("")}</ul>
  `;
  idx.querySelectorAll("[data-mod]").forEach(el => {
    el.addEventListener("click", () => {
      SELECTED_LIST = el.dataset.mod;
      renderListsIndex();
      renderListsDetail();
    });
  });
}

function renderListsDetail(){
  const wrap = document.getElementById("lists-detail");
  if (!wrap) return;
  const m = MODULES.find(x => x.id === SELECTED_LIST) || MODULES[0];
  const rows = rowsForModule(m);

  // Tagged (Active) list: extra Tag column, group with subheaders, show "why".
  const isTagged = m.hasTags;

  const rowHtml = (c, prevTag) => {
    const sr = stateRowFor(m, c.id);
    const tag = sr ? sr.tag : "";
    const why = sr ? (sr.why || "") : "";
    const noteText = isTagged
      ? why
      : (m.noteFor ? m.noteFor(c) : (c.priority ? c.priority : ""));

    // Subheader row when tag changes.
    let subhead = "";
    if (isTagged && tag && tag !== prevTag) {
      const labels = {
        legacy: "Legacy — keep warm",
        new: "New — solidifying",
        anchor: "Anchors — must-see",
        palo_alto: "Palo Alto (Tue)",
        sf: "SF (Mon)",
        first_wave: "First wave — personal texts",
        bench: "Bench — backfill declines",
        cs_call: "Flagged — CS to rule",
      };
      const label = labels[tag] || tag;
      const activeSubCols = (m.id === "active") ? 6 : (isTagged ? 7 : 8);
      subhead = `<tr class="tag-subhead tag-subhead-${tag}"><td colspan="${activeSubCols}">${label}</td></tr>`;
    }

    // Tag pill dropped — subheader row already communicates the group.
    const promoteBtn = (isTagged && tag === "new")
      ? `<button class="linky" data-promote="${c.id}" title="Promote to legacy">Promote</button>`
      : "";

    // For tagged lists we drop the Type column. Note column stays for SF Trip (shows "why").
    const dropNote = (m.id === "active");
    const typeCell = isTagged ? "" : `<td>${escapeHtml(industryLabel(c))}</td>`;
    const noteCell = dropNote ? "" : `<td>${escapeHtml(noteText)}</td>`;

    // "Invites" cell: status chip for LAST invite + count + × undo.
    // Tooltip on hover shows the full event name and date.
    const st = S.inviteStats[c.id];
    let inviteCell = `<td class="invite-cell inv-empty">—</td>`;
    if (st && st.count > 0) {
      const lastStatus = st.lastStatus || "invited";
      const chipCls = { confirmed:"chip-yes", accepted:"chip-yes", attended:"chip-yes", played:"chip-yes", tentative:"chip-maybe", invited:"chip-open", selected:"chip-open", declined:"chip-no" }[lastStatus] || "chip-open";
      const lastLabel = { confirmed:"Confirmed", accepted:"Confirmed", attended:"Attended", played:"Played", tentative:"Tentative", invited:"Invited", selected:"Shortlist", declined:"Declined" }[lastStatus] || lastStatus;
      const countPart = st.count === 1 ? "1 invite" : `${st.count} invites`;
      const declPart = st.declined > 0 ? ` \u00b7 ${st.declined} declined` : "";
      const tip = `Last: ${st.lastEventName || ""}${st.lastDate ? " (" + st.lastDate + ")" : ""}`;
      inviteCell = `<td class="invite-cell" title="${escapeHtml(tip)}">
        <div class="inv-row">
          <span class="inv-chip ${chipCls}">${lastLabel}</span>
          <span class="inv-count-text">${countPart}${declPart}</span>
          <button class="inv-undo" data-uninvite="${st.lastInviteId}" title="Undo the ${lastLabel.toLowerCase()} invite to ${escapeHtml(st.lastEventName || "")}">×</button>
        </div>
      </td>`;
    }
    const eventOverlayCell = inviteCell;

    return subhead + `
      <tr data-cid="${c.id}">
        <td class="name-cell">${c.full_name}${isGolfer(c)?'<span class="golf" title="golfer">⛳</span>':''}</td>
        <td>${c.company || ""}</td>
        ${typeCell}
        <td>${loc(c)}</td>
        <td>${S.lastByContact[c.id] ? fmtShort(S.lastByContact[c.id]) : "—"}</td>
        ${eventOverlayCell}
        ${noteCell}
        <td class="action-cell">
          ${promoteBtn}
          <button class="row-remove-btn" data-hide="${m.id}:${c.id}" title="${m.fromState ? 'Remove from this list' : 'Hide from this list'}">${m.fromState ? 'Remove' : 'Hide'}</button>
        </td>
      </tr>`;
  };

  let prevTag = null;
  const body = rows.map(c => {
    const sr = stateRowFor(m, c.id);
    const html = rowHtml(c, prevTag);
    if (sr && sr.tag) prevTag = sr.tag;
    return html;
  }).join("");

  // Promote/drop nudge: 'new'-tagged rows older than 180 days.
  let nudgeHtml = "";
  if (isTagged) {
    const stale = (S.ds[m.fromState] || []).filter(r => {
      if (r.tag !== "new" || !r.tagged_at) return false;
      const daysOn = Math.floor((TODAY - parseD(r.tagged_at)) / 86400000);
      return daysOn >= 180;
    });
    if (stale.length) {
      const names = stale.map(r => S.contactById[r.contact_id]?.full_name).filter(Boolean).slice(0, 6).join(", ");
      const more = stale.length > 6 ? ` +${stale.length - 6}` : "";
      nudgeHtml = `<div class="active-nudge">${stale.length} tagged “new” for 6+ months — promote to legacy or drop: ${escapeHtml(names)}${more}</div>`;
    }
  }

  // Column headers: always include an "Invites" column (counters + last invite).
  const activeList = (m.id === "active");
  const overlayHead = `<th>Invites</th>`;
  const headHtml = activeList
    ? `<th>Name</th><th>Firm</th><th>Location</th><th>Last</th>${overlayHead}<th></th>`
    : (isTagged
      ? `<th>Name</th><th>Firm</th><th>Location</th><th>Last</th>${overlayHead}<th>Why</th><th></th>`
      : `<th>Name</th><th>Firm</th><th>Type</th><th>Location</th><th>Last</th>${overlayHead}<th>Note</th><th></th>`);
  const colCount = headHtml.split("<th").length - 1;

  const eventFilterHtml = ""; // event-filter mode retired — per-person invite chip replaces it

  wrap.innerHTML = `
    <div class="rolodex-detail-head">
      <div>
        <h2 class="rd-name">${m.name}</h2>
        <div class="rd-purpose">${m.purpose}</div>
      </div>
      <button class="btn-add" data-add-to="${m.id}">+ Add to this list</button>
    </div>
    ${eventFilterHtml}
    ${nudgeHtml}
    <div class="rolodex-detail-body">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${body || `<tr><td colspan="${colCount}" style="color:var(--ink-4);padding:14px 10px">No matches.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  // Wire "×" uninvite buttons on the invite summary chip.
  wrap.querySelectorAll("[data-uninvite]").forEach(b => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const invId = b.dataset.uninvite;
    if (!confirm("Remove this invite? This undoes their most recent invite entirely.")) return;
    try {
      await deleteInvitee(invId);
      await loadAll();
      renderLists();
      renderInvites();
      toast("Invite removed.");
    } catch (err) { toast("Undo failed."); }
  }));

  wrap.querySelectorAll("[data-promote]").forEach(b => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const cid = b.dataset.promote;
    const arr = (S.ds[m.fromState] || []).map(r =>
      r.contact_id === cid ? { ...r, tag: "legacy", tagged_at: iso(TODAY) } : r
    );
    S.ds[m.fromState] = arr;
    await saveState(m.fromState, arr);
    renderLists();
    toast("Promoted to legacy.");
  }));

  wrap.querySelectorAll("[data-log]").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    openLogTouchModal(b.dataset.log);
  }));
  wrap.querySelectorAll("[data-hide]").forEach(b => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const [modId, cid] = b.dataset.hide.split(":");
    const mod = MODULES.find(x => x.id === modId);
    const contactName = S.contactById[cid]?.full_name || "contact";
    // For focus lists (fromState), "Remove" actually removes from the underlying array.
    if (mod && mod.fromState) {
      const prevArr = [...(S.ds[mod.fromState] || [])];
      const removedRow = prevArr.find(r => r.contact_id === cid); // preserve tag + why for undo
      const arr = prevArr.filter(r => r.contact_id !== cid);
      S.ds[mod.fromState] = arr;
      await saveState(mod.fromState, arr);
      renderLists();
      toast(`Removed ${contactName}.`, async () => {
        // Undo: restore the exact row (with tag, why, tagged_at) in its original position.
        S.ds[mod.fromState] = prevArr;
        await saveState(mod.fromState, prevArr);
        renderLists();
      });
      return;
    }
    const prevPins = JSON.parse(JSON.stringify(S.ds.list_pins || {}));
    const pins = { ...(S.ds.list_pins||{}) };
    pins[modId] = pins[modId] || { add:[], hide:[] };
    if (!pins[modId].hide.includes(cid)) pins[modId].hide.push(cid);
    S.ds.list_pins = pins;
    await saveState("list_pins", pins);
    renderLists();
    toast(`Hid ${contactName}.`, async () => {
      S.ds.list_pins = prevPins;
      await saveState("list_pins", prevPins);
      renderLists();
    });
  }));
  wrap.querySelectorAll("[data-add-to]").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    const modId = b.dataset.addTo;
    const mod = MODULES.find(x => x.id === modId);
    if (mod && mod.fromState) return openAddFocusModal(mod.fromState); // hot10 / warm15
    openAddToListModal(modId);
  }));
}

// ---------- Modals ----------
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modal-body");
const modalTitle = document.getElementById("modal-title");
function openModal(title, html){
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.hidden = false;
}
function closeModal(){ modal.hidden = true; modalBody.innerHTML = ""; }
document.addEventListener("click", (e) => { if (e.target.matches("[data-close]") || e.target === modal) closeModal(); });

function contactCombo(name, placeholder){
  return `<div class="combo">
    <input type="text" id="${name}" placeholder="${placeholder}" autocomplete="off"/>
    <div class="combo-list" id="${name}-list" hidden></div>
  </div>`;
}
function wireCombo(name, onPick){
  const input = document.getElementById(name);
  const list  = document.getElementById(name+"-list");
  let matches = [];
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { list.hidden = true; return; }
    matches = S.contacts.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.company||"").toLowerCase().includes(q)
    ).slice(0, 8);
    list.innerHTML = matches.map(c =>
      `<div data-cid="${c.id}">${c.full_name}<span class="company"> · ${c.company||""}</span></div>`
    ).join("") || `<div style="color:var(--ink-4)">no match</div>`;
    list.hidden = matches.length === 0;
  });
  list.addEventListener("click", (e) => {
    const d = e.target.closest("[data-cid]");
    if (!d) return;
    const c = S.contactById[d.dataset.cid];
    input.value = c.full_name;
    input.dataset.cid = c.id;
    list.hidden = true;
    onPick && onPick(c);
  });
  input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));
}

function openLogTouchModal(cid){
  const today = iso(TODAY);
  const c = cid ? S.contactById[cid] : null;
  const title = c ? `Log interaction · ${c.full_name}` : "Log interaction";
  const contactField = c
    ? `<input type="hidden" id="lt-cid" value="${cid}"/>`
    : `<label>Contact</label>${contactCombo("lt-name","Type a name or firm")}`;
  openModal(title, `
    ${contactField}
    <label>Date</label>
    <input type="date" id="lt-date" value="${today}"/>
    <label>Type</label>
    <select id="lt-type">
      <option value="meeting">meeting</option>
      <option value="call">call</option>
      <option value="coffee">coffee</option>
      <option value="lunch">lunch</option>
      <option value="dinner">dinner</option>
      <option value="golf">golf</option>
      <option value="email">email</option>
      <option value="intro">intro</option>
      <option value="event">event</option>
      <option value="zoom">zoom</option>
      <option value="trip-meeting">trip-meeting</option>
    </select>
    <label>Source</label>
    <select id="lt-source">
      <option value="charles_debrief">CS debrief</option>
      <option value="manual">manual</option>
      <option value="agent_prompted">agent</option>
    </select>
    <label>Notes (optional)</label>
    <textarea id="lt-notes" placeholder="Notes"></textarea>
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="lt-save">Log touch</button>
    </div>
  `);
  if (!c) wireCombo("lt-name");
  document.getElementById("lt-save").addEventListener("click", async () => {
    const contactId = c ? cid : document.getElementById("lt-name").dataset.cid;
    if (!contactId) return alert("Pick a contact from the suggestions.");
    const date   = document.getElementById("lt-date").value;
    const type   = document.getElementById("lt-type").value;
    const source = document.getElementById("lt-source").value;
    const notes  = document.getElementById("lt-notes").value.trim();
    try {
      const row = await req(`/interactions`, {
        method: "POST",
        body: JSON.stringify({
          contact_id: contactId, date, type, source,
          notes: notes || `Logged from board by ${AUTHOR}`,
        }),
      });
      // Update local state
      S.interactions.unshift(Array.isArray(row) ? row[0] : row);
      if (!S.lastByContact[contactId] || date > S.lastByContact[contactId]) S.lastByContact[contactId] = date;
      if (type === "golf") S.golfWith.add(contactId);
      closeModal();
      renderLists(); renderNeeds();
      toast("Interaction saved.");
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  });
}

function openAddToListModal(modId){
  const mod = MODULES.find(m => m.id === modId);
  openModal(`Add to ${mod.name}`, `
    <label>Contact</label>
    ${contactCombo("at-name","Type a name or firm")}
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="at-save">Add</button>
    </div>`);
  wireCombo("at-name");
  document.getElementById("at-save").addEventListener("click", async () => {
    const cid = document.getElementById("at-name").dataset.cid;
    if (!cid) return alert("Pick a contact from the suggestions.");
    const pins = { ...(S.ds.list_pins||{}) };
    pins[modId] = pins[modId] || { add:[], hide:[] };
    if (!pins[modId].add.includes(cid)) pins[modId].add.push(cid);
    // Also un-hide if it was hidden
    pins[modId].hide = (pins[modId].hide||[]).filter(x => x !== cid);
    S.ds.list_pins = pins;
    await saveState("list_pins", pins);
    closeModal(); renderLists();
    toast("Added to list.");
  });
}

function openAddFocusModal(slot){
  // Active list: capture tag (legacy vs new) alongside the why.
  const isActive = slot === "active";
  const modName = (MODULES.find(m => m.fromState === slot) || {}).name || "list";
  const tagField = isActive
    ? `<label>Tag</label>
       <div class="tag-radio-row">
         <label class="tag-radio"><input type="radio" name="t10-tag" value="new" checked> new — solidifying</label>
         <label class="tag-radio"><input type="radio" name="t10-tag" value="legacy"> legacy — keep warm</label>
       </div>`
    : "";
  openModal(`Add to ${modName}`, `
    <label>Contact</label>
    ${contactCombo("t10-name","Type a name")}
    ${tagField}
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="t10-save">Add</button>
    </div>`);
  wireCombo("t10-name");
  document.getElementById("t10-save").addEventListener("click", async () => {
    const cid = document.getElementById("t10-name").dataset.cid;
    if (!cid) return alert("Pick a contact.");
    const tag = isActive
      ? (document.querySelector('input[name="t10-tag"]:checked')?.value || "new")
      : undefined;
    await addToFocus(slot, cid, "", tag);
    closeModal();
  });
}

// ---------- Event invitee writes ----------
async function updateInviteeStatus(invId, status) {
  await req(`/event_invitees?id=eq.${encodeURIComponent(invId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
async function deleteInvitee(invId) {
  await req(`/event_invitees?id=eq.${encodeURIComponent(invId)}`, { method: "DELETE" });
}
async function addInvitee(eventId, contactId) {
  const rows = await req(`/event_invitees`, {
    method: "POST",
    body: JSON.stringify({ event_id: eventId, contact_id: contactId, status: "accepted" }),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function openAddGuestModal(eventId){
  const ev = S.events.find(e => e.id === eventId);
  if (!ev) return;
  const already = new Set(S.invitees.filter(i => i.event_id === eventId).map(i => i.contact_id));
  openModal(`Add guest · ${escapeHtml(ev.name || "event")}`, `
    <label>Contact</label>
    ${contactCombo("ag-name","Type a name or firm")}
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="ag-save">Add guest</button>
    </div>`);
  wireCombo("ag-name");
  document.getElementById("ag-save").addEventListener("click", async () => {
    const cid = document.getElementById("ag-name").dataset.cid;
    if (!cid) return alert("Pick a contact from the suggestions.");
    if (already.has(cid)) return alert("That contact is already on this event.");
    try {
      const row = await addInvitee(eventId, cid);
      if (row) S.invitees.push(row);
      closeModal(); renderCalendar(); renderNeeds();
      toast("Guest added.");
    } catch (e) { alert("Add failed: " + e.message); }
  });
}

function openEditSlotsModal(){
  const a = S.ds.assets || {};
  // group / label / auto (uses calendar for "used") / unlimited (no budget) / defaultBudget
  const rows = [
    { g:"Golf",    k:"pv_cs",        lbl:"Pine Valley (CS)",     auto: true,  defaultBudget: 3 },
    { g:"Golf",    k:"pv_chris",     lbl:"Pine Valley (CC)",     auto: false, defaultBudget: 3 },
    { g:"Golf",    k:"sebonack",     lbl:"Sebonack w/ JAV",      auto: true,  unlimited: true },
    { g:"Golf",    k:"sleepy",       lbl:"Sleepy Hollow rounds", auto: true,  defaultBudget: 12 },
    { g:"Golf",    k:"chechessee",   lbl:"Chechessee (SC)",      auto: false, unlimited: true },
    { g:"Golf",    k:"dye_preserve", lbl:"Dye Preserve (FL)",    auto: true,  defaultBudget: 2 },
    { g:"Golf",    k:"floridian",    lbl:"Floridian (FL)",       auto: true,  defaultBudget: 2 },
    { g:"Dinners", k:"nyc_dinner",   lbl:"NYC dinner",           auto: false, defaultBudget: 4 },
    { g:"Dinners", k:"sf_dinner",    lbl:"SF dinner",            auto: false, defaultBudget: 2 },
    { g:"Dinners", k:"chicago_dinner", lbl:"Chicago dinner",     auto: false, defaultBudget: 2 },
    { g:"Dinners", k:"dallas_dinner",  lbl:"Dallas dinner",      auto: false, defaultBudget: 2 },
    { g:"Dinners", k:"london_dinner",  lbl:"London dinner",      auto: false, defaultBudget: 1 },
    { g:"Dinners", k:"sc_dinner",    lbl:"SC dinner",            auto: false, defaultBudget: 1 },
  ];
  const oneRow = (r) => {
    const v = a[r.k] || {};
    const budget = v.budget ?? r.defaultBudget ?? 0;
    const used = v.used_manual ?? 0;
    const note = v.note || "";
    const budgetField = r.unlimited
      ? `<label class="muted" title="No cap — counted for context only">Cap <span class="auto-badge">none</span></label>`
      : `<label>Budget<input type="number" min="0" data-f="budget" value="${budget}"></label>`;
    const usedField = r.auto
      ? `<label class="muted" title="Counted automatically from calendar events">Used <span class="auto-badge">auto</span></label>`
      : `<label>Used<input type="number" min="0" data-f="used_manual" value="${used}"></label>`;
    return `<div class="slot-edit-row" data-k="${r.k}">
      <div class="slot-edit-lbl">${r.lbl}</div>
      <div class="slot-edit-fields">${budgetField}${usedField}</div>
      <label class="slot-edit-note">Note<input type="text" data-f="note" value="${escapeHtml(note)}" placeholder="Short context or coordination note"></label>
    </div>`;
  };
  const groups = ["Golf","Dinners"];
  const rowHtml = groups.map(g => `
    <div class="slot-edit-group-lbl">${g}</div>
    ${rows.filter(r=>r.g===g).map(oneRow).join("")}
  `).join("");
  openModal("Edit hosting assets", `
    ${rowHtml}
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="slots-save">Save</button>
    </div>`);
  document.getElementById("slots-save").addEventListener("click", async () => {
    const next = { ...(S.ds.assets || {}) };
    document.querySelectorAll(".slot-edit-row[data-k]").forEach(row => {
      const k = row.dataset.k;
      const cur = { ...(next[k] || {}) };
      row.querySelectorAll("[data-f]").forEach(inp => {
        const f = inp.dataset.f;
        if (f === "budget" || f === "used_manual") {
          const n = parseInt(inp.value, 10);
          if (!Number.isNaN(n)) cur[f] = n;
        } else {
          cur[f] = inp.value.trim();
        }
      });
      next[k] = cur;
    });
    S.ds.assets = next;
    await saveState("assets", next);
    closeModal(); renderAssets(); renderNeeds();
    toast("Slots updated.");
  });
}

function openEditNotesModal(){
  const arr = S.ds.calendar_notes || [];
  openModal("Edit calendar notes", `
    <label>One bullet per line</label>
    <textarea id="cn-text" style="min-height:160px">${escapeHtml(arr.join("\n"))}</textarea>
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="cn-save">Save</button>
    </div>`);
  document.getElementById("cn-save").addEventListener("click", async () => {
    const lines = document.getElementById("cn-text").value.split("\n").map(s => s.trim()).filter(Boolean);
    S.ds.calendar_notes = lines;
    await saveState("calendar_notes", lines);
    closeModal(); renderCalendar(); renderNeeds();
    toast("Notes saved.");
  });
}

// ---------- Save helper ----------
async function saveState(key, value){
  // Upsert (on_conflict=key) so brand-new keys create their row instead of
  // silently no-op'ing (PATCH doesn't insert). Prefer: resolution=merge-duplicates
  // makes PostgREST treat the POST as an upsert.
  await req(`/dashboard_state?on_conflict=key`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: AUTHOR,
    }),
  });
}

// ---------- Toast + helpers ----------
const toastEl = document.getElementById("toast");
let toastT;
// toast(msg) — plain confirmation, hides after 2.2s.
// toast(msg, undoFn) — shows an "Undo" button; timeout extends to 6s.
//   undoFn is called if the user clicks Undo before the toast hides.
function toast(msg, undoFn){
  toastEl.innerHTML = "";
  const label = document.createElement("span");
  label.className = "toast-label";
  label.textContent = msg;
  toastEl.appendChild(label);
  if (typeof undoFn === "function") {
    const btn = document.createElement("button");
    btn.className = "toast-undo";
    btn.type = "button";
    btn.textContent = "Undo";
    btn.addEventListener("click", async () => {
      clearTimeout(toastT);
      toastEl.hidden = true;
      try { await undoFn(); toast("Undone."); }
      catch (e) { toast("Undo failed: " + (e.message || e)); }
    });
    toastEl.appendChild(btn);
  }
  toastEl.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.hidden = true; }, undoFn ? 6000 : 2200);
}
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function truncate(s,n){ s = String(s||""); return s.length > n ? s.slice(0,n-1)+"…" : s; }

// ---------- Calendar mode toggle ----------
document.querySelectorAll("[data-cal-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    CAL_MODE = btn.dataset.calMode;
    renderCalendar(); renderNeeds();
  });
});

// ---------- Log interaction (calendar tab) ----------
document.getElementById("cal-log-btn")?.addEventListener("click", () => openLogTouchModal());

// ---------- Follow-Ups tab ----------
let FU_FILTER = "open"; // open | all | completed

function fuAgeBadge(createdAt){
  const created = new Date(createdAt);
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  let cls = "age-fresh", txt = `${days}d`;
  if (days >= 21) { cls = "age-stale"; }
  else if (days >= 10) { cls = "age-warm"; }
  return `<span class="fu-badge ${cls}" title="Days since created">⏱ ${txt}</span>`;
}

function fuSourceBadge(f){
  const t = (f.source_type || "").toLowerCase();
  if (!t) return `<span class="fu-badge">note</span>`;
  let label = t;
  let extra = "";
  if (t === "event" && f.source_ref) {
    const ev = S.events.find(e => e.id === f.source_ref);
    if (ev) extra = ` · ${escapeHtml(ev.name)} (${ev.event_date})`;
  }
  return `<span class="fu-badge src-${t}">${label}</span>${extra ? `<span class="muted" style="font-size:11px">${extra}</span>` : ""}`;
}

function fuContactChips(f){
  const ids = [f.contact_id, ...((f.extra_contact_ids || []))];
  const seen = new Set();
  const chips = ids.filter(id => id && !seen.has(id) && seen.add(id)).map(id => {
    const c = S.contactById[id];
    if (!c) return `<span class="fu-chip" title="Unknown">${escapeHtml(id)}</span>`;
    return `<span class="fu-chip" data-contact-id="${c.id}" title="${escapeHtml(c.company||"")}">${escapeHtml(c.full_name)}</span>`;
  }).join("");
  return chips ? `<div class="fu-chips">${chips}</div>` : "";
}

function renderFollowUps(){
  const wrap = document.getElementById("followups-body");
  if (!wrap) return;

  // Render Themes strip at top of the panel (absorbed from old Themes tab).
  renderThemesStrip();

  const all = S.followups || [];
  let rows = all;
  if (FU_FILTER === "open") rows = all.filter(f => f.status === "open" || f.status === "invited");
  else if (FU_FILTER === "completed") rows = all.filter(f => f.status === "completed");

  // Optional thread-focus filter (set when jumping from This Week strip).
  if (window.THREADS_FILTER_THREAD) {
    rows = rows.filter(f => (f.thread || "") === window.THREADS_FILTER_THREAD);
  }

  if (!rows.length) {
    wrap.innerHTML = `<div class="fu-empty">Nothing in this view.</div>`;
    return;
  }

  rows = rows.slice().sort((a, b) => {
    if (FU_FILTER === "completed") {
      return (b.completed_at || b.created_at || "").localeCompare(a.completed_at || a.created_at || "");
    }
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  // Build theme thread → theme name map for badge rendering.
  const themes = Array.isArray(S.ds.themes) ? S.ds.themes : [];
  const threadToTheme = {};
  for (const t of themes) {
    for (const th of (t.fu_threads || [])) threadToTheme[th] = t.name;
  }

  // Group by thread. Order: threads that belong to a Theme first (grouped by theme), then other threads, then untagged (solos).
  const byThread = new Map();
  const orderedThreads = [];
  for (const r of rows) {
    const key = r.thread || `__untagged__`;
    if (!byThread.has(key)) { byThread.set(key, []); orderedThreads.push(key); }
    byThread.get(key).push(r);
  }
  // Sort thread keys: theme-linked first, then plain threads, then __untagged__ last.
  orderedThreads.sort((a, b) => {
    const aUn = a === "__untagged__" ? 2 : (threadToTheme[a] ? 0 : 1);
    const bUn = b === "__untagged__" ? 2 : (threadToTheme[b] ? 0 : 1);
    if (aUn !== bUn) return aUn - bUn;
    return a.localeCompare(b);
  });

  const rowHtml = (f) => {
    const kind = f.item_kind || (f.due_date ? "commitment" : "takeaway");
    const kindBadge = kind === "commitment"
      ? `<span class="fu-badge kind-commit" title="Commitment — has an action / due date">commitment</span>`
      : `<span class="fu-badge kind-takeaway" title="Takeaway — standing observation, no date">takeaway</span>`;
    // Hide owner badge when it's CS (default perspective) — only show when someone else owns it.
    const owner = (f.owner && f.owner !== "CS") ? `<span class="fu-badge owner" title="Owner">${escapeHtml(f.owner)}</span>` : "";
    const overdue = f.due_date && f.due_date < iso(TODAY) && (f.status === "open" || f.status === "invited");
    const dueTxt = f.due_date ? `<span class="muted" style="font-size:11px">due ${f.due_date}</span>` : "";
    const done = f.status === "completed" || f.status === "dismissed";
    const archiveLbl = kind === "commitment" ? "Done" : "Archive";
    return `<div class="fu-row fu-${kind} ${done?'is-done':''} ${overdue?'is-overdue':''}" data-fu-id="${f.id}">
      <div>
        <div class="fu-head">
          ${kindBadge}
          ${owner}
          ${fuAgeBadge(f.created_at)}
          ${dueTxt}
        </div>
        <div class="fu-note">${escapeHtml(f.note || "")}</div>
        ${fuContactChips(f)}
      </div>
      <div class="fu-actions">
        ${done ? `<button data-fu-reopen>Reopen</button>` : `<button class="done" data-fu-done>${archiveLbl}</button><button class="dismiss" data-fu-dismiss>Dismiss</button>`}
        <button data-fu-edit>Edit</button>
      </div>
    </div>`;
  };

  // Group header with theme badge if applicable.
  let lastTheme = null;
  const html = orderedThreads.map(key => {
    const list = byThread.get(key);
    let heading = "";
    if (key === "__untagged__") {
      if (lastTheme !== "__u") { lastTheme = "__u"; heading = `<div class="fu-group-lbl untagged-lbl">Untagged</div>`; }
    } else {
      const themeName = threadToTheme[key];
      if (themeName && lastTheme !== themeName) {
        heading += `<div class="fu-theme-lbl">Theme: ${escapeHtml(themeName)}</div>`;
        lastTheme = themeName;
      } else if (!themeName && lastTheme !== "__plain") {
        heading += `<div class="fu-theme-lbl fu-plain-lbl">Other threads</div>`;
        lastTheme = "__plain";
      }
      heading += `<div class="fu-group-lbl">${escapeHtml(key)}</div>`;
    }
    return heading + `<div class="fu-list">${list.map(rowHtml).join("")}</div>`;
  }).join("");

  // If a thread filter is active, show a Clear chip at top.
  const clearChip = window.THREADS_FILTER_THREAD
    ? `<div class="fu-filter-chip">Filtered: ${escapeHtml(window.THREADS_FILTER_THREAD)} <button class="linky" id="fu-clear-filter">Clear</button></div>`
    : "";

  wrap.innerHTML = clearChip + html;

  const clr = document.getElementById("fu-clear-filter");
  if (clr) clr.addEventListener("click", () => { window.THREADS_FILTER_THREAD = null; renderFollowUps(); });
}

function renderThemesStrip(){
  const strip = document.getElementById("themes-strip");
  if (!strip) return;
  const themes = Array.isArray(S.ds.themes) ? S.ds.themes : [];
  if (!themes.length) { strip.innerHTML = ""; return; }
  const html = themes.map(t => {
    const openCt = (S.followups || []).filter(f =>
      (f.status === "open" || f.status === "invited") &&
      (t.fu_threads || []).includes(f.thread)
    ).length;
    const nameEsc = escapeHtml(t.name);
    const thesisEsc = escapeHtml(t.thesis || "");
    return `<div class="theme-tile">
      <div class="theme-tile-head">
        <span class="theme-tile-name">${nameEsc}</span>
        <span class="theme-tile-count">${openCt} open</span>
      </div>
      <div class="theme-tile-thesis">${thesisEsc}</div>
    </div>`;
  }).join("");
  strip.innerHTML = `<div class="themes-strip"><div class="themes-strip-head">Active workstreams</div><div class="theme-tiles">${html}</div></div>`;
}

async function fuUpdate(id, patch){
  const rows = await req(`/followups?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  const updated = Array.isArray(rows) ? rows[0] : rows;
  if (updated) {
    const i = S.followups.findIndex(f => f.id === id);
    if (i >= 0) S.followups[i] = updated;
  }
  renderFollowUps();
}

async function fuInsert(payload){
  const rows = await req(`/followups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const inserted = Array.isArray(rows) ? rows[0] : rows;
  if (inserted) S.followups.unshift(inserted);
  renderFollowUps();
}

document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-fu-id]");
  if (!row) return;
  const id = row.dataset.fuId;
  if (e.target.closest("[data-fu-done]")) {
    fuUpdate(id, { status: "completed", completed_at: new Date().toISOString() });
    toast("Marked done.");
  } else if (e.target.closest("[data-fu-dismiss]")) {
    fuUpdate(id, { status: "dismissed", completed_at: new Date().toISOString() });
    toast("Dismissed.");
  } else if (e.target.closest("[data-fu-reopen]")) {
    fuUpdate(id, { status: "open", completed_at: null });
    toast("Reopened.");
  } else if (e.target.closest("[data-fu-edit]")) {
    const f = S.followups.find(x => x.id === id);
    if (f) openEditFollowUpModal(f);
  }
});

document.querySelectorAll("[data-fu-filter]").forEach(b => {
  b.addEventListener("click", () => {
    FU_FILTER = b.dataset.fuFilter;
    document.querySelectorAll("[data-fu-filter]").forEach(x => x.classList.toggle("is-active", x === b));
    renderFollowUps();
  });
});

document.getElementById("fu-add-btn")?.addEventListener("click", () => openEditFollowUpModal(null));

function openEditFollowUpModal(f){
  const isNew = !f;
  const cur = f || { status:"open", source_type:"meeting", owner:"CS" };
  openModal(isNew ? "New follow-up" : "Edit follow-up", `
    <label>Thread (short label) <input type="text" id="fu-thread" value="${escapeHtml(cur.thread||"")}" placeholder="e.g. Zubin mixed-use"></label>
    <label>Source
      <select id="fu-source">
        ${["event","meeting","call","email","note"].map(s => `<option value="${s}" ${s===(cur.source_type||"meeting")?"selected":""}>${s}</option>`).join("")}
      </select>
    </label>
    <label>Owner <input type="text" id="fu-owner" value="${escapeHtml(cur.owner||"CS")}" placeholder="CS / KZ / Brian / ..."></label>
    <label>Primary contact <input type="text" id="fu-contact" value="${escapeHtml(cur.contact_id||"")}" placeholder="contact_id (c_xxxx)"></label>
    <label>Extra contact IDs (comma-separated)
      <input type="text" id="fu-extra" value="${escapeHtml((cur.extra_contact_ids||[]).join(", "))}">
    </label>
    <label>Due date (optional) <input type="date" id="fu-due" value="${cur.due_date||""}"></label>
    <label>Note <textarea id="fu-note" style="min-height:100px">${escapeHtml(cur.note||"")}</textarea></label>
    <div class="modal-actions">
      <button data-close>Cancel</button>
      <button class="primary" id="fu-save">Save</button>
    </div>`);
  document.getElementById("fu-save").addEventListener("click", async () => {
    const extra = document.getElementById("fu-extra").value
      .split(",").map(s => s.trim()).filter(Boolean);
    const payload = {
      contact_id: document.getElementById("fu-contact").value.trim() || null,
      thread: document.getElementById("fu-thread").value.trim() || null,
      source_type: document.getElementById("fu-source").value,
      owner: document.getElementById("fu-owner").value.trim() || null,
      due_date: document.getElementById("fu-due").value || null,
      note: document.getElementById("fu-note").value.trim(),
      extra_contact_ids: extra.length ? extra : null,
    };
    try {
      if (isNew) {
        payload.status = "open";
        await fuInsert(payload);
        toast("Follow-up added.");
      } else {
        await fuUpdate(f.id, payload);
        toast("Follow-up saved.");
      }
      closeModal();
    } catch (e) { alert("Save failed: " + e.message); }
  });
}

// ---------- Tab switching ----------
function activateTab(target){
  document.querySelectorAll(".tab").forEach(b => {
    const on = b.dataset.tab === target;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach(p => {
    const on = p.dataset.panel === target;
    p.hidden = !on;
    p.classList.toggle("is-active", on);
  });
}
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Jump-to-list link inside Open Items pins.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-jump-list]");
  if (!btn) return;
  const modId = btn.dataset.jumpList;
  activateTab("lists");
  const item = document.querySelector(`[data-mod="${modId}"]`);
  if (item) item.click();
  // Wait for detail pane to render, then scroll page to the list card.
  setTimeout(() => {
    const card = document.querySelector(".rolodex-detail-head")?.closest(".card")
              || document.querySelector(".rolodex-detail-head");
    (card || item)?.scrollIntoView({block:"start", behavior:"smooth"});
  }, 60);
});

// ---------- Invites (person-view) ----------
// One row per person, sorted by most-recent invite date. Purpose: track that we've
// touched someone recently — even if we haven't SEEN them recently. Each row lists
// their invites stacked with status; status is editable in place.
let INVITES_FILTER = "all"; // all | pending | confirmed | declined | recent30

function renderInvites(){
  const wrap = document.getElementById("invites-body");
  if (!wrap) return;

  const todayIso = iso(TODAY);
  const daysAgoIso = (n) => iso(new Date(TODAY.getTime() - n*86400000));
  const daysAheadIso = (n) => iso(new Date(TODAY.getTime() + n*86400000));

  // Window: last 60 days of events + next 90 days (captures recent touches + upcoming).
  const winStart = daysAgoIso(60);
  const winEnd = daysAheadIso(90);
  const eventsById = {};
  for (const e of (S.events || [])) {
    if ((e.event_date || "") >= winStart && (e.event_date || "") <= winEnd) {
      eventsById[e.id] = e;
    }
  }

  // Group invitees by contact, keeping only invitees for events in window.
  const byContact = {};
  for (const iv of (S.invitees || [])) {
    if (!eventsById[iv.event_id]) continue;
    (byContact[iv.contact_id] ||= []).push(iv);
  }

  const STATUS_LABEL = { confirmed:"Confirmed", accepted:"Confirmed", tentative:"Tentative", invited:"Invited", selected:"Shortlisted", declined:"Declined", played:"Played", attended:"Attended" };
  const STATUS_CLASS = { confirmed:"chip-yes", accepted:"chip-yes", attended:"chip-yes", tentative:"chip-maybe", invited:"chip-open", selected:"chip-open", declined:"chip-no", played:"chip-done" };

  // Build rows: [{contact, mostRecent, invites: [{iv, event}]}]
  const rows = [];
  for (const [cid, ivs] of Object.entries(byContact)) {
    const c = S.contactById[cid];
    if (!c) continue;
    const enriched = ivs.map(iv => ({ iv, event: eventsById[iv.event_id] }))
      .sort((a,b) => (b.event.event_date || "").localeCompare(a.event.event_date || ""));
    const mostRecent = enriched[0].event.event_date;
    rows.push({ contact: c, mostRecent, invites: enriched });
  }

  // Apply filter.
  const isConfirmed = s => ["confirmed","accepted","attended"].includes(String(s||"").toLowerCase());
  const isDeclined = s => String(s||"").toLowerCase() === "declined";
  const isPending = s => ["invited","selected","tentative"].includes(String(s||"").toLowerCase());

  let filtered = rows;
  if (INVITES_FILTER === "pending") filtered = rows.filter(r => r.invites.some(x => isPending(x.iv.status)));
  else if (INVITES_FILTER === "confirmed") filtered = rows.filter(r => r.invites.some(x => isConfirmed(x.iv.status)));
  else if (INVITES_FILTER === "declined") filtered = rows.filter(r => r.invites.some(x => isDeclined(x.iv.status)));
  else if (INVITES_FILTER === "recent30") filtered = rows.filter(r => r.mostRecent >= daysAgoIso(30));

  filtered.sort((a,b) => (b.mostRecent || "").localeCompare(a.mostRecent || ""));

  const filterBar = `<div class="inv-filter-bar">
    ${[["all","All"],["pending","Pending"],["confirmed","Confirmed"],["declined","Declined"],["recent30","Last 30 days"]].map(([v,l]) =>
      `<button class="inv-filter-chip ${INVITES_FILTER===v?'is-active':''}" data-inv-filter="${v}">${l}</button>`
    ).join("")}
    <span class="muted" style="margin-left:auto;font-size:12px">${filtered.length} ${filtered.length===1?'person':'people'}</span>
  </div>`;

  if (!filtered.length) {
    wrap.innerHTML = filterBar + `<div style="color:var(--ink-4);padding:14px 0">No people match this filter.</div>`;
  } else {
    const daysSince = (d) => Math.max(0, Math.round((new Date(todayIso) - new Date(d)) / 86400000));

    const html = filtered.map(r => {
      const c = r.contact;
      const firm = c.company ? `<span class="muted">· ${escapeHtml(c.company)}</span>` : "";
      const ago = daysSince(r.mostRecent);
      const agoLabel = ago === 0 ? "today" : (ago === 1 ? "yesterday" : `${ago}d ago`);
      const isFuture = r.mostRecent > todayIso;
      const agoChip = isFuture ? `<span class="inv-ago-chip inv-ago-future">upcoming</span>` : `<span class="inv-ago-chip">${agoLabel}</span>`;

      const invRows = r.invites.map(({ iv, event }) => {
        const s = String(iv.status || "invited").toLowerCase();
        const chip = `<span class="inv-chip ${STATUS_CLASS[s] || 'chip-open'}">${STATUS_LABEL[s] || s}</span>`;
        const evName = event.name || "(untitled event)";
        const evMeta = `${event.event_date}${event.venue ? " · " + escapeHtml(event.venue) : ""}`;
        return `<div class="inv-p-line" data-iv-id="${iv.id}">
          <div class="inv-p-line-txt">
            <span class="inv-p-evname">${escapeHtml(evName)}</span>
            <span class="muted inv-p-evmeta">· ${escapeHtml(evMeta)}</span>
          </div>
          <div class="inv-p-line-right">
            ${chip}
            <select class="inv-p-status" data-iv-status="${iv.id}">
              ${["invited","tentative","confirmed","declined"].map(opt =>
                `<option value="${opt}" ${s===opt||(s==="accepted"&&opt==="confirmed")?"selected":""}>${opt}</option>`
              ).join("")}
            </select>
            <button class="inv-undo" data-uninvite="${iv.id}" title="Undo invite / remove">×</button>
          </div>
        </div>`;
      }).join("");

      return `<div class="inv-person">
        <div class="inv-p-head">
          <div class="inv-p-name"><strong>${escapeHtml(c.full_name)}</strong> ${firm}</div>
          ${agoChip}
        </div>
        <div class="inv-p-lines">${invRows}</div>
      </div>`;
    }).join("");

    wrap.innerHTML = filterBar + html;
  }

  // Wire filter chips.
  wrap.querySelectorAll("[data-inv-filter]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      INVITES_FILTER = btn.dataset.invFilter;
      renderInvites();
    });
  });

  // Wire status changes.
  wrap.querySelectorAll("[data-iv-status]").forEach(sel => {
    sel.addEventListener("change", async () => {
      const id = sel.dataset.ivStatus;
      const val = sel.value;
      try {
        await req(`/event_invitees?id=eq.${id}`, {
          method:"PATCH",
          headers:{"Content-Type":"application/json","Prefer":"return=minimal"},
          body:JSON.stringify({ status: val })
        });
        toast(`Set to ${val}.`);
        await loadAll();
        renderInvites();
      } catch (e) {
        toast("Save failed.");
      }
    });
  });

  // Wire "×" uninvite buttons.
  wrap.querySelectorAll("[data-uninvite]").forEach(b => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const invId = b.dataset.uninvite;
    if (!confirm("Remove this invite? This undoes the invite entirely.")) return;
    try {
      await deleteInvitee(invId);
      await loadAll();
      renderInvites();
      renderLists();
      toast("Invite removed.");
    } catch (err) { toast("Undo failed."); }
  }));
}

// ---------- Boot ----------
document.getElementById("refresh").addEventListener("click", refresh);
// #add-top10 / #add-warm15 removed with the Focus panel — use the "+ Add to this list"
// button inside the Lists panel (Hot 10 / Warm 15 are now pinned lists).
document.querySelector("[data-edit='calendar_notes']").addEventListener("click", openEditNotesModal);
document.getElementById("edit-slots").addEventListener("click", openEditSlotsModal);
// #add-pin removed — pins now use the inline "+ Add" button in renderNeeds()

async function refresh(){
  try {
    await loadAll();
    // Auto-add removed — Hot 10 is now curated manually. New meets surface in the alert strip.
    renderAsOf(); renderNeeds(); renderCalendar(); renderAssets(); renderAlerts(); renderLists(); renderFollowUps(); renderInvites();
  } catch (e) {
    document.getElementById("calendar-table").innerHTML =
      `<div style="color:var(--danger);padding:12px 0">Load failed: ${escapeHtml(e.message)}</div>`;
  }
}
refresh();
