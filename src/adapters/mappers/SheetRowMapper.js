import { Product } from '../../domain/entities/Product.js';
import { ValidationError } from '../../domain/errors/DomainError.js';

export class SheetRowMapper {
  static HEADER_ROW = [
    'id', 'name', 'brand', 'unit', 'qty_remaining',
    'avg_daily_consumption', 'avg_monthly_consumption', 'last_replenished_at',
    'auto_subscription', 'auto_subscription_note', 'buy_place', 'buy_url',
    'lead_time_days', 'safety_stock_days', 'min_order_qty', 'pack_size',
    'needs_replenishment', 'replenish_by_date', 'recommended_order_qty',
    'reason', 'last_check_at', 'notes'
  ];

  static rowToProduct(row, rowIndex) {
    try {
      if (!row || row.length === 0) {
        return null;
      }

      const [
        id, name, brand, unit, qtyRemaining,
        avgDailyConsumption, avgMonthlyConsumption, lastReplenishedAt,
        autoSubscription, autoSubscriptionNote, buyPlace, buyUrl,
        leadTimeDays, safetyStockDays, minOrderQty, packSize,
        needsReplenishment, replenishByDate, recommendedOrderQty,
        reason, lastCheckAt, notes
      ] = row;

      if (!id || !name || !unit) {
        throw new ValidationError(`Row ${rowIndex}: Missing required fields (id, name, unit)`);
      }

      const autoSubscriptionObj = autoSubscription === true || autoSubscription === 'TRUE' ? 
        { active: true, details: autoSubscriptionNote || null } : 
        null;

      const buyObj = buyPlace || buyUrl ? 
        { place: buyPlace || null, url: buyUrl || null } : 
        null;

      return new Product({
        id: String(id).trim(),
        name: String(name).trim(),
        brand: brand ? String(brand).trim() : null,
        unit: String(unit).trim().toLowerCase(),
        qtyRemaining: this._parseNumber(qtyRemaining, 0),
        avgDailyConsumption: this._parseNumber(avgDailyConsumption, null),
        avgMonthlyConsumption: this._parseNumber(avgMonthlyConsumption, null),
        lastReplenishedAt: this._parseDate(lastReplenishedAt),
        autoSubscription: autoSubscriptionObj,
        buy: buyObj,
        leadTimeDays: this._parseNumber(leadTimeDays, 2),
        safetyStockDays: this._parseNumber(safetyStockDays, 3),
        minOrderQty: this._parseNumber(minOrderQty, null),
        packSize: this._parseNumber(packSize, null),
        needsReplenishment: this._parseBoolean(needsReplenishment),
        replenishByDate: this._parseDate(replenishByDate),
        recommendedOrderQty: this._parseNumber(recommendedOrderQty, null),
        reason: reason ? String(reason).trim() : null,
        lastCheckAt: this._parseDate(lastCheckAt)
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Row ${rowIndex}: ${error.message}`);
    }
  }

  static productToRow(product) {
    return [
      product.id,
      product.name,
      product.brand,
      product.unit,
      product.qtyRemaining,
      product.avgDailyConsumption,
      product.avgMonthlyConsumption,
      product.lastReplenishedAt ? product.lastReplenishedAt.toISOString().slice(0, 10) : '',
      product.autoSubscription?.active || false,
      product.autoSubscription?.details || '',
      product.buy?.place || '',
      product.buy?.url || '',
      product.leadTimeDays,
      product.safetyStockDays,
      product.minOrderQty,
      product.packSize,
      product.needsReplenishment,
      product.replenishByDate ? (product.replenishByDate instanceof Date ? product.replenishByDate.toISOString().slice(0, 10) : product.replenishByDate) : '',
      product.recommendedOrderQty,
      product.reason,
      product.lastCheckAt ? product.lastCheckAt.toISOString() : '',
      ''
    ];
  }

  static getDerivedFieldsRange(startRow, endRow) {
    return `Q${startRow}:U${endRow}`;
  }

  static getDerivedFieldsValues(products) {
    return products.map(product => [
      product.needsReplenishment,
      product.replenishByDate ? (product.replenishByDate instanceof Date ? product.replenishByDate.toISOString().slice(0, 10) : product.replenishByDate) : '',
      product.recommendedOrderQty,
      product.reason,
      product.lastCheckAt ? product.lastCheckAt.toISOString() : ''
    ]);
  }

  static getQuantityUpdateRange(startRow, endRow) {
    return `E${startRow}:E${endRow}`;
  }

  static getQuantityUpdateValues(products) {
    return products.map(product => [product.qtyRemaining]);
  }

  static getAllUpdateRange(startRow, endRow) {
    return `E${startRow}:U${endRow}`;
  }

  static getAllUpdateValues(products) {
    return products.map(product => [
      product.qtyRemaining,
      product.avgDailyConsumption,
      product.avgMonthlyConsumption,
      product.lastReplenishedAt ? product.lastReplenishedAt.toISOString().slice(0, 10) : '',
      product.autoSubscription?.active || false,
      product.autoSubscription?.details || '',
      product.buy?.place || '',
      product.buy?.url || '',
      product.leadTimeDays,
      product.safetyStockDays,
      product.minOrderQty,
      product.packSize,
      product.needsReplenishment,
      product.replenishByDate ? (product.replenishByDate instanceof Date ? product.replenishByDate.toISOString().slice(0, 10) : product.replenishByDate) : '',
      product.recommendedOrderQty,
      product.reason,
      product.lastCheckAt ? product.lastCheckAt.toISOString() : ''
    ]);
  }

  static _parseNumber(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  static _parseBoolean(value) {
    if (value === null || value === undefined || value === '') {
      return false;
    }
    return value === true || String(value).toLowerCase() === 'true';
  }

  static _parseDate(value) {
    if (!value) return null;
    
    if (value instanceof Date) {
      return value;
    }
    
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
}