/**
 * @typedef {Object} EmailMessage
 * @property {string} subject - Email subject
 * @property {string} [html] - HTML body content
 * @property {string} [text] - Plain text body content
 */

/**
 * @typedef {Object} Notifier
 * @property {(message: EmailMessage) => Promise<void>} send - Send notification
 */

export default {};