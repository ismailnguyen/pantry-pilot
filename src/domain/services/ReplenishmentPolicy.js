export class ReplenishmentPolicy {
  static computeDecision(product, options = {}) {
    const {
      now = new Date(),
      reviewHorizonDays = 14,
      overrideTargetWindowDays = null,
      autoDecrementStock = true
    } = options;

    const avgDaily = product.getAvgDailyConsumption();
    
    // Calculate current stock based on consumption since last replenishment
    const currentStock = autoDecrementStock ? product.calculateCurrentStock(now) : product.qtyRemaining;
    
    if (product.hasAutoSubscription()) {
      return {
        needsReplenishment: false,
        recommendedOrderQty: null,
        replenishByDate: null,
        reason: 'auto_subscription_active',
        daysUntilDepletion: avgDaily && avgDaily > 0 ? currentStock / avgDaily : null,
        currentStock,
        daysSinceReplenishment: product.getDaysSinceLastReplenishment(now)
      };
    }

    if (!avgDaily || avgDaily <= 0) {
      const isDepleted = currentStock <= 0;
      return {
        needsReplenishment: isDepleted,
        recommendedOrderQty: isDepleted ? Math.max(1, product.minOrderQty || product.packSize || 1) : null,
        replenishByDate: null,
        reason: isDepleted ? 'depleted_or_invalid' : 'insufficient_consumption_data',
        daysUntilDepletion: null,
        currentStock,
        daysSinceReplenishment: product.getDaysSinceLastReplenishment(now)
      };
    }

    const daysUntilDepletion = currentStock / avgDaily;
    const targetWindowDays = overrideTargetWindowDays ?? (product.leadTimeDays + product.safetyStockDays);
    
    const needsReplenishment = daysUntilDepletion <= targetWindowDays;
    
    let recommendedOrderQty = null;
    let replenishByDate = null;
    
    if (needsReplenishment) {
      const targetCoverageDays = targetWindowDays + reviewHorizonDays;
      const targetQty = Math.ceil(Math.max(0, targetCoverageDays * avgDaily - currentStock));
      
      recommendedOrderQty = this._applyOrderConstraints(targetQty, product);
      
      const daysToReplenish = Math.max(0, daysUntilDepletion - product.leadTimeDays);
      replenishByDate = new Date(now.getTime() + daysToReplenish * 86400000);
    }

    return {
      needsReplenishment,
      recommendedOrderQty,
      replenishByDate,
      reason: needsReplenishment ? 'within_target_window' : 'sufficient_stock',
      daysUntilDepletion,
      currentStock,
      daysSinceReplenishment: product.getDaysSinceLastReplenishment(now)
    };
  }

  static _applyOrderConstraints(baseQty, product) {
    let qty = Math.max(baseQty, product.minOrderQty || 1);
    
    if (product.packSize && product.packSize > 1) {
      qty = Math.ceil(qty / product.packSize) * product.packSize;
    }
    
    return qty;
  }
}