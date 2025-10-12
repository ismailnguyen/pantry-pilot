import express from 'express';
import { loadConfigFromEnvAndBody } from '../runtime/EnvConfig.js';
import { PinoLogger } from '../runtime/PinoLogger.js';
import { SystemClock } from '../runtime/SystemClock.js';
import { GoogleSheetsInventoryRepository } from '../inventory/googleSheets/GoogleSheetsInventoryRepository.js';
import { SmtpEmailNotifier } from '../notify/email/SmtpEmailNotifier.js';
import { execute } from '../../domain/usecases/CheckAndNotifyReplenishment.js';
import { decide } from '../../domain/services/ReplenishmentPolicy.js';
import { createHeaderIndex, mapRowToProduct } from '../mappers/SheetRowMapper.js';

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
