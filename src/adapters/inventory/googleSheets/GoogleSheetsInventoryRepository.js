import { google } from 'googleapis';
import { AdapterError } from '../../../domain/errors/DomainError.js';
import { SheetRowMapper } from '../../mappers/SheetRowMapper.js';

export class GoogleSheetsInventoryRepository {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.sheets = null;
  }

  async _getSheets() {
    if (!this.sheets) {
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: this.config.clientEmail,
            private_key: this.config.privateKey.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.sheets = google.sheets({ version: 'v4', auth });
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to initialize Google Sheets client');
        throw new AdapterError('Failed to initialize Google Sheets client', 'google_sheets', error);
      }
    }
    return this.sheets;
  }

  async listProducts() {
    try {
      const sheets = await this._getSheets();
      const range = `${this.config.sheetName}!A:V`;

      this.logger.info({ 
        spreadsheetId: this.config.spreadsheetId, 
        sheetName: this.config.sheetName, 
        range 
      }, 'Reading from Google Sheets');

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: range,
      });

      const rows = response.data.values || [];
      
      if (rows.length === 0) {
        this.logger.warn('No data found in spreadsheet');
        return [];
      }

      const headerRow = rows[0];
      const dataRows = rows.slice(1);

      this.logger.info({ 
        totalRows: dataRows.length, 
        headerColumns: headerRow.length 
      }, 'Retrieved spreadsheet data');

      const products = [];
      const errors = [];

      for (let i = 0; i < dataRows.length; i++) {
        const rowIndex = i + 2;
        
        try {
          const product = SheetRowMapper.rowToProduct(dataRows[i], rowIndex);
          if (product) {
            products.push(product);
          }
        } catch (error) {
          errors.push({ row: rowIndex, error: error.message });
          this.logger.warn({ row: rowIndex, error: error.message }, 'Skipped invalid row');
        }
      }

      if (errors.length > 0) {
        this.logger.warn({ errorCount: errors.length, totalRows: dataRows.length }, 'Some rows were skipped due to validation errors');
      }

      this.logger.info({ validProducts: products.length }, 'Successfully parsed products');
      return products;

    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      
      this.logger.error({ error: error.message }, 'Failed to read from Google Sheets');
      
      if (error.code === 403) {
        throw new AdapterError('Access denied to Google Sheets. Check service account permissions.', 'google_sheets', error);
      } else if (error.code === 404) {
        throw new AdapterError('Spreadsheet or sheet not found. Check spreadsheet ID and sheet name.', 'google_sheets', error);
      } else if (error.code === 429) {
        throw new AdapterError('Google Sheets API rate limit exceeded. Please try again later.', 'google_sheets', error);
      } else {
        throw new AdapterError('Failed to read from Google Sheets', 'google_sheets', error);
      }
    }
  }

  async saveProducts(products, options = {}) {
    if (!products || products.length === 0) {
      this.logger.info('No products to save');
      return;
    }

    const { updateQuantities = false, updateAllFields = false } = options;

    try {
      const sheets = await this._getSheets();
      const startRow = 2;
      const endRow = startRow + products.length - 1;

      let range, values, updateDescription;
      
      if (updateAllFields) {
        range = SheetRowMapper.getAllUpdateRange(startRow, endRow);
        values = SheetRowMapper.getAllUpdateValues(products);
        updateDescription = 'all fields';
      } else if (updateQuantities) {
        // Update both quantities and derived fields with batch update
        const updates = [
          {
            range: SheetRowMapper.getQuantityUpdateRange(startRow, endRow),
            values: SheetRowMapper.getQuantityUpdateValues(products)
          },
          {
            range: SheetRowMapper.getDerivedFieldsRange(startRow, endRow),
            values: SheetRowMapper.getDerivedFieldsValues(products)
          }
        ];

        this.logger.info({ 
          ranges: updates.map(u => u.range),
          productCount: products.length 
        }, 'Updating quantities and derived fields in Google Sheets');

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.config.spreadsheetId,
          resource: {
            valueInputOption: 'RAW',
            data: updates
          }
        });

        this.logger.info({ updatedProducts: products.length }, 'Successfully updated quantities and derived fields in Google Sheets');
        return;
      } else {
        range = SheetRowMapper.getDerivedFieldsRange(startRow, endRow);
        values = SheetRowMapper.getDerivedFieldsValues(products);
        updateDescription = 'derived fields';
      }

      this.logger.info({ 
        range, 
        productCount: products.length,
        updateType: updateDescription
      }, `Updating ${updateDescription} in Google Sheets`);

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.config.spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: values
        }
      });

      this.logger.info({ 
        updatedProducts: products.length,
        updateType: updateDescription
      }, `Successfully updated ${updateDescription} in Google Sheets`);

    } catch (error) {
      this.logger.error({ 
        error: error.message, 
        productCount: products.length 
      }, 'Failed to save products to Google Sheets');

      if (error.code === 403) {
        throw new AdapterError('Access denied to Google Sheets. Check service account permissions.', 'google_sheets', error);
      } else if (error.code === 404) {
        throw new AdapterError('Spreadsheet or sheet not found. Check spreadsheet ID and sheet name.', 'google_sheets', error);
      } else if (error.code === 429) {
        throw new AdapterError('Google Sheets API rate limit exceeded. Please try again later.', 'google_sheets', error);
      } else {
        throw new AdapterError('Failed to save to Google Sheets', 'google_sheets', error);
      }
    }
  }
}