export function createHeaderIndex(header) {
  return Object.fromEntries(header.map((h, i) => [String(h).trim().toLowerCase(), i]));
}

export function mapRowToProduct(header, row, headerIndex = createHeaderIndex(header)) {
  const idx = headerIndex;
  const get = (r, key) => {
    const position = idx[key];
    return position === undefined ? undefined : r[position];
  };
  const parseNum = value => (value === '' || value === undefined ? undefined : Number(value));
  const parseBool = value => String(value).toUpperCase() === 'TRUE';
  const parseDate = value => (value ? new Date(value) : null);
  const product = {
    id: String(get(row, 'id') ?? '').trim(),
    name: String(get(row, 'name') ?? '').trim(),
    brand: get(row, 'brand') || undefined,
    unit: get(row, 'unit'),
    qtyRemaining: Number(get(row, 'qty_remaining') ?? 0),
    avgDailyConsumption: parseNum(get(row, 'avg_daily_consumption')),
    avgMonthlyConsumption: parseNum(get(row, 'avg_monthly_consumption')),
    lastReplenishedAt: parseDate(get(row, 'last_replenished_at')),
    autoSubscription:
      get(row, 'auto_subscription') || get(row, 'auto_subscription_note')
        ? {
            active: parseBool(get(row, 'auto_subscription')),
            details: get(row, 'auto_subscription_note') || undefined
          }
        : null,
    buy:
      get(row, 'buy_place') || get(row, 'buy_url')
        ? {
            place: get(row, 'buy_place') || undefined,
            url: get(row, 'buy_url') || undefined
          }
        : null,
    leadTimeDays: parseNum(get(row, 'lead_time_days')) ?? 2,
    safetyStockDays: parseNum(get(row, 'safety_stock_days')) ?? 3,
    minOrderQty: parseNum(get(row, 'min_order_qty')) ?? 1,
    packSize: parseNum(get(row, 'pack_size')) ?? 1
  };
  if (!(product.id && product.name && product.unit && Number.isFinite(product.qtyRemaining))) return null;
  return product;
}

export function mapSheetToProducts(header, rows) {
  const idx = createHeaderIndex(header);
  return rows.map(row => mapRowToProduct(header, row, idx)).filter(Boolean);
}

export function mapUpdatesToSheet(updates) {
  return updates.map(update => [
    update.needsReplenishment ? 'TRUE' : 'FALSE',
    update.replenishByDate ? formatDate(update.replenishByDate) : '',
    update.recommendedOrderQty ?? '',
    update.reason ?? '',
    (update.lastCheckAt ?? new Date()).toISOString()
  ]);
}

function pad2(number) {
  return String(number).padStart(2, '0');
}

function formatDate(date) {
  const dt = date instanceof Date ? date : new Date(date);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
