import { z } from 'zod';
import { ValidationError } from '../../domain/errors/DomainError.js';

const envSchema = z.object({
  PORT: z.string().default('8080'),
  API_KEY: z.string().min(8, 'API_KEY must be at least 8 characters long').refine(
    (val) => val !== 'change-me-long-random', 
    { message: 'API_KEY must be changed from the default value' }
  ),
  TZ: z.string().default('Europe/Paris'),
  ALLOW_INLINE_SECRETS: z.string().default('false'),
  
  GOOGLE_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEET_NAME: z.string().default('Inventory'),
  GOOGLE_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.string().default('465'),
  SMTP_SECURE: z.string().default('true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_TO: z.string().optional()
});

export class EnvConfig {
  constructor() {
    this.config = this._loadAndValidate();
  }

  _loadAndValidate() {
    try {
      const parsed = envSchema.parse(process.env);
      
      return {
        port: parseInt(parsed.PORT, 10),
        apiKey: parsed.API_KEY,
        timezone: parsed.TZ,
        allowInlineSecrets: parsed.ALLOW_INLINE_SECRETS === 'true',
        
        google: {
          spreadsheetId: parsed.GOOGLE_SPREADSHEET_ID,
          sheetName: parsed.GOOGLE_SHEET_NAME,
          clientEmail: parsed.GOOGLE_CLIENT_EMAIL,
          privateKey: parsed.GOOGLE_PRIVATE_KEY
        },
        
        smtp: {
          host: parsed.SMTP_HOST,
          port: parseInt(parsed.SMTP_PORT, 10),
          secure: parsed.SMTP_SECURE === 'true',
          user: parsed.SMTP_USER,
          pass: parsed.SMTP_PASS,
          from: parsed.EMAIL_FROM,
          to: parsed.EMAIL_TO
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        console.error('Environment validation errors:');
        messages.forEach(msg => console.error(`  - ${msg}`));
        throw new ValidationError('Environment configuration validation failed', messages);
      }
      throw error;
    }
  }

  mergeWithRequestConfig(requestConfig = {}) {
    const merged = {
      options: {
        dryRun: requestConfig.options?.dryRun ?? false,
        subjectPrefix: requestConfig.options?.subjectPrefix ?? '[Pantry Pilot]',
        reviewHorizonDays: requestConfig.options?.reviewHorizonDays ?? 14,
        overrideTargetWindowDays: requestConfig.options?.overrideTargetWindowDays ?? null,
        autoDecrementStock: requestConfig.options?.autoDecrementStock ?? true,
        updateCalculatedQuantities: requestConfig.options?.updateCalculatedQuantities ?? false
      },
      
      inventory: {
        type: requestConfig.inventory?.type ?? 'google_sheets',
        spreadsheetId: requestConfig.inventory?.spreadsheetId ?? this.config.google.spreadsheetId,
        sheetName: requestConfig.inventory?.sheetName ?? this.config.google.sheetName
      },
      
      google: {
        clientEmail: this._getSecret('google.clientEmail', requestConfig.secrets?.google?.clientEmail, this.config.google.clientEmail),
        privateKey: this._getSecret('google.privateKey', requestConfig.secrets?.google?.privateKey, this.config.google.privateKey)
      },
      
      smtp: {
        host: this._getSecret('smtp.host', requestConfig.secrets?.smtp?.host, this.config.smtp.host),
        port: this._getSecret('smtp.port', requestConfig.secrets?.smtp?.port, this.config.smtp.port),
        secure: this._getSecret('smtp.secure', requestConfig.secrets?.smtp?.secure, this.config.smtp.secure),
        user: this._getSecret('smtp.user', requestConfig.secrets?.smtp?.user, this.config.smtp.user),
        pass: this._getSecret('smtp.pass', requestConfig.secrets?.smtp?.pass, this.config.smtp.pass),
        from: this._getSecret('smtp.from', requestConfig.secrets?.smtp?.from, this.config.smtp.from),
        to: this._getSecret('smtp.to', requestConfig.secrets?.smtp?.to, this.config.smtp.to)
      },
      
      notification: {
        enabled: requestConfig.notification?.enabled ?? true,
        dryRun: requestConfig.options?.dryRun ?? false,
        subjectPrefix: requestConfig.options?.subjectPrefix ?? '[Pantry Pilot]'
      }
    };

    this._validateMergedConfig(merged);
    return merged;
  }

  _getSecret(path, requestValue, envValue) {
    if (requestValue !== undefined) {
      if (!this.config.allowInlineSecrets) {
        throw new ValidationError(`Inline secrets not allowed in production. Remove secrets.${path} from request body.`);
      }
      return requestValue;
    }
    return envValue;
  }

  _validateMergedConfig(config) {
    const missing = [];
    
    if (!config.inventory.spreadsheetId) missing.push('spreadsheetId');
    if (!config.google.clientEmail) missing.push('google.clientEmail');
    if (!config.google.privateKey) missing.push('google.privateKey');
    if (!config.smtp.user) missing.push('smtp.user');
    if (!config.smtp.pass) missing.push('smtp.pass');
    if (!config.smtp.from) missing.push('smtp.from');
    if (!config.smtp.to) missing.push('smtp.to');

    if (missing.length > 0) {
      throw new ValidationError(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  get() {
    return { ...this.config };
  }
}