import express from 'express';
import { loadConfigFromEnvAndBody } from '../runtime/EnvConfig.js';
import { PinoLogger } from '../runtime/PinoLogger.js';
import { SystemClock } from '../runtime/SystemClock.js';
import { GoogleSheetsInventoryRepository } from '../inventory/googleSheets/GoogleSheetsInventoryRepository.js';
import { SmtpEmailNotifier } from '../notify/email/SmtpEmailNotifier.js';
import { execute } from '../../domain/usecases/CheckAndNotifyReplenishment.js';
import { decide } from '../../domain/services/ReplenishmentPolicy.js';
import { createHeaderIndex, mapRowToProduct } from '../mappers/SheetRowMapper.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export const router = express.Router();

router.post('/api/check-replenishment', async (req, res) => {
  let ctx;
  try {
    ctx = createInventoryContext(req.body);
    const { logger, clock, cfg, repo } = ctx;
    const notifier = new SmtpEmailNotifier({
      host: cfg.secrets.smtp.host,
      port: cfg.secrets.smtp.port,
      secure: cfg.secrets.smtp.secure,
      user: cfg.secrets.smtp.user,
      pass: cfg.secrets.smtp.pass,
      from: cfg.secrets.smtp.from,
      to: cfg.secrets.smtp.to
    });

    const dto = await execute(
      {
        policyOverrides: {
          reviewHorizonDays: cfg.options.reviewHorizonDays,
          overrideTargetWindowDays: cfg.options.overrideTargetWindowDays
        },
        notification: {
          enabled: true,
          subjectPrefix: cfg.options.subjectPrefix,
          dryRun: cfg.options.dryRun
        }
      },
      { repo, notifier, clock, logger }
    );

    res.json(dto);
  } catch (err) {
    handleError(res, ctx?.logger, err);
  }
});

router.post('/api/inventory/load', async (req, res) => {
  let ctx;
  try {
    ctx = createInventoryContext(req.body);
    const { logger, clock, cfg, repo } = ctx;
    const { header, rows } = await repo.getSheetData();
    const now = clock.now();
    const computed = computeInventoryInsights({ header, rows, options: cfg.options, now });
    const summary = {
      sheetName: cfg.inventory.sheetName,
      totalRows: rows.length,
      validProducts: computed.filter(c => c.valid).length,
      needsReplenishment: computed.filter(c => c.valid && c.needsReplenishment).length,
      generatedAt: now.toISOString()
    };
    logger.info({ rows: rows.length }, 'inventory_loaded');
    res.json({ sheetName: cfg.inventory.sheetName, header, rows, computed, summary });
  } catch (err) {
    handleError(res, ctx?.logger, err);
  }
});

router.post('/api/inventory/save', async (req, res) => {
  let ctx;
  try {
    const headerInput = req.body?.header;
    const rowsInput = req.body?.rows;
    if (!Array.isArray(headerInput) || headerInput.length === 0) {
      return res.status(400).json({ code: 'invalid_payload', message: 'header must be a non-empty array' });
    }
    if (!Array.isArray(rowsInput) || !rowsInput.every(Array.isArray)) {
      return res
        .status(400)
        .json({ code: 'invalid_payload', message: 'rows must be an array of row arrays' });
    }
    ctx = createInventoryContext(req.body);
    const { logger, cfg, repo } = ctx;
    const header = headerInput.map(v => (v == null ? '' : String(v)));
    const rows = rowsInput.map(r => r.map(v => (v == null ? '' : String(v))));
    await repo.overwriteSheet({ header, rows });
    logger.info({ rows: rows.length }, 'inventory_saved');
    res.json({ ok: true, updatedRows: rows.length });
  } catch (err) {
    handleError(res, ctx?.logger, err);
  }
});

