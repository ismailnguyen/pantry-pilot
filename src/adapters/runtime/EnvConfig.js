import { z } from 'zod';

const SecretsSchema = z
  .object({
    google: z.object({ clientEmail: z.string(), privateKey: z.string() }).partial().default({}),
    smtp: z
      .object({
        host: z.string().default('smtp.gmail.com'),
        port: z.coerce.number().default(465),
        secure: z.coerce.boolean().default(true),
        user: z.string(),
        pass: z.string(),
        from: z.string(),
        to: z.string()
      })
      .partial()
      .default({}),
    openai: z.object({ apiKey: z.string() }).partial().default({})
  })
  .partial()
  .default({});

const OptionsSchema = z
  .object({
    dryRun: z.boolean().default(false),
    subjectPrefix: z.string().default('[Home Inventory]'),
    reviewHorizonDays: z.coerce.number().min(0).default(14),
    overrideTargetWindowDays: z.coerce.number().min(0).nullable().optional()
  })
  .partial()
  .default({});

const InventorySchema = z
  .object({
    type: z.literal('google_sheets').default('google_sheets'),
    spreadsheetId: z.string(),
    sheetName: z.string().default('Inventory')
  })
  .partial()
  .default({});

export function loadConfigFromEnvAndBody(body) {
  const allowInline = process.env.ALLOW_INLINE_SECRETS === 'true';
  const options = OptionsSchema.parse(body?.options ?? {});
  const inventory = InventorySchema.parse({
    type: 'google_sheets',
    spreadsheetId: body?.inventory?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: body?.inventory?.sheetName ?? process.env.GOOGLE_SHEET_NAME ?? 'Inventory'
  });

  const secretsFromEnv = {
    google: {
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY
    }
  };

  const inlineSecrets = allowInline ? body?.secrets ?? {} : {};

  return {
    options,
    inventory,
    secrets: SecretsSchema.parse(merge(secretsFromEnv, inlineSecrets))
  };
}

function merge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? merge(base?.[key] ?? {}, value)
        : value;
  }
  return out;
}
