import { ReplenishmentPolicy } from '../services/ReplenishmentPolicy.js';

export class CheckAndNotifyReplenishment {
  constructor({ inventoryRepository, notifier, clock, logger }) {
    this.inventoryRepository = inventoryRepository;
    this.notifier = notifier;
    this.clock = clock;
    this.logger = logger;
  }

  async execute(params = {}) {
    const {
      policyOverrides = {},
      notification = { enabled: true }
    } = params;

    const now = this.clock.now();
    const startTime = Date.now();

    this.logger.info({ timestamp: now.toISOString() }, 'Starting replenishment check');

    try {
      const products = await this.inventoryRepository.listProducts();
      this.logger.info({ productCount: products.length }, 'Loaded products from inventory');

      const results = [];
      const updates = [];

      for (const product of products) {
        const decision = ReplenishmentPolicy.computeDecision(product, {
          now,
          reviewHorizonDays: policyOverrides.reviewHorizonDays,
          overrideTargetWindowDays: policyOverrides.overrideTargetWindowDays,
          autoDecrementStock: policyOverrides.autoDecrementStock !== false
        });

        const resultItem = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          unit: product.unit,
          qtyRemaining: product.qtyRemaining,
          currentStock: decision.currentStock,
          avgDaily: product.getAvgDailyConsumption(),
          daysUntilDepletion: decision.daysUntilDepletion,
          daysSinceReplenishment: decision.daysSinceReplenishment,
          needsReplenishment: decision.needsReplenishment,
          recommendedOrderQty: decision.recommendedOrderQty,
          replenishByDate: decision.replenishByDate?.toISOString()?.slice(0, 10) || null,
          reason: decision.reason,
          buy: product.buy
        };

        results.push(resultItem);

        const updatedProduct = product.clone();
        updatedProduct.needsReplenishment = decision.needsReplenishment;
        updatedProduct.recommendedOrderQty = decision.recommendedOrderQty;
        updatedProduct.replenishByDate = decision.replenishByDate;
        updatedProduct.reason = decision.reason;
        updatedProduct.lastCheckAt = now;
        
        // Optionally update the quantity to reflect calculated current stock
        if (policyOverrides.updateCalculatedQuantities && decision.currentStock !== product.qtyRemaining) {
          updatedProduct.qtyRemaining = decision.currentStock;
        }

        updates.push(updatedProduct);
      }

      if (!notification.dryRun) {
        const saveOptions = {
          updateQuantities: policyOverrides.updateCalculatedQuantities || false,
          updateAllFields: false
        };
        
        await this.inventoryRepository.saveProducts(updates, saveOptions);
        this.logger.info({ 
          updatedCount: updates.length,
          updateQuantities: saveOptions.updateQuantities
        }, 'Saved product updates');
      } else {
        this.logger.info('Dry run - skipped saving product updates');
      }

      const itemsToNotify = results.filter(item => item.needsReplenishment);

      if (notification.enabled && itemsToNotify.length > 0) {
        const emailMessage = this._buildEmailMessage({
          items: itemsToNotify,
          generatedAt: now,
          subjectPrefix: notification.subjectPrefix || '[Home Inventory]',
          dryRun: notification.dryRun
        });

        if (!notification.dryRun) {
          await this.notifier.send(emailMessage);
          this.logger.info({ recipientItems: itemsToNotify.length }, 'Sent replenishment notification');
        } else {
          this.logger.info({ recipientItems: itemsToNotify.length }, 'Dry run - skipped sending notification');
        }
      } else {
        this.logger.info('No items need replenishment or notifications disabled');
      }

      const policy = {
        targetWindowDays: policyOverrides.overrideTargetWindowDays || 
          (updates.length > 0 ? updates[0].leadTimeDays + updates[0].safetyStockDays : 5),
        reviewHorizonDays: policyOverrides.reviewHorizonDays || 14
      };

      const result = {
        checkedCount: results.length,
        needsReplenishmentCount: itemsToNotify.length,
        generatedAt: now.toISOString(),
        policy,
        items: results
      };

      const duration = Date.now() - startTime;
      this.logger.info({ 
        duration, 
        checkedCount: result.checkedCount, 
        needsReplenishmentCount: result.needsReplenishmentCount 
      }, 'Completed replenishment check');

      return result;

    } catch (error) {
      this.logger.error({ error: error.message, stack: error.stack }, 'Replenishment check failed');
      throw error;
    }
  }

  _buildEmailMessage({ items, generatedAt, subjectPrefix, dryRun }) {
    const dateStr = generatedAt.toISOString().slice(0, 10);
    const subject = `${subjectPrefix} ${items.length} item(s) need replenishment — ${dateStr}`;

    const html = this._buildHtmlEmail({ items, generatedAt, dryRun });
    const text = this._buildTextEmail({ items, generatedAt, dryRun });

    return { subject, html, text };
  }

  _buildHtmlEmail({ items, generatedAt, dryRun }) {
    const rows = items.map(item => {
      const buyLink = item.buy?.url ? 
        `<a href="${item.buy.url}" target="_blank">${item.buy.place || 'Buy'}</a>` : 
        (item.buy?.place || '');
      
      const daysLeft = item.daysUntilDepletion !== null ? 
        Math.round(item.daysUntilDepletion * 10) / 10 : 
        'N/A';
      
      const stockDisplay = item.currentStock !== undefined && item.currentStock !== item.qtyRemaining ?
        `${Math.round(item.currentStock * 100) / 100} ${item.unit} (${item.qtyRemaining} recorded)` :
        `${item.qtyRemaining} ${item.unit}`;

      return `
        <tr>
          <td>${item.name}</td>
          <td>${item.brand || ''}</td>
          <td>${stockDisplay}</td>
          <td>${daysLeft}</td>
          <td>${item.replenishByDate || ''}</td>
          <td>${item.recommendedOrderQty || ''} ${item.unit}</td>
          <td>${buyLink}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .dry-run { background-color: #fff3cd; padding: 10px; margin: 10px 0; border: 1px solid #ffeaa7; }
        </style>
      </head>
      <body>
        <h2>Pantry Pilot Replenishment Report</h2>
        <p>Generated at: ${generatedAt.toISOString()}</p>
        ${dryRun ? '<div class="dry-run"><strong>DRY RUN</strong> - No changes were made to inventory</div>' : ''}
        <p>The following ${items.length} item(s) need replenishment:</p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Brand</th>
              <th>Remaining</th>
              <th>Days Left</th>
              <th>Replenish By</th>
              <th>Recommended Qty</th>
              <th>Buy</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  _buildTextEmail({ items, generatedAt, dryRun }) {
    const header = `
Pantry Pilot Replenishment Report
Generated at: ${generatedAt.toISOString()}
${dryRun ? '\n*** DRY RUN *** - No changes were made to inventory\n' : ''}

The following ${items.length} item(s) need replenishment:

`;

    const maxNameLen = Math.max(...items.map(i => i.name.length), 4);
    const maxBrandLen = Math.max(...items.map(i => (i.brand || '').length), 5);
    const stockDisplays = items.map(i => 
      i.currentStock !== undefined && i.currentStock !== i.qtyRemaining ?
        `${Math.round(i.currentStock * 100) / 100} ${i.unit} (${i.qtyRemaining})` :
        `${i.qtyRemaining} ${i.unit}`
    );
    const maxQtyLen = Math.max(...stockDisplays.map(s => s.length), 9);

    const headerRow = `${'Name'.padEnd(maxNameLen)} | ${'Brand'.padEnd(maxBrandLen)} | ${'Remaining'.padEnd(maxQtyLen)} | Days Left | Replenish By | Recommended | Buy`;
    const separator = '-'.repeat(headerRow.length);

    const rows = items.map((item, index) => {
      const daysLeft = item.daysUntilDepletion !== null ? 
        Math.round(item.daysUntilDepletion * 10) / 10 : 
        'N/A';
      const buyPlace = item.buy?.place || '';
      const stockDisplay = stockDisplays[index];

      return `${item.name.padEnd(maxNameLen)} | ${(item.brand || '').padEnd(maxBrandLen)} | ${stockDisplay.padEnd(maxQtyLen)} | ${daysLeft.toString().padEnd(9)} | ${(item.replenishByDate || '').padEnd(12)} | ${(item.recommendedOrderQty || '').toString().padEnd(11)} | ${buyPlace}`;
    }).join('\n');

    return header + headerRow + '\n' + separator + '\n' + rows;
  }
}