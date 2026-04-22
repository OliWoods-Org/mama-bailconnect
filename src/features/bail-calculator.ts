/**
 * MAMA BailConnect — Bail Calculator & Rights Advisor
 *
 * State-specific bail information, rights lookup, arraignment guidance,
 * and public defender connection.
 *
 * @module bail-calculator
 * @license GPL-3.0
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ChargeLevel = z.enum([
  "infraction",
  "misdemeanor",
  "felony",
  "unknown",
]);

export const BailInfoInput = z.object({
  state: z.string().length(2).toUpperCase(),
  county: z.string().optional(),
  chargeLevel: ChargeLevel,
  chargeDescription: z.string().optional(),
  bailAmount: z.number().positive().optional(),
  hasPublicDefender: z.boolean().default(false),
  firstOffense: z.boolean().default(true),
});

export type BailInfoInput = z.infer<typeof BailInfoInput>;

export const BailRightsInfo = z.object({
  state: z.string(),
  rightsOverview: z.array(z.string()),
  bailTypes: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
      cost: z.string(),
    })
  ),
  arraignmentInfo: z.object({
    timeline: z.string(),
    whatToExpect: z.array(z.string()),
    tips: z.array(z.string()),
  }),
  publicDefenderInfo: z.object({
    howToRequest: z.string(),
    qualifications: z.string(),
    whatTheyDo: z.array(z.string()),
  }),
  importantNumbers: z.array(z.object({ name: z.string(), phone: z.string() })),
  disclaimer: z.string(),
});

export type BailRightsInfo = z.infer<typeof BailRightsInfo>;

// ---------------------------------------------------------------------------
// State data
// ---------------------------------------------------------------------------

const DISCLAIMER =
  "IMPORTANT: This is general legal information, NOT legal advice. " +
  "Every case is different. Request a public defender at your arraignment if you cannot afford an attorney. " +
  "If you or someone you know is experiencing a mental health crisis in jail, call 988.";

const BAIL_TYPES = [
  {
    type: "Own Recognizance (OR)",
    description: "Released on your promise to appear. No money required. Judge decides based on flight risk, ties to community, and charge severity.",
    cost: "Free",
  },
  {
    type: "Cash Bail",
    description: "Pay the full amount in cash to the court. Refunded when case concludes (minus fees) if you appear for all court dates.",
    cost: "Full bail amount upfront",
  },
  {
    type: "Bail Bond (Bondsman)",
    description: "Pay a bondsman 10-15% of the bail amount (non-refundable). They post the rest. You may need collateral.",
    cost: "10-15% of bail (non-refundable)",
  },
  {
    type: "Property Bond",
    description: "Use property (usually a home) as collateral for bail. Court places a lien on the property.",
    cost: "No upfront cash, but property at risk",
  },
  {
    type: "Community Bail Funds",
    description: "Nonprofit organizations that post bail for people who cannot afford it. The Bail Project and local bail funds operate in many jurisdictions.",
    cost: "Free to the defendant",
  },
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Get bail rights and guidance for a specific state/situation.
 */
export async function getBailRightsInfo(input: BailInfoInput): Promise<BailRightsInfo> {
  const parsed = BailInfoInput.parse(input);

  return {
    state: parsed.state,
    rightsOverview: [
      "You are presumed INNOCENT until proven guilty. Bail is not punishment.",
      "You have the right to know the charges against you.",
      "You have the right to a lawyer. If you cannot afford one, request a public defender.",
      "You have the right to a bail hearing (in most states, within 48 hours of arrest).",
      "You have the right to argue for reduced bail or OR release.",
      "Excessive bail is prohibited by the 8th Amendment.",
      parsed.state === "IL"
        ? "Illinois has eliminated cash bail as of 2023. Pretrial release is determined by a risk assessment."
        : "Bail reform varies by state. Ask your attorney about pretrial release options.",
    ],
    bailTypes: BAIL_TYPES,
    arraignmentInfo: {
      timeline: getArraignmentTimeline(parsed.state),
      whatToExpect: [
        "The judge will read the charges against you.",
        "You will enter a plea (almost always \u201Cnot guilty\u201D at arraignment).",
        "The judge will set bail or release conditions.",
        "If you need a public defender, REQUEST ONE HERE.",
        "The judge will set your next court date.",
        "The entire process usually takes 5-15 minutes.",
      ],
      tips: [
        "Plead NOT GUILTY at arraignment. This preserves all your options.",
        "Request a public defender if you cannot afford a lawyer.",
        "Be respectful to the judge. Address them as \u201CYour Honor.\u201D",
        "Have a family member or friend in the courtroom if possible \u2014 it shows community ties.",
        "Do NOT discuss your case with anyone except your lawyer.",
      ],
    },
    publicDefenderInfo: {
      howToRequest: "Tell the judge at arraignment: \u201CYour Honor, I cannot afford an attorney and I request a public defender.\u201D",
      qualifications: "You typically qualify if your income is at or below 125% of the Federal Poverty Level, but many courts have higher thresholds. Apply even if unsure.",
      whatTheyDo: [
        "Represent you at all court hearings.",
        "Investigate your case and gather evidence.",
        "Negotiate plea deals if appropriate.",
        "Argue for bail reduction or OR release.",
        "Take your case to trial if needed.",
        "Public defenders are REAL lawyers \u2014 they handle more cases than most private attorneys.",
      ],
    },
    importantNumbers: [
      { name: "The Bail Project (free bail help)", phone: "Find at bailproject.org/help" },
      { name: "National Bail Fund Network", phone: "communityjusticeexchange.org" },
      { name: "988 Crisis Lifeline", phone: "988" },
      { name: "BailConnect Crowdfund Line", phone: "See mama.oliwoods.ai" },
    ],
    disclaimer: DISCLAIMER,
  };
}

function getArraignmentTimeline(state: string): string {
  // Most states require arraignment within 48-72 hours
  const timelines: Record<string, string> = {
    CA: "Within 48 hours of arrest (excluding weekends/holidays).",
    NY: "Within 24 hours of arrest in NYC; 48 hours elsewhere in NY.",
    TX: "Within 48 hours of arrest.",
    FL: "Within 24 hours of arrest.",
    IL: "Within 48 hours of arrest.",
  };
  return timelines[state] ?? "Typically within 48-72 hours of arrest. Varies by jurisdiction.";
}

/**
 * Estimate if someone qualifies for OR release.
 */
export function estimateORChance(input: BailInfoInput): {
  likelihood: "high" | "moderate" | "low";
  factors: string[];
} {
  const factors: string[] = [];
  let score = 0;

  if (input.chargeLevel === "infraction" || input.chargeLevel === "misdemeanor") {
    score += 3;
    factors.push("Misdemeanor/infraction charges favor OR release.");
  } else if (input.chargeLevel === "felony") {
    score -= 2;
    factors.push("Felony charges reduce OR likelihood, but it\u2019s still possible for non-violent offenses.");
  }

  if (input.firstOffense) {
    score += 2;
    factors.push("First offense strongly favors OR release.");
  }

  factors.push("Community ties (job, family, home ownership) significantly improve OR chances.");
  factors.push("Having a lawyer argue for OR release dramatically increases chances.");

  if (score >= 4) return { likelihood: "high", factors };
  if (score >= 1) return { likelihood: "moderate", factors };
  return { likelihood: "low", factors };
}
