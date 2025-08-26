export class Product {
  constructor({
    id,
    name,
    brand = null,
    unit,
    qtyRemaining,
    avgDailyConsumption = null,
    avgMonthlyConsumption = null,
    lastReplenishedAt = null,
    autoSubscription = null,
    buy = null,
    leadTimeDays = 2,
    safetyStockDays = 3,
    minOrderQty = null,
    packSize = null,
    needsReplenishment = false,
    replenishByDate = null,
    recommendedOrderQty = null,
    reason = null,
    lastCheckAt = null
  }) {
    if (!id || typeof id !== 'string') {
      throw new Error('Product id is required and must be a string');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Product name is required and must be a string');
    }
    if (!unit || !['count', 'ml', 'g'].includes(unit)) {
      throw new Error('Product unit is required and must be one of: count, ml, g');
    }
    if (typeof qtyRemaining !== 'number' || qtyRemaining < 0) {
      throw new Error('Product qtyRemaining must be a non-negative number');
    }

    this.id = id;
    this.name = name;
    this.brand = brand;
    this.unit = unit;
    this.qtyRemaining = qtyRemaining;
    this.avgDailyConsumption = avgDailyConsumption;
    this.avgMonthlyConsumption = avgMonthlyConsumption;
    this.lastReplenishedAt = lastReplenishedAt;
    this.autoSubscription = autoSubscription;
    this.buy = buy;
    this.leadTimeDays = leadTimeDays;
    this.safetyStockDays = safetyStockDays;
    this.minOrderQty = minOrderQty;
    this.packSize = packSize;
    
    this.needsReplenishment = needsReplenishment;
    this.replenishByDate = replenishByDate;
    this.recommendedOrderQty = recommendedOrderQty;
    this.reason = reason;
    this.lastCheckAt = lastCheckAt;
  }

  getAvgDailyConsumption() {
    if (this.avgDailyConsumption !== null && this.avgDailyConsumption > 0) {
      return this.avgDailyConsumption;
    }
    if (this.avgMonthlyConsumption !== null && this.avgMonthlyConsumption > 0) {
      return this.avgMonthlyConsumption / 30.44;
    }
    return null;
  }

  hasAutoSubscription() {
    return this.autoSubscription?.active === true;
  }

  calculateCurrentStock(now = new Date()) {
    if (!this.lastReplenishedAt || !this.qtyRemaining) {
      return this.qtyRemaining;
    }

    const avgDaily = this.getAvgDailyConsumption();
    if (!avgDaily || avgDaily <= 0) {
      return this.qtyRemaining;
    }

    const daysSinceReplenishment = (now.getTime() - this.lastReplenishedAt.getTime()) / (1000 * 60 * 60 * 24);
    const consumedSinceReplenishment = avgDaily * daysSinceReplenishment;
    const currentStock = Math.max(0, this.qtyRemaining - consumedSinceReplenishment);
    
    return currentStock;
  }

  getDaysSinceLastReplenishment(now = new Date()) {
    if (!this.lastReplenishedAt) return null;
    return (now.getTime() - this.lastReplenishedAt.getTime()) / (1000 * 60 * 60 * 24);
  }

  clone() {
    return new Product({
      id: this.id,
      name: this.name,
      brand: this.brand,
      unit: this.unit,
      qtyRemaining: this.qtyRemaining,
      avgDailyConsumption: this.avgDailyConsumption,
      avgMonthlyConsumption: this.avgMonthlyConsumption,
      lastReplenishedAt: this.lastReplenishedAt,
      autoSubscription: this.autoSubscription ? { ...this.autoSubscription } : null,
      buy: this.buy ? { ...this.buy } : null,
      leadTimeDays: this.leadTimeDays,
      safetyStockDays: this.safetyStockDays,
      minOrderQty: this.minOrderQty,
      packSize: this.packSize,
      needsReplenishment: this.needsReplenishment,
      replenishByDate: this.replenishByDate,
      recommendedOrderQty: this.recommendedOrderQty,
      reason: this.reason,
      lastCheckAt: this.lastCheckAt
    });
  }
}