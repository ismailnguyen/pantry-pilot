/**
 * @typedef {Object} InventoryRepository
 * @property {() => Promise<import('../entities/Product.js').Product[]>} listProducts - Get all products from inventory
 * @property {(updates: import('../entities/Product.js').Product[]) => Promise<void>} saveProducts - Save derived fields only, non-destructive
 */

export default {};