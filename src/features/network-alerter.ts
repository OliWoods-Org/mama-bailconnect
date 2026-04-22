/**
 * MAMA BailConnect — Network Alerter
 *
 * Multi-channel notification system: SMS, voice calls, WhatsApp.
 * Sends simultaneous alerts to emergency contacts when someone needs bail.
 *
 * @module network-alerter
 * @license GPL-3.0
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const AlertChannel = z.enum(["sms", "voice", "whatsapp"]);

export const AlertRecipient = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  channels: z.array(AlertChannel).min(1),
  language: z.string().default("en"),
});

export type AlertRecipient = z.infer<typeof AlertRecipient>;

export const AlertConfig = z.object({
  campaignId: z.string().uuid(),
  detaineeName: z.string(),
  facility: z.string(),
  bailAmount: z.number().positive(),
  recipients: z.array(AlertRecipient).min(1).max(10),
  contributionUrl: z.string().url(),
  urgency: z.enum(["standard", "urgent"]).default("standard"),
});

export type AlertConfig = z.infer<typeof AlertConfig>;

export const AlertDeliveryResult = z.object({
  recipientName: z.string(),
  channel: AlertChannel,
  status: z.enum(["sent", "failed", "queued", "delivered", "read"]),
  messageId: z.string().optional(),
  sentAt: z.string().datetime().optional(),
  error: z.string().optional(),
});

export type AlertDeliveryResult = z.infer<typeof AlertDeliveryResult>;

export const AlertBatchResult = z.object({
  campaignId: z.string().uuid(),
  totalRecipients: z.number(),
  totalAlertsSent: z.number(),
  totalAlertsFailed: z.number(),
  results: z.array(AlertDeliveryResult),
  followUpSchedule: z.array(
    z.object({
      time: z.string(),
      action: z.string(),
    })
  ),
});

export type AlertBatchResult = z.infer<typeof AlertBatchResult>;

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

interface MessageTemplates {
  sms: string;
  voice: string;
  whatsapp: string;
}

function buildMessages(config: AlertConfig, recipientName: string): MessageTemplates {
  const amount = `$${config.bailAmount.toLocaleString()}`;

  return {
    sms:
      `${recipientName}: ${config.detaineeName} needs help. ` +
      `Held at ${config.facility}, bail is ${amount}. ` +
      `Any amount helps \u2014 contribute at ${config.contributionUrl} ` +
      `(ZERO fees, 100% goes to bail) \u2014 BailConnect`,

    voice:
      `Hello ${recipientName}. This is an urgent message from BailConnect. ` +
      `${config.detaineeName} is being held at ${config.facility} and needs ${amount} for bail. ` +
      `Your help can bring them home. Please visit the link sent to you by text message to contribute any amount. ` +
      `BailConnect charges zero platform fees. Every dollar goes to bail. Thank you.`,

    whatsapp:
      `Hi ${recipientName} \ud83d\udc4b\n\n` +
      `${config.detaineeName} needs your help.\n\n` +
      `\ud83c\udfe2 Facility: ${config.facility}\n` +
      `\ud83d\udcb0 Bail: ${amount}\n\n` +
      `Any amount helps. Contribute here:\n${config.contributionUrl}\n\n` +
      `\u2705 ZERO platform fees\n\u2705 100% goes to bail\n\u2705 Secure payment via Stripe\n\n` +
      `\u2014 BailConnect by MAMA`,
  };
}

// ---------------------------------------------------------------------------
// Follow-up schedule
// ---------------------------------------------------------------------------

function buildFollowUpSchedule(urgency: "standard" | "urgent"): { time: string; action: string }[] {
  if (urgency === "urgent") {
    return [
      { time: "Immediate", action: "Send initial alerts to all contacts via all channels." },
      { time: "+2 hours", action: "Send follow-up to contacts who haven\u2019t opened/clicked." },
      { time: "+6 hours", action: "Second follow-up with progress update." },
      { time: "+24 hours", action: "Final reminder with remaining amount needed." },
    ];
  }

  return [
    { time: "Immediate", action: "Send initial alerts to all contacts via all channels." },
    { time: "+6 hours", action: "Send follow-up to contacts who haven\u2019t responded." },
    { time: "+24 hours", action: "Progress update to all contacts." },
    { time: "+48 hours", action: "Final reminder with remaining amount needed." },
  ];
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Send alerts to all recipients across all channels simultaneously.
 *
 * In production, this integrates with:
 * - Twilio SMS API
 * - Twilio Voice API (text-to-speech)
 * - Twilio WhatsApp Business API
 */
export async function sendAlerts(config: AlertConfig): Promise<AlertBatchResult> {
  const parsed = AlertConfig.parse(config);
  const results: AlertDeliveryResult[] = [];

  for (const recipient of parsed.recipients) {
    const messages = buildMessages(parsed, recipient.name);

    for (const channel of recipient.channels) {
      // In production, this calls the appropriate Twilio API
      const result: AlertDeliveryResult = {
        recipientName: recipient.name,
        channel,
        status: "queued",
        messageId: crypto.randomUUID(),
        sentAt: new Date().toISOString(),
      };

      results.push(result);
    }
  }

  const sent = results.filter((r) => r.status !== "failed").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return {
    campaignId: parsed.campaignId,
    totalRecipients: parsed.recipients.length,
    totalAlertsSent: sent,
    totalAlertsFailed: failed,
    results,
    followUpSchedule: buildFollowUpSchedule(parsed.urgency),
  };
}

/**
 * Generate a progress update message for contacts.
 */
export function generateProgressUpdate(
  campaignId: string,
  detaineeName: string,
  bailAmount: number,
  amountRaised: number,
  contributionUrl: string
): MessageTemplates {
  const remaining = bailAmount - amountRaised;
  const percent = Math.round((amountRaised / bailAmount) * 100);

  const baseMessage =
    remaining <= 0
      ? `Great news! ${detaineeName}\u2019s bail has been FULLY FUNDED! Thank you!`
      : `Update: ${detaineeName}\u2019s bail is ${percent}% funded. $${remaining.toLocaleString()} more needed.`;

  return {
    sms: `${baseMessage} ${remaining > 0 ? contributionUrl : ""} \u2014 BailConnect`,
    voice: `${baseMessage} ${remaining > 0 ? "Please visit the link sent by text to contribute." : "Thank you for your generosity."}`,
    whatsapp: `${baseMessage}\n\n${remaining > 0 ? `Contribute: ${contributionUrl}` : "\u2705 FUNDED!"}\n\n\u2014 BailConnect by MAMA`,
  };
}

/**
 * Validate phone numbers and determine available channels.
 */
export function validateContact(phone: string): {
  valid: boolean;
  normalized: string;
  availableChannels: z.infer<typeof AlertChannel>[];
} {
  // Basic phone normalization
  const digits = phone.replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 15) {
    return { valid: false, normalized: phone, availableChannels: [] };
  }

  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  // SMS and voice available for all valid numbers
  // WhatsApp availability would be checked via API in production
  return {
    valid: true,
    normalized,
    availableChannels: ["sms", "voice", "whatsapp"],
  };
}
