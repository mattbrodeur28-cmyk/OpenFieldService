import { z } from "zod";

// CRM-001 domain rules: validation and authorization, no SQL and no HTTP.
// Mirrors the Sales module's conventions so both read alike.

export class CrmError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// CRM has no owner/rep model yet, so permissions are role-based like the rest of the app:
// any active writer may maintain contacts; viewers read only.
export function requireWriter(user) {
  if (
    !user?.active ||
    user.mustChangePassword ||
    !["owner", "admin", "member", "technician"].includes(user.role)
  )
    throw new CrmError("Your account cannot change CRM records.", 403);
}

export function requireReader(user) {
  if (!user?.active || user.mustChangePassword)
    throw new CrmError("Sign in to continue.", 401);
}

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new CrmError(
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return result.data;
}

export const ROLES = [
  "billing",
  "service",
  "accounts_payable",
  "site_supervisor",
  "estimator",
  "other",
];

const text = (max) => z.string().trim().max(max);
// A contact may belong to the whole account rather than one site, so the site is optional.
const optionalReference = z.string().uuid().nullable().default(null);
export const version = z.number().int().nonnegative().safe();

// An optional email: empty is allowed (phone-only contacts are common), but if present it must parse.
const optionalEmail = z
  .union([z.literal(""), z.string().email().max(254)])
  .default("");

export const contactInput = z
  .object({
    name: text(200).min(1, "Enter a contact name."),
    title: text(100).default(""),
    email: optionalEmail,
    phone: text(60).default(""),
    emailOk: z.boolean().default(true),
    phoneOk: z.boolean().default(true),
    smsOk: z.boolean().default(false),
    notes: text(2000).default(""),
    siteId: optionalReference,
    roles: z.array(z.enum(ROLES)).max(6).default([]),
    expectedVersion: version.optional(),
  })
  .strict();

export const contactUpdateInput = contactInput
  .extend({ expectedVersion: version })
  .strict();

export const billingLinkInput = z
  .object({
    siteId: z.string().uuid(),
    billingCustomerId: z.string().uuid(),
    poRequired: z.boolean().default(false),
    notes: text(2000).default(""),
  })
  .strict();

export const accountSettingsInput = z
  .object({
    expectedVersion: version,
    segment: z.enum(["commercial", "residential"]).default("commercial"),
    accountType: z
      .enum(["customer", "prospect", "vendor", "inactive"])
      .default("customer"),
    parentCustomerId: optionalReference,
  })
  .strict();

// A contact must be reachable by at least one channel it has consented to. Otherwise it is a
// name with no way to use it, which is worse than recording nothing.
export function validateContact(data) {
  if (!data.email && !data.phone)
    throw new CrmError("Enter an email address or a phone number.");
  if (data.email && !data.emailOk)
    throw new CrmError(
      "This contact has an email address but email is marked unusable. Clear one of them.",
    );
  if (data.phone && !data.phoneOk && !data.email)
    throw new CrmError(
      "This contact has only a phone number, but phone is marked unusable.",
    );
  if (data.smsOk && !data.phone)
    throw new CrmError("SMS requires a phone number.");
  if (data.roles.includes("billing") && !data.email)
    throw new CrmError(
      "A billing contact needs an email address for invoices.",
    );
  const unique = new Set(data.roles);
  if (unique.size !== data.roles.length)
    throw new CrmError("Each contact role can be selected only once.");
}
