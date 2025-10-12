import { google } from 'googleapis';
import { mapSheetToProducts, mapUpdatesToSheet } from '../../mappers/SheetRowMapper.js';

export class GoogleSheetsInventoryRepository {
  constructor(cfg) {
    this.spreadsheetId = cfg.spreadsheetId;
    this.sheetName = cfg.sheetName || 'Inventory';
    this.logger = cfg.logger;
    const jwt = new google.auth.JWT(
      cfg.clientEmail,
      undefined,
      (cfg.privateKey || '').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    this.sheets = google.sheets({ version: 'v4', auth: jwt });
  }

  async getSheetData() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A1:Z`
    });
    const values = res.data.values || [];
    if (!values.length) return { header: [], rows: [] };
    const [rawHeader, ...rawRows] = values;
    let width = rawHeader.length;
    for (const row of rawRows) width = Math.max(width, row.length);
    const header = Array.from({ length: width }, (_, i) => rawHeader[i] ?? '');
    const rows = rawRows.map(row => Array.from({ length: width }, (_, i) => row[i] ?? ''));
    return { header, rows };
  }

  async listProducts() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A:Z`
    });
    const rows = res.data.values || [];
    if (!rows.length) return [];
    return mapSheetToProducts(rows[0], rows.slice(1));
  }

  async saveProducts(updates) {
    if (!updates.length) return;
    const values = mapUpdatesToSheet(updates);
    const range = `${this.sheetName}!Q2:U${updates.length + 1}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  }

  async overwriteSheet({ header, rows }) {
    if (!Array.isArray(header)) throw new Error('header must be an array');
    if (!Array.isArray(rows)) throw new Error('rows must be an array');
    const normalizedRows = rows.map(r => Array.from({ length: header.length }, (_, i) => r?.[i] ?? ''));
    const values = [header, ...normalizedRows];
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A:Z`
    });
    if (values.length === 0 || (values.length === 1 && values[0].every(cell => cell === ''))) return;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  }
}
