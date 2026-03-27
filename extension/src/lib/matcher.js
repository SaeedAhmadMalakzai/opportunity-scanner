import { OPPORTUNITY_TYPES } from "./types.js";

const HIGH_WEIGHT_TERMS = [
  // Project & Change Management
  "project management", "pmp", "capm", "pfmp", "pmi", "agile", "scrum",
  "change management", "ccmp", "program management", "portfolio management",
  // Strategic & Leadership
  "strategic management", "strategic planning", "leadership development",
  "executive leadership", "institutional strengthening", "organizational development",
  // M&E & Research
  "monitoring and evaluation", "m&e", "meal", "third party monitoring",
  "project evaluation", "baseline survey", "data analytics",
  // HR
  "human resources", "hris", "hrmis", "hr management",
  "recruitment services", "performance management",
  // MIS
  "management information system",
  // Capacity Building
  "capacity building", "training services", "technical assistance"
];

const MEDIUM_WEIGHT_TERMS = [
  // Consulting & advisory
  "consultancy", "consultant", "advisory", "technical support",
  // SOP & policy
  "sop", "standard operating procedures", "policy development",
  "operations manual", "code of conduct",
  // Business Communication
  "business communication", "report writing", "proposal writing",
  "fundraising", "donor relations",
  // Entrepreneurship & Business Dev
  "entrepreneurship", "sme development", "business development",
  "business planning", "financial literacy", "marketing training",
  "women entrepreneurship", "women-led",
  // Training delivery
  "training", "workshop", "mentorship", "coaching", "curriculum development",
  // Evaluation & surveys
  "survey design", "impact assessment", "research",
  // Other relevant
  "organizational assessment", "governance", "anti-fraud",
  "risk management", "quality management",
  "nonprofit management", "ngo management"
];

const NEGATIVE_TERMS = [
  "construction materials", "fuel supply", "hardware procurement",
  "medical equipment", "pharmaceutical", "road construction",
  "vehicle supply", "food supply", "office furniture",
  "generator supply", "fuel procurement", "it equipment supply"
];

function inferType(text) {
  if (/\b(tender|rfp|eoi|bid|solicitation|procurement notice|request for proposal)\b/.test(text)) return OPPORTUNITY_TYPES.TENDER;
  if (/\b(training|workshop|course|capacity building|learning program|certification)\b/.test(text)) return OPPORTUNITY_TYPES.TRAINING;
  if (/\b(consultant|consultancy|technical assistance|advisory)\b/.test(text)) return OPPORTUNITY_TYPES.CONSULTANCY;
  if (/\b(project|program|programme|grant)\b/.test(text)) return OPPORTUNITY_TYPES.PROJECT;
  return OPPORTUNITY_TYPES.OTHER;
}

function countMatches(text, keywords) {
  let count = 0;
  const matched = [];
  for (const term of keywords) {
    if (text.includes(term)) {
      count += 1;
      matched.push(term);
    }
  }
  return { count, matched };
}

export function scoreOpportunity(rawItem, settings) {
  const title = String(rawItem.title || "").toLowerCase();
  const summary = String(rawItem.summary || "").toLowerCase();
  const location = String(rawItem.location || "").toLowerCase();
  const combined = `${title} ${summary}`;

  const high = countMatches(combined, HIGH_WEIGHT_TERMS);
  const medium = countMatches(combined, MEDIUM_WEIGHT_TERMS);
  const negative = countMatches(combined, NEGATIVE_TERMS);

  const customKeywords = (settings.customKeywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  const custom = countMatches(combined, customKeywords);

  let score = high.count * 20 + medium.count * 10 + custom.count * 15 - negative.count * 20;

  if (high.count > 0 && countMatches(title, HIGH_WEIGHT_TERMS).count > 0) {
    score += 15;
  }

  const geoHit = (settings.targetGeographies || []).some((g) => {
    const gg = g.toLowerCase();
    return location.includes(gg) || combined.includes(gg);
  });
  if (geoHit) score += 10;

  const type = inferType(combined);
  if (
    type === OPPORTUNITY_TYPES.TENDER ||
    type === OPPORTUNITY_TYPES.CONSULTANCY ||
    type === OPPORTUNITY_TYPES.TRAINING
  ) {
    score += 10;
  }

  const postedDate = rawItem.postedDate ? Date.parse(rawItem.postedDate) : null;
  if (postedDate && !Number.isNaN(postedDate)) {
    const ageDays = (Date.now() - postedDate) / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) score += 10;
    else if (ageDays <= 30) score += 5;
  }

  const parserConfidenceRaw =
    typeof rawItem.parserConfidence === "number" ? rawItem.parserConfidence : 0.5;
  const parserConfidence = Math.max(0, Math.min(1, parserConfidenceRaw));
  score += Math.round(parserConfidence * 8);

  const reasons = [];
  if (high.count > 0) reasons.push("core-keyword");
  if (medium.count > 0) reasons.push("related-keyword");
  if (custom.count > 0) reasons.push("custom-keyword");
  if (geoHit) reasons.push("geography");
  if (type !== OPPORTUNITY_TYPES.OTHER) reasons.push("opportunity-type");
  if (negative.count > 0) reasons.push("sector-mismatch");

  return {
    ...rawItem,
    type,
    score: Math.max(0, Math.min(100, score)),
    matchedKeywords: [...new Set([...high.matched, ...medium.matched, ...custom.matched])],
    parserConfidence,
    reasonCodes: reasons
  };
}
