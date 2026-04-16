const express = require("express");
const path    = require("path");
const router  = express.Router();

// Load real IRCTC train data
let TRAINS = [];
try {
  TRAINS = require(path.join(__dirname, "../data/trains.json"));
} catch (e) {
  console.error("[Trains] Failed to load trains.json:", e.message);
}

// Station code aliases — old codes that changed in new dataset
const STATION_ALIASES = {
  "MMCT": "BCT",   // Mumbai Central (old IRCTC code -> datameet code)
  "CSMT": "CSTM",  // Mumbai CST
};

// Build comprehensive station index from all stops across all trains
function buildStationIndex() {
  const map = {};
  for (const t of TRAINS) {
    if (t.stops) {
      for (const s of t.stops) {
        if (!map[s.code]) map[s.code] = s.name;
      }
    }
    if (!map[t.from]) map[t.from] = t.fromName;
    if (!map[t.to])   map[t.to]   = t.toName;
  }
  return map;
}

const STATIONS = buildStationIndex();

/**
 * Resolve a user query to an array of matching station codes.
 * e.g. "jaipur" -> ["JP"], "mumbai" -> ["BCT","CSTM","BDTS","LTT","DR",...]
 * e.g. "JP" -> ["JP"] (exact code match)
 */
function resolveStationCodes(query) {
  if (!query || !query.trim()) return [];
  const q   = query.trim().toUpperCase();
  const qlo = query.trim().toLowerCase();

  // Check alias map first (e.g. MMCT -> BCT)
  if (STATION_ALIASES[q]) return [STATION_ALIASES[q]];

  // Exact code match — return just that one
  if (STATIONS[q]) return [q];

  // Name contains match — return ALL matching codes (handles multi-station cities)
  const matches = Object.entries(STATIONS)
    .filter(([code, name]) => name.toLowerCase().includes(qlo))
    .map(([code]) => code);

  return matches.length > 0 ? matches : [q]; // fallback to original input
}

/**
 * Check if a train serves ANY of the given station codes
 */
function trainServesAny(train, codes) {
  return codes.some(code => trainServesStation(train, code));
}

/**
 * Get the first matching stop for any of the given codes
 */
function getStopInfoAny(train, codes) {
  for (const code of codes) {
    const s = getStopInfo(train, code);
    if (s) return s;
  }
  return null;
}

/**
 * Direction check across multiple from/to codes
 * Returns true if any fromCode appears before any toCode in the route
 */
function isValidDirectionAny(train, fromCodes, toCodes) {
  if (!train.stops) return true;
  let minFrom = Infinity, minTo = Infinity;
  for (let i = 0; i < train.stops.length; i++) {
    const code = train.stops[i].code;
    if (fromCodes.includes(code) && i < minFrom) minFrom = i;
    if (toCodes.includes(code)   && i < minTo)   minTo   = i;
  }
  if (minFrom === Infinity || minTo === Infinity) return true;
  return minFrom < minTo;
}

/**
 * Check if a train serves a given station (as origin, destination, or stop)
 */
function trainServesStation(train, code) {
  const uc = code.toUpperCase();
  if (train.from === uc || train.to === uc) return true;
  if (train.stops) return train.stops.some(s => s.code === uc);
  return false;
}

/**
 * Get stop info for a station in a train
 */
function getStopInfo(train, code) {
  const uc = code.toUpperCase();
  if (!train.stops) return null;
  return train.stops.find(s => s.code === uc) || null;
}

/**
 * Check if fromStation comes before toStation in a train's route
 */
function isValidDirection(train, fromCode, toCode) {
  if (!train.stops) return true;
  const fromIdx = train.stops.findIndex(s => s.code === fromCode.toUpperCase());
  const toIdx   = train.stops.findIndex(s => s.code === toCode.toUpperCase());
  if (fromIdx === -1 || toIdx === -1) return true; // can't determine, allow
  return fromIdx < toIdx;
}