router.post('/api/ai/find-alternatives', async (req, res) => {
  const logger = new PinoLogger();
  try {
    const cfg = loadConfigFromEnvAndBody(req.body);
    const apiKey = cfg?.secrets?.openai?.apiKey;
    if (!apiKey) {
      return res.status(400).json({ code: 'missing_openai_key', message: 'OpenAI API key is required.' });
    }

    const rawProducts = Array.isArray(req.body?.ai?.products) ? req.body.ai.products : [];
    if (!rawProducts.length) {
      return res.status(400).json({ code: 'bad_request', message: 'ai.products must be a non-empty array.' });
    }
    const products = prepareProductsForAi(rawProducts);
    if (!products.length) {
      return res.status(400).json({ code: 'bad_request', message: 'No valid products were provided for analysis.' });
    }

    const summary = req.body?.ai?.summary ?? null;

    const responseSchema = {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', nullable: true },
              productName: { type: 'string' },
              reason: { type: 'string', nullable: true },
              context: { type: 'string', nullable: true },
              alternatives: {
                type: 'array',
                minItems: 1,
                maxItems: 3,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    summary: { type: 'string' },
                    vendor: { type: 'string', nullable: true },
                    price: { type: 'string', nullable: true },
                    url: { type: 'string', format: 'uri', nullable: true },
                    confidence: { type: 'number', nullable: true }
                  },
                  required: ['name', 'summary']
                }
              }
            },
            required: ['productName', 'alternatives']
          },
          minItems: 1,
          maxItems: 10
        }
      },
      required: ['suggestions']
    };

    const scopedProducts = selectProductsForAi(products);
    const userPayload = {
      products: scopedProducts,
      summary: summary
    };

    const completionResponse = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 900,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pantry_pilot_alternatives',
            schema: responseSchema
          }
        },
        messages: [
          {
            role: 'system',
            content:
              'You are Pantry Pilot, a home inventory assistant. Recommend practical alternative consumer products focused on value, availability, and quality. Provide concise summaries, cite likely vendors, highlight notable differentiators, and maintain structured JSON output that adheres to the provided schema.'
          },
          {
            role: 'user',
            content:
              'For each pantry item needing replenishment, suggest up to three modern alternatives. Prioritise reputable retailers, realistic pricing, and explain why the alternative is compelling. Input:\n' +
              JSON.stringify(userPayload)
          }
        ]
      })
    });

    if (!completionResponse.ok) {
      const detail = await completionResponse.text();
      throw new Error(detail || 'OpenAI request failed.');
    }

    const completionJson = await completionResponse.json();
    const rawContent = completionJson?.choices?.[0]?.message?.content;
    let contentPayload = rawContent;
    if (Array.isArray(contentPayload)) {
      contentPayload = contentPayload
        .map(entry => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && typeof entry.text === 'string') return entry.text;
          return '';
        })
        .join('');
    }
    let parsed;
    try {
      parsed = typeof contentPayload === 'string' ? JSON.parse(contentPayload) : contentPayload;
    } catch (error) {
      logger.warn({ rawContent: contentPayload }, 'ai_response_parse_error');
      throw new Error('OpenAI returned an unexpected response format.');
    }

    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const cleaned = suggestions
      .map(entry => ({
        productId: entry?.productId ?? null,
        productName: entry?.productName ?? entry?.productId ?? null,
        reason: entry?.reason ?? null,
        context: entry?.context ?? null,
        alternatives: Array.isArray(entry?.alternatives)
          ? entry.alternatives
              .filter(alt => alt && alt.name)
              .map(alt => ({
                name: alt.name,
                summary: alt.summary ?? '',
                vendor: alt.vendor ?? null,
                price: alt.price ?? null,
                url: alt.url ?? null,
                confidence:
                  typeof alt.confidence === 'number' && Number.isFinite(alt.confidence)
                    ? alt.confidence
                    : null
              }))
          : []
      }))
      .filter(entry => entry.productName && entry.alternatives.length > 0);

    logger.info({ suggestions: cleaned.length }, 'ai_alternatives_generated');
    res.json({
      suggestions: cleaned,
      generatedAt: new Date().toISOString(),
      model: completionJson?.model ?? 'gpt-4.1-mini'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'ai_alternatives_error');
    res.status(500).json({ code: 'ai_error', message });
  }
});

function createInventoryContext(body) {
  const logger = new PinoLogger();
  const clock = new SystemClock();
  const cfg = loadConfigFromEnvAndBody(body);
  const repo = new GoogleSheetsInventoryRepository({
    spreadsheetId: cfg.inventory.spreadsheetId,
    sheetName: cfg.inventory.sheetName,
    clientEmail: cfg.secrets.google.clientEmail,
    privateKey: cfg.secrets.google.privateKey,
    logger
  });
  return { logger, clock, cfg, repo };
}

function computeInventoryInsights({ header, rows, options, now }) {
  if (!header.length) return [];
  const idx = createHeaderIndex(header);
  const get = (row, key) => {
    const position = idx[key];
    return position === undefined ? undefined : row[position];
  };

  return rows.map((row, rowIndex) => {
    const missing = [];
    const id = String(get(row, 'id') ?? '').trim();
    const name = String(get(row, 'name') ?? '').trim();
    const unit = String(get(row, 'unit') ?? '').trim();
    const qtyRaw = get(row, 'qty_remaining');
    const qty = qtyRaw === undefined || qtyRaw === '' ? NaN : Number(qtyRaw);

    if (!id) missing.push('id');
    if (!name) missing.push('name');
    if (!unit) missing.push('unit');
    if (!Number.isFinite(qty)) missing.push('qty_remaining');

    if (missing.length) {
      return { rowIndex, valid: false, issue: `Missing or invalid: ${missing.join(', ')}` };
    }

    const product = mapRowToProduct(header, row, idx);
    if (!product) {
      return { rowIndex, valid: false, issue: 'Row could not be mapped to a product' };
    }

    const decision = decide(product, {
      now,
      reviewHorizonDays: options.reviewHorizonDays,
      overrideTargetWindowDays: options.overrideTargetWindowDays
    });

    const replenishByDate = decision.replenishByDate
      ? decision.replenishByDate.toISOString().slice(0, 10)
      : null;
    const daysUntilDepletion = Number.isFinite(decision.daysUntilDepletion)
      ? Number(decision.daysUntilDepletion.toFixed(2))
      : null;

    return {
      rowIndex,
      valid: true,
      productId: product.id,
      productName: product.name,
      needsReplenishment: decision.needsReplenishment,
      replenishByDate,
      recommendedOrderQty: decision.recommendedOrderQty ?? null,
      reason: decision.reason ?? null,
      daysUntilDepletion,
      avgDailyConsumption: decision.avgDaily ?? null,
      targetWindowDays: decision.targetWindowDays ?? null
    };
  });
}

function handleError(res, logger, err) {
  const message = String(err?.message ?? err);
  if (err?.name === 'ZodError') {
    res.status(400).json({ code: 'invalid_config', message, issues: err.issues ?? undefined });
    return;
  }
  logger?.error?.(err, 'inventory_route_error');
  res.status(500).json({ code: 'adapter_error', message });
}

function prepareProductsForAi(products) {
  return products
    .map(product => {
      if (!product || typeof product !== 'object') return null;
      return {
        id: product.id ?? null,
        productName: product.productName ?? product.name ?? product.id ?? null,
        brand: product.brand ?? null,
        unit: product.unit ?? null,
        qtyRemaining: product.qtyRemaining ?? null,
        avgDailyConsumption: product.avgDailyConsumption ?? null,
        avgMonthlyConsumption: product.avgMonthlyConsumption ?? null,
        replenishByDate: product.replenishByDate ?? null,
        autoSubscriptionActive: Boolean(product.autoSubscriptionActive),
        needsReplenishment: Boolean(product.needsReplenishment),
        reason: product.reason ?? null,
        buy: {
          place: product?.buy?.place ?? null,
          url: product?.buy?.url ?? null
        },
        notes: product.notes ?? null
      };
    })
    .filter(entry => entry && entry.productName);
}

function selectProductsForAi(products) {
  const prioritized = products.filter(item => item.needsReplenishment);
  const cohort = prioritized.length ? prioritized : products;
  return cohort.slice(0, 10);
}
