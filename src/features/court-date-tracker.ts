/**
 * MAMA BailConnect — Court Date Tracker
 *
 * Track arraignment, hearings, and trial dates. Send reminders
 * to detainee and family. Missing a court date = re-arrest.
 *
 * @module court-date-tracker
 * @license GPL-3.0
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const CourtEventType = z.enum([
  "arraignment",
  "bail_hearing",
  "preliminary_hearing",
  "pretrial_conference",
  "motion_hearing",
  "trial",
  "sentencing",
  "probation_check_in",
  "other",
]);

export const CourtEvent = z.object({
  id: z.string().uuid(),
  caseId: z.string(),
  eventType: CourtEventType,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  courthouse: z.string(),
  courtroom: z.string().optional(),
  judgeName: z.string().optional(),
  notes: z.string().optional(),
  reminderContacts: z.array(
    z.object({
      name: z.string(),
      phone: z.string(),
      relationship: z.string(),
    })
  ),
});

export type CourtEvent = z.infer<typeof CourtEvent>;

export const ReminderSchedule = z.object({
  eventId: z.string().uuid(),
  reminders: z.array(
    z.object({
      when: z.string(),
      message: z.string(),
      channels: z.array(z.enum(["sms", "voice", "whatsapp"])),
    })
  ),
});

export type ReminderSchedule = z.infer<typeof ReminderSchedule>;

export const CourtPrepChecklist = z.object({
  eventType: CourtEventType,
  beforeCourt: z.array(z.string()),
  whatToBring: z.array(z.string()),
  whatToWear: z.string(),
  whatToExpect: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  transportationTips: z.string(),
});

export type CourtPrepChecklist = z.infer<typeof CourtPrepChecklist>;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create a reminder schedule for a court event.
 * Missing a court date can result in a bench warrant and re-arrest.
 */
export function createReminderSchedule(event: CourtEvent): ReminderSchedule {
  const parsed = CourtEvent.parse(event);
  const eventDate = new Date(parsed.date);
  const timeStr = parsed.time ? ` at ${parsed.time}` : "";

  const baseMessage = (prefix: string) =>
    `${prefix} Court date: ${parsed.eventType.replace(/_/g, " ")}${timeStr} ` +
    `at ${parsed.courthouse}${parsed.courtroom ? `, ${parsed.courtroom}` : ""}. ` +
    `Missing court = bench warrant. \u2014 BailConnect`;

  return {
    eventId: parsed.id,
    reminders: [
      {
        when: "7 days before",
        message: baseMessage("REMINDER: 1 week until your court date."),
        channels: ["sms"],
      },
      {
        when: "3 days before",
        message: baseMessage("REMINDER: 3 days until your court date."),
        channels: ["sms", "whatsapp"],
      },
      {
        when: "1 day before",
        message: baseMessage("TOMORROW is your court date.") +
          " Plan your transportation tonight. Arrive 30 minutes early.",
        channels: ["sms", "voice", "whatsapp"],
      },
      {
        when: "Morning of",
        message: baseMessage("TODAY is your court date.") +
          " Leave early. Arrive 30 minutes before. Dress professionally.",
        channels: ["sms", "voice"],
      },
    ],
  };
}

/**
 * Generate a court preparation checklist.
 */
export function getCourtPrepChecklist(eventType: z.infer<typeof CourtEventType>): CourtPrepChecklist {
  const common = {
    whatToWear:
      "Business casual or better. No shorts, tank tops, hats, or offensive graphics. " +
      "Clean, neat clothing shows respect for the court. If you don\u2019t have dress clothes, " +
      "many nonprofits provide free court-appropriate clothing.",
    transportationTips:
      "Plan your route the night before. Arrive 30 minutes early. " +
      "If transportation is a barrier, contact your attorney or public defender \u2014 " +
      "many courts and bail funds can help arrange rides. " +
      "The Bail Project provides transportation assistance in many jurisdictions.",
    commonMistakes: [
      "Arriving late (this can result in a bench warrant).",
      "Bringing your phone into the courtroom without silencing it.",
      "Speaking out of turn \u2014 only speak when the judge addresses you.",
      "Discussing your case in the hallway (prosecutors and witnesses may overhear).",
      "Not bringing required documents.",
    ],
  };

  const specifics: Record<string, Partial<CourtPrepChecklist>> = {
    arraignment: {
      beforeCourt: [
        "If you have a lawyer, confirm they will be there.",
        "If you need a public defender, you will request one at this hearing.",
        "Review the charges against you (from arrest paperwork).",
        "Prepare to plead NOT GUILTY (preserves all your options).",
      ],
      whatToBring: [
        "Government-issued ID",
        "Any bail-related paperwork",
        "Names and contact info for character references (employer, clergy, etc.)",
        "Proof of community ties: lease, pay stubs, family connections",
      ],
      whatToExpect: [
        "The judge will read the charges.",
        "You will enter a plea (say NOT GUILTY).",
        "The judge will address bail.",
        "Request a public defender if you need one.",
        "The judge will set your next court date.",
        "This usually takes 5-15 minutes.",
      ],
    },
    trial: {
      beforeCourt: [
        "Meet with your attorney to review trial strategy.",
        "Confirm all witnesses are available and know when to appear.",
        "Review all evidence with your attorney.",
        "Get a full night\u2019s sleep.",
      ],
      whatToBring: [
        "Government-issued ID",
        "All documents your attorney requested",
        "A notebook and pen (to pass notes to your attorney)",
        "Snacks and water (trials can be long, and courthouses have limited food options)",
      ],
      whatToExpect: [
        "Jury selection (if jury trial).",
        "Opening statements from both sides.",
        "Prosecution presents their case first.",
        "Your attorney cross-examines witnesses.",
        "Defense presents your case.",
        "Closing arguments.",
        "Jury deliberation and verdict (or judge\u2019s decision in bench trial).",
      ],
    },
  };

  const specific = specifics[eventType] ?? {};

  return {
    eventType,
    beforeCourt: specific.beforeCourt ?? [
      "Confirm date, time, and location.",
      "Contact your attorney to confirm attendance.",
      "Review any documents related to the hearing.",
    ],
    whatToBring: specific.whatToBring ?? [
      "Government-issued ID",
      "All court paperwork",
      "A notebook and pen",
    ],
    whatToExpect: specific.whatToExpect ?? [
      "The judge will address the matter scheduled.",
      "Your attorney will speak on your behalf.",
      "You may be asked questions \u2014 answer clearly and honestly.",
      "The judge may schedule a follow-up date.",
    ],
    ...common,
  };
}

/**
 * Calculate days until a court event and urgency level.
 */
export function getEventUrgency(eventDate: string): {
  daysUntil: number;
  urgency: "past_due" | "today" | "urgent" | "soon" | "upcoming";
  message: string;
} {
  const event = new Date(eventDate);
  const now = new Date();
  const diffMs = event.getTime() - now.getTime();
  const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return {
      daysUntil,
      urgency: "past_due",
      message: "THIS COURT DATE HAS PASSED. If you missed it, contact your attorney IMMEDIATELY. A bench warrant may have been issued.",
    };
  }
  if (daysUntil === 0) {
    return { daysUntil: 0, urgency: "today", message: "YOUR COURT DATE IS TODAY. Go now." };
  }
  if (daysUntil <= 3) {
    return { daysUntil, urgency: "urgent", message: `Court date in ${daysUntil} day(s). Prepare now.` };
  }
  if (daysUntil <= 7) {
    return { daysUntil, urgency: "soon", message: `Court date in ${daysUntil} days. Start preparing.` };
  }
  return { daysUntil, urgency: "upcoming", message: `Court date in ${daysUntil} days.` };
}