// GET /api/trains/search?from=NDLS&to=MMCT&date=2026-05-01&class=3A&type=Rajdhani
router.get("/search", (req, res) => {
  const { from, to, date, class: cls, type } = req.query;

  let results = [...TRAINS];

  // Resolve text/code input to all matching station codes
  // e.g. "jaipur" -> ["JP"], "mumbai" -> ["BCT","CSTM","BDTS","LTT",...]
  const fromCodes = from && from.trim() ? resolveStationCodes(from.trim()) : [];
  const toCodes   = to   && to.trim()   ? resolveStationCodes(to.trim())   : [];

  // Filter by origin station
  if (fromCodes.length > 0) {
    results = results.filter(t => trainServesAny(t, fromCodes));
    // Remove trains where from comes AFTER to in the route
    if (toCodes.length > 0) {
      results = results.filter(t => isValidDirectionAny(t, fromCodes, toCodes));
    }
  }

  // Filter by destination station
  if (toCodes.length > 0) {
    results = results.filter(t => trainServesAny(t, toCodes));
  }

  // Filter by train type
  if (type && type.trim()) {
    results = results.filter(t => t.type?.toLowerCase() === type.toLowerCase());
  }

  // Filter by class availability
  if (cls && cls.trim()) {
    results = results.filter(t => t.classes?.includes(cls.trim()));
  }

  // Filter by day of week if date provided
  if (date && date.trim()) {
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const dayName  = dayNames[new Date(date).getDay()];
    results = results.filter(t => !t.days || t.days.includes(dayName));
  }

  // Enrich results with boarding/alighting stop info
  const enriched = results.map(t => {
    let boardStop = null, alightStop = null;
    if (fromCodes.length > 0) boardStop  = getStopInfoAny(t, fromCodes);
    if (toCodes.length > 0)   alightStop = getStopInfoAny(t, toCodes);

    // Build coach list from coaches object
    const coachList = [];
    if (t.coaches && typeof t.coaches === "object") {
      for (const [cls, cnt] of Object.entries(t.coaches)) {
        const prefix = cls === "1A" ? "A" : cls === "2A" ? "B" : cls === "3A" ? "C" :
                       cls === "SL" ? "S" : cls === "CC" ? "D" : cls === "EC" ? "E" : cls;
        for (let i = 1; i <= cnt && i <= 5; i++) coachList.push(`${prefix}${i}`);
      }
    }

    return {
      ...t,
      boardStop,
      alightStop,
      coachList: coachList.slice(0, 15), // cap at 15 coaches
    };
  });

  res.json({ results: enriched, total: enriched.length });
});

// GET /api/trains/stations?q=delhi
router.get("/stations", (req, res) => {
  const { q } = req.query;
  const all   = Object.entries(STATIONS).map(([code, name]) => ({ code, name }));
  if (!q || !q.trim()) return res.json(all.slice(0, 50));
  const query = q.trim().toLowerCase();
  const filtered = all.filter(s =>
    s.code.toLowerCase().includes(query) ||
    s.name.toLowerCase().includes(query)
  );
  // Sort: exact code match first, then shorter names (main junctions before suburbs)
  filtered.sort((a, b) => {
    const aExact = a.code.toLowerCase() === query ? -1 : 0;
    const bExact = b.code.toLowerCase() === query ? -1 : 0;
    if (aExact !== bExact) return aExact - bExact;
    return a.name.length - b.name.length;
  });
  res.json(filtered.slice(0, 20));
});

// GET /api/trains/types — list of available train types
router.get("/types", (req, res) => {
  const types = [...new Set(TRAINS.map(t => t.type).filter(Boolean))].sort();
  res.json(types);
});

// GET /api/trains/:number
router.get("/:number", (req, res) => {
  const t = TRAINS.find(t => t.number === req.params.number);
  if (!t) return res.status(404).json({ error: "Train not found" });
  res.json(t);
});

module.exports = router;
