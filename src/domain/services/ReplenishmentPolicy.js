const DAYS_IN_MONTH = 30.44;

export function decide(product, { now, reviewHorizonDays = 14, overrideTargetWindowDays } = {}) {
  const avgDaily =
    product.avgDailyConsumption ??
    (product.avgMonthlyConsumption ? product.avgMonthlyConsumption / DAYS_IN_MONTH : null);

  if (product.autoSubscription?.active) {
    const daysUntil =
      avgDaily && avgDaily > 0 ? product.qtyRemaining / avgDaily : null;
    return {
      avgDaily,
      daysUntilDepletion: daysUntil,
      needsReplenishment: false,
      recommendedOrderQty: null,
      replenishByDate: null,
      reason: 'auto_subscription_active',
      targetWindowDays: (product.leadTimeDays ?? 2) + (product.safetyStockDays ?? 3)
    };
  }

  if (!avgDaily || !isFinite(avgDaily) || avgDaily <= 0) {
    const depleted = product.qtyRemaining <= 0;
    return {
      avgDaily: null,
      daysUntilDepletion: null,
      needsReplenishment: depleted,
      recommendedOrderQty: depleted
        ? Math.max(1, product.minOrderQty ?? product.packSize ?? 1)
        : null,
      replenishByDate: null,
      reason: depleted ? 'depleted_or_invalid' : 'insufficient_consumption_data',
      targetWindowDays: (product.leadTimeDays ?? 2) + (product.safetyStockDays ?? 3)
    };
  }

  const daysLeft = product.qtyRemaining / avgDaily;
  const safety = product.safetyStockDays ?? 3;
  const lead = product.leadTimeDays ?? 2;
  const targetWindowDays = overrideTargetWindowDays ?? lead + safety;
  const needs = daysLeft <= targetWindowDays;
  let recommendedOrderQty = null;
  let replenishByDate = null;
  let reason = needs ? 'within_target_window' : 'sufficient_stock';

  if (needs) {
    const targetCoverage = targetWindowDays + reviewHorizonDays;
    const targetQty = Math.ceil(Math.max(0, targetCoverage * avgDaily - product.qtyRemaining));
    const pack = product.packSize ?? 1;
    const min = product.minOrderQty ?? 1;
    recommendedOrderQty = Math.max(Math.ceil(targetQty / pack) * pack, min);
    const daysToOrder = Math.max(0, daysLeft - lead);
    replenishByDate = new Date(now.getTime() + daysToOrder * 86400000);
  }

  return {
    avgDaily,
    daysUntilDepletion: daysLeft,
    needsReplenishment: needs,
    recommendedOrderQty,
    replenishByDate,
    reason,
    targetWindowDays
  };
}
