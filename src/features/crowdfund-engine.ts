/**
 * MAMA BailConnect — Crowdfund Engine
 *
 * Multi-channel bail crowdfunding: collect contacts, alert networks,
 * track contributions, and auto-notify when bail is funded.
 *
 * @module crowdfund-engine
 * @license GPL-3.0
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ContactInfo = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  relationship: z.string().optional(),
  preferredChannel: z.enum(["sms", "voice", "whatsapp"]).default("sms"),
});

export type ContactInfo = z.infer<typeof ContactInfo>;

export const CrowdfundCampaign = z.object({
  id: z.string().uuid(),
  detaineeName: z.string(),
  facility: z.string(),
  bailAmount: z.number().positive(),
  contacts: z.array(ContactInfo).min(1).max(10),
  createdAt: z.string().datetime(),
  status: z.enum(["active", "funded", "expired", "cancelled"]),
});

export type CrowdfundCampaign = z.infer<typeof CrowdfundCampaign>;

export const Contribution = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  contributorName: z.string(),
  amount: z.number().positive(),
  method: z.enum(["stripe", "venmo", "cashapp", "zelle"]),
  timestamp: z.string().datetime(),
  processingFee: z.number().nonnegative(),
});

export type Contribution = z.infer<typeof Contribution>;

export const CampaignStatus = z.object({
  campaignId: z.string().uuid(),
  bailAmount: z.number(),
  totalRaised: z.number(),
  percentFunded: z.number(),
  contributions: z.array(Contribution),
  contactsAlerted: z.number(),
  contactsContributed: z.number(),
  remainingAmount: z.number(),
  funded: z.boolean(),
  estimatedFundingTime: z.string().optional(),
  platformFee: z.literal(0),
  processingFees: z.number(),
  disclaimer: z.string(),
});

export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const AlertMessage = z.object({
  contactName: z.string(),
  channel: z.enum(["sms", "voice", "whatsapp"]),
  message: z.string(),
  contributionLink: z.string().url(),
  sent: z.boolean(),
  sentAt: z.string().datetime().optional(),
});

export type AlertMessage = z.infer<typeof AlertMessage>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_FEE = 0; // ZERO platform fees. Always.
const STRIPE_FEE_PERCENT = 0.029;
const STRIPE_FEE_FIXED = 0.30;

const DISCLAIMER =
  "BailConnect takes ZERO platform fees. The only fees are payment processor charges " +
  "(Stripe: 2.9% + $0.30 per transaction). 100% of contributions go toward bail. " +
  "MANDATORY: If anyone mentions suicide or self-harm, call 988 immediately.";

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create a new bail crowdfunding campaign.
 */
export async function createCampaign(input: {
  detaineeName: string;
  facility: string;
  bailAmount: number;
  contacts: ContactInfo[];
}): Promise<CrowdfundCampaign> {
  const contacts = z.array(ContactInfo).min(1).max(10).parse(input.contacts);

  const campaign: CrowdfundCampaign = {
    id: crypto.randomUUID(),
    detaineeName: input.detaineeName,
    facility: input.facility,
    bailAmount: z.number().positive().parse(input.bailAmount),
    contacts,
    createdAt: new Date().toISOString(),
    status: "active",
  };

  return CrowdfundCampaign.parse(campaign);
}

/**
 * Generate alert messages for all contacts in a campaign.
 */
export function generateAlertMessages(campaign: CrowdfundCampaign): AlertMessage[] {
  const baseUrl = "https://bail.mama.oliwoods.ai/contribute";

  return campaign.contacts.map((contact) => {
    const link = `${baseUrl}/${campaign.id}`;

    const message =
      `${contact.name}, ${campaign.detaineeName} needs your help. ` +
      `They are being held at ${campaign.facility} and need $${campaign.bailAmount.toLocaleString()} for bail. ` +
      `Any amount helps. Contribute here: ${link} ` +
      `\u2014 BailConnect (ZERO fees, 100% goes to bail)`;

    return {
      contactName: contact.name,
      channel: contact.preferredChannel,
      message,
      contributionLink: link,
      sent: false,
    };
  });
}

/**
 * Calculate contribution with processing fees.
 */
export function calculateContribution(amount: number): {
  contributionAmount: number;
  processingFee: number;
  totalCharged: number;
  platformFee: number;
  towardBail: number;
} {
  const processingFee = Math.round((amount * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED) * 100) / 100;
  return {
    contributionAmount: amount,
    processingFee,
    totalCharged: Math.round((amount + processingFee) * 100) / 100,
    platformFee: PLATFORM_FEE,
    towardBail: amount, // 100% of contribution goes to bail
  };
}

/**
 * Get campaign status with funding progress.
 */
export function getCampaignStatus(
  campaign: CrowdfundCampaign,
  contributions: Contribution[]
): CampaignStatus {
  const totalRaised = contributions.reduce((sum, c) => sum + c.amount, 0);
  const totalFees = contributions.reduce((sum, c) => sum + c.processingFee, 0);
  const percentFunded = Math.min(100, Math.round((totalRaised / campaign.bailAmount) * 100));
  const remaining = Math.max(0, campaign.bailAmount - totalRaised);
  const funded = totalRaised >= campaign.bailAmount;

  const uniqueContributors = new Set(contributions.map((c) => c.contributorName)).size;

  return {
    campaignId: campaign.id,
    bailAmount: campaign.bailAmount,
    totalRaised,
    percentFunded,
    contributions,
    contactsAlerted: campaign.contacts.length,
    contactsContributed: uniqueContributors,
    remainingAmount: remaining,
    funded,
    estimatedFundingTime: funded ? undefined : estimateFundingTime(campaign, contributions),
    platformFee: 0,
    processingFees: totalFees,
    disclaimer: DISCLAIMER,
  };
}

function estimateFundingTime(
  campaign: CrowdfundCampaign,
  contributions: Contribution[]
): string {
  if (contributions.length === 0) {
    return "Alerts sent. Awaiting first contribution.";
  }

  const avgContribution = contributions.reduce((s, c) => s + c.amount, 0) / contributions.length;
  const remaining = campaign.bailAmount - contributions.reduce((s, c) => s + c.amount, 0);
  const neededContributions = Math.ceil(remaining / avgContribution);

  if (neededContributions <= 2) return "Nearly funded! 1-2 more contributions needed.";
  if (neededContributions <= 5) return `About ${neededContributions} more contributions needed at the current average.`;
  return `Estimated ${neededContributions} more contributions needed. Consider expanding contact list.`;
}

/**
 * Generate a thank-you / funded notification.
 */
export function generateFundedNotification(campaign: CrowdfundCampaign): string {
  return (
    `BAIL FUNDED! ${campaign.detaineeName}\u2019s bail of $${campaign.bailAmount.toLocaleString()} ` +
    `has been fully funded. The court will be notified and release processing will begin. ` +
    `Thank you to everyone who contributed. \u2014 BailConnect`
  );
}
