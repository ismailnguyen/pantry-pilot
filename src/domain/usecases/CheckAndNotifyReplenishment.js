import { decide } from '../services/ReplenishmentPolicy.js';

export async function execute(params, { repo, notifier, clock, logger }) {
  const now = clock.now();
  const products = await repo.listProducts();
  const results = [];
  const updates = [];

  for (const product of products) {
    const decision = decide(product, {
      now,
      reviewHorizonDays: params?.policyOverrides?.reviewHorizonDays,
      overrideTargetWindowDays: params?.policyOverrides?.overrideTargetWindowDays
    });

    const item = {
      id: product.id,
      name: product.name,
      brand: product.brand ?? null,
      unit: product.unit,
      qtyRemaining: product.qtyRemaining,
      avgDaily: decision.avgDaily,
      daysUntilDepletion: decision.daysUntilDepletion,
      needsReplenishment: decision.needsReplenishment,
      recommendedOrderQty: decision.recommendedOrderQty ?? null,
      replenishByDate: decision.replenishByDate ? decision.replenishByDate.toISOString().slice(0, 10) : null,
      reason: decision.reason,
      buy: product.buy ?? null
    };

    results.push(item);
    updates.push({
      ...product,
      needsReplenishment: decision.needsReplenishment,
      replenishByDate: decision.replenishByDate ?? null,
      recommendedOrderQty: decision.recommendedOrderQty ?? null,
      reason: decision.reason,
      lastCheckAt: now
    });
  }

  if (!params?.notification?.dryRun) {
    await repo.saveProducts(updates);
  }

  const itemsToNotify = results.filter(r => r.needsReplenishment);
  const enabled = params?.notification?.enabled ?? true;
  if (enabled && itemsToNotify.length > 0 && !params?.notification?.dryRun) {
    const subjectPrefix = params?.notification?.subjectPrefix ?? '[Home Inventory]';
    const subject = `${subjectPrefix} ${itemsToNotify.length} item(s) need replenishment — ${now.toISOString().slice(0, 10)}`;
    const html = `<p>Generated at ${now.toISOString()}</p>`;
    const text = itemsToNotify.map(i => `- ${i.name}`).join('\n');
    await notifier.send({ subject, html, text });
  }

  logger?.info?.({ checked: results.length, needs: itemsToNotify.length }, 'replenishment_run');

  return {
    checkedCount: results.length,
    needsReplenishmentCount: itemsToNotify.length,
    generatedAt: now.toISOString(),
    policy: {
      targetWindowDays: params?.policyOverrides?.overrideTargetWindowDays ?? undefined,
      reviewHorizonDays: params?.policyOverrides?.reviewHorizonDays ?? 14
    },
    items: results
  };
}
