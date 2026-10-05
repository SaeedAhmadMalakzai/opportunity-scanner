import { OPPORTUNITY_TYPES } from "./types.js";
import { ageInDays } from "./dates.js";

export const HIGH_WEIGHT_TERMS = [
  "project management", "pmp", "capm", "pfmp", "pmi", "agile", "scrum",
  "change management", "ccmp", "program management", "programme management", "portfolio management",
  "strategic management", "strategic planning", "leadership development",
  "executive leadership", "institutional strengthening", "organizational development",
  "monitoring and evaluation", "m&e", "meal", "third party monitoring",
  "project evaluation", "final evaluation", "baseline survey", "data analytics",
  "human resources", "hris", "hrmis", "hr management",
  "recruitment services", "performance management",
  "management information system",
  "capacity building", "training services", "technical assistance"
];

export const MEDIUM_WEIGHT_TERMS = [
  "consultancy", "consultant", "advisory", "technical support",
  "sop", "standard operating procedures", "policy development",
  "operations manual", "code of conduct",
  "business communication", "report writing", "proposal writing",
  "fundraising", "donor relations",
  "entrepreneurship", "sme development", "business development",
  "business planning", "financial literacy", "marketing training",
  "women entrepreneurship", "women-led",
  "training", "workshop", "mentorship", "coaching", "curriculum development",
  "survey design", "impact assessment", "research", "assessment", "audit",
  "organizational assessment", "governance", "anti-fraud",
  "risk management", "quality management",
  "nonprofit management", "ngo management", "tot", "training of trainers"
];

export const NEGATIVE_TERMS = [
  "construction materials", "fuel supply", "hardware procurement",
  "medical equipment", "pharmaceutical", "road construction",
  "vehicle supply", "food supply", "office furniture",
  "generator supply", "fuel procurement", "it equipment supply",
  "supply and delivery", "supply of", "rehabilitation of", "construction of"
];

const WEIGHTS = Object.freeze({
  HIGH: 20, MEDIUM: 10, CUSTOM: 15, NEGATIVE: 20, TITLE_BONUS: 15,
  GEO: 10, OFF_TARGET: 25, TYPE: 10, FRESH_WEEK: 10, FRESH_MONTH: 5, CONFIDENCE_MAX: 8
});

const termCache = new Map();
function termRegex(term) {
  let re = termCache.get(term);
  if (!re) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lead = /^[a-z0-9]/i.test(term) ? "(?<![a-z0-9])" : "";
    const trail = /[a-z0-9]$/i.test(term) ? "(?![a-z0-9])" : "";
    re = new RegExp(`${lead}${esc}${trail}`, "i");
    termCache.set(term, re);
  }
  return re;
}

export function inferType(text) {
  if (/\b(tender|rfp|rfq|eoi|itb|bid|bids|bidding|solicitation|procurement notice|request for (?:proposal|quotation|expression|bids?))\b/i.test(text)) return OPPORTUNITY_TYPES.TENDER;
  if (/\b(training|workshop|course|capacity building|learning program|certification|tot)\b/i.test(text)) return OPPORTUNITY_TYPES.TRAINING;
  if (/\b(consultant|consultancy|technical assistance|advisory|advisor|adviser)\b/i.test(text)) return OPPORTUNITY_TYPES.CONSULTANCY;
  if (/\b(project|program|programme|grant)\b/i.test(text)) return OPPORTUNITY_TYPES.PROJECT;
  return OPPORTUNITY_TYPES.OTHER;
}

export function countMatches(text, keywords) {
  const matched = [];
  for (const term of keywords) {
    if (term && termRegex(term).test(text)) matched.push(term);
  }
  return { count: matched.length, matched };
}

/**
 * Score a raw item 0-100 against the built-in consulting profile plus the user's custom keywords.
 * Pure: returns a new object, never mutates the input.
 */
export function scoreOpportunity(rawItem, settings = {}, now = Date.now()) {
  const title = String(rawItem.title || "").toLowerCase();
  const summary = String(rawItem.summary || "").toLowerCase();
  const location = String(rawItem.location || "").toLowerCase();
  const combined = `${title} ${summary}`;

  const high = countMatches(combined, HIGH_WEIGHT_TERMS);
  const medium = countMatches(combined, MEDIUM_WEIGHT_TERMS);
  const negative = countMatches(combined, NEGATIVE_TERMS);
  const customKeywords = (settings.customKeywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const custom = countMatches(combined, customKeywords);

  let score = high.count * WEIGHTS.HIGH + medium.count * WEIGHTS.MEDIUM + custom.count * WEIGHTS.CUSTOM - negative.count * WEIGHTS.NEGATIVE;
  if (high.count > 0 && countMatches(title, HIGH_WEIGHT_TERMS).count > 0) score += WEIGHTS.TITLE_BONUS;

  const geoHit = (settings.targetGeographies || []).some((g) => {
    const gg = String(g).toLowerCase().trim();
    return gg && (location.includes(gg) || combined.includes(gg));
  });
  if (geoHit) score += WEIGHTS.GEO;
  if (rawItem.offTarget && !geoHit) score -= WEIGHTS.OFF_TARGET; // connector knows the notice is for another country

  const explicitType = rawItem.type && rawItem.type !== OPPORTUNITY_TYPES.OTHER ? rawItem.type : null;
  const type = explicitType || inferType(combined);
  if (type === OPPORTUNITY_TYPES.TENDER || type === OPPORTUNITY_TYPES.CONSULTANCY || type === OPPORTUNITY_TYPES.TRAINING) score += WEIGHTS.TYPE;

  const age = ageInDays(rawItem.postedDate, now);
  if (age !== null && age >= 0) {
    if (age <= 7) score += WEIGHTS.FRESH_WEEK;
    else if (age <= 30) score += WEIGHTS.FRESH_MONTH;
  }

  const parserConfidence = Math.max(0, Math.min(1, typeof rawItem.parserConfidence === "number" ? rawItem.parserConfidence : 0.5));
  score += Math.round(parserConfidence * WEIGHTS.CONFIDENCE_MAX);

  return {
    ...rawItem,
    type,
    score: Math.max(0, Math.min(100, Math.round(score))),
    matchedKeywords: [...new Set([...high.matched, ...medium.matched, ...custom.matched])],
    matchedCustomKeywords: custom.matched,
    parserConfidence
  };
}
