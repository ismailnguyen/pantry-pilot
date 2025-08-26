# Pantry Pilot

A production-ready Node.js service that automatically monitors your pantry inventory, computes which items need replenishment, and sends email notifications to prevent stockouts.

## Features

- 🥫 **Pantry Inventory Management** - Track items with consumption patterns
- 📊 **Google Sheets Integration** - Use spreadsheets as your inventory database
- 📧 **Email Notifications** - HTML and plain text alerts for items to reorder
- ⏰ **Automated Scheduling** - Daily checks via GitHub Actions or cron
- 🔒 **Production Security** - API key authentication and input validation
- 🏗️ **Clean Architecture** - Ports & Adapters pattern for maintainability
- 🚀 **Easy Deployment** - Single Node.js service with Docker support

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Google Sheets Setup](#google-sheets-setup)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Development](#development)
- [Architecture](#architecture)

## Quick Start

1. **Clone and install dependencies**:
   ```bash
   git clone <your-repo>
   cd pantry-pilot
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Create Google Sheets inventory** (see [Google Sheets Setup](#google-sheets-setup))

4. **Start the service**:
   ```bash
   npm start
   ```

5. **Test manually**:
   ```bash
   curl -X POST http://localhost:8080/api/check-replenishment \
     -H "Content-Type: application/json" \
     -H "x-api-key: your-api-key" \
     -d '{"options": {"dryRun": true}}'
   ```

## Installation

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** or **yarn**
- **Google Account** with Google Sheets access
- **Gmail Account** or SMTP server for notifications

### Install Dependencies

```bash
npm install
```

### Development Dependencies

```bash
npm install --include=dev
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
PORT=8080
API_KEY=your-secure-random-api-key-here
TZ=Europe/Paris
ALLOW_INLINE_SECRETS=false

# Google Sheets Integration
GOOGLE_SPREADSHEET_ID=your-google-sheet-id
GOOGLE_SHEET_NAME=Inventory
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="Pantry Pilot <your-gmail@gmail.com>"
EMAIL_TO=your-email@gmail.com,partner@gmail.com
```

### Required Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `API_KEY` | Secure random string for API authentication | `abc123...` (generate with `openssl rand -base64 32`) |
| `GOOGLE_SPREADSHEET_ID` | ID from Google Sheets URL | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` |
| `GOOGLE_CLIENT_EMAIL` | Service account email | `service@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Service account private key | `-----BEGIN PRIVATE KEY-----\n...` |
| `SMTP_USER` | Gmail address or SMTP username | `your-email@gmail.com` |
| `SMTP_PASS` | Gmail app password or SMTP password | `abcd efgh ijkl mnop` |
| `EMAIL_TO` | Comma-separated recipient emails | `you@gmail.com,partner@gmail.com` |

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `TZ` | `Europe/Paris` | Timezone for date calculations |
| `GOOGLE_SHEET_NAME` | `Inventory` | Name of the sheet tab |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `465` | SMTP server port |
| `SMTP_SECURE` | `true` | Use SSL/TLS |
| `EMAIL_FROM` | | From address for emails |
| `ALLOW_INLINE_SECRETS` | `false` | Allow secrets in API requests (dev only) |

## Google Sheets Setup

### 1. Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Sheets API
4. Create a Service Account:
   - Go to IAM & Admin → Service Accounts
   - Create new service account
   - Generate JSON key file
5. Copy the `client_email` and `private_key` to your `.env`

### 2. Create Inventory Spreadsheet

1. Create a new Google Sheets document
2. Share it with your service account email (from step 1)
3. Give "Editor" permissions
4. Copy the spreadsheet ID from the URL to your `.env`

### 3. Set Up Inventory Sheet

Create a sheet named "Inventory" with these columns:

| Column | Header | Type | Required | Example |
|--------|--------|------|----------|---------|
| A | id | string | ✅ | `shampoo-001` |
| B | name | string | ✅ | `Repair Shampoo` |
| C | brand | string | | `BrandX` |
| D | unit | string | ✅ | `ml` (count/ml/g) |
| E | qty_remaining | number | ✅ | `250` |
| F | avg_daily_consumption | number | | `8.5` |
| G | avg_monthly_consumption | number | | `250` |
| H | last_replenished_at | date | | `2024-01-15` |
| I | auto_subscription | boolean | | `FALSE` |
| J | auto_subscription_note | string | | `Amazon Subscribe & Save` |
| K | buy_place | string | | `Amazon` |
| L | buy_url | string | | `https://amazon.com/...` |
| M | lead_time_days | number | | `2` |
| N | safety_stock_days | number | | `3` |
| O | min_order_qty | number | | `1` |
| P | pack_size | number | | `250` |
| Q | needs_replenishment | boolean | 🤖 | *Computed* |
| R | replenish_by_date | date | 🤖 | *Computed* |
| S | recommended_order_qty | number | 🤖 | *Computed* |
| T | reason | string | 🤖 | *Computed* |
| U | last_check_at | datetime | 🤖 | *Computed* |
| V | notes | string | | `Optional notes` |

**Note**: Columns Q-U are automatically updated by the service.

### 4. Sample Data Row

```
abc-001 | Shampoo Repair | BrandZ | ml | 250 | 8 |  | 2024-01-30 | FALSE |  | Amazon | https://... | 2 | 3 | 1 | 250 |  |  |  |  |  |
```

## Usage

### 1. Start the Service

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

The server will start on the configured port (default: 8080).

### 2. Manual API Calls

#### Check Inventory (Dry Run)
```bash
curl -X POST http://localhost:8080/api/check-replenishment \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "options": {
      "dryRun": true,
      "subjectPrefix": "[Test Run]"
    }
  }'
```

#### Check Inventory (Live)
```bash
curl -X POST http://localhost:8080/api/check-replenishment \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "options": {
      "dryRun": false
    }
  }'
```

#### With Custom Settings
```bash
curl -X POST http://localhost:8080/api/check-replenishment \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "options": {
      "dryRun": false,
      "subjectPrefix": "[Pantry Pilot]",
      "reviewHorizonDays": 21,
      "overrideTargetWindowDays": 7
    }
  }'
```

### 3. Automated Scheduling

#### GitHub Actions (Recommended)

The project includes a GitHub Actions workflow that runs daily at 7:00 AM Paris time.

**Setup:**
1. Deploy your service to a public URL (see [Deployment](#deployment))
2. Add GitHub repository secrets:
   - `API_URL`: Your service URL (e.g., `https://your-service.com`)
   - `API_KEY`: Your API key from `.env`

The workflow automatically triggers the inventory check daily.

#### Cron Job (Alternative)

Add to your crontab:
```bash
0 7 * * * curl -sS -X POST "https://your-service.com/api/check-replenishment" -H "Content-Type: application/json" -H "x-api-key: YOUR_API_KEY" -d '{"options": {"dryRun": false}}'
```

### 4. Health Check

```bash
curl http://localhost:8080/healthz
```

Returns:
```json
{
  "ok": true,
  "time": "2024-01-15T10:30:00.000Z"
}
```

## API Reference

### POST /api/check-replenishment

Triggers inventory check and optional email notification.

**Authentication**: API key via `x-api-key` header

**Request Body:**
```json
{
  "options": {
    "dryRun": false,                    // Skip updates and email
    "subjectPrefix": "[Pantry Pilot]", // Email subject prefix
    "reviewHorizonDays": 14,            // Days to plan ahead
    "overrideTargetWindowDays": null    // Override default target window
  },
  "inventory": {
    "type": "google_sheets",
    "spreadsheetId": "sheet-id",        // Override env var
    "sheetName": "Inventory"            // Override env var
  },
  "secrets": {                          // Only if ALLOW_INLINE_SECRETS=true
    "google": {
      "clientEmail": "...",
      "privateKey": "..."
    },
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 465,
      "secure": true,
      "user": "...",
      "pass": "...",
      "from": "...",
      "to": "..."
    }
  }
}
```

**Response (200):**
```json
{
  "checkedCount": 27,
  "needsReplenishmentCount": 6,
  "generatedAt": "2024-01-15T07:30:12.123Z",
  "policy": {
    "targetWindowDays": 5,
    "reviewHorizonDays": 14
  },
  "items": [
    {
      "id": "abc-001",
      "name": "Shampoo Repair",
      "brand": "BrandZ",
      "unit": "ml",
      "qtyRemaining": 50,
      "avgDaily": 8.0,
      "daysUntilDepletion": 6.25,
      "needsReplenishment": true,
      "recommendedOrderQty": 500,
      "replenishByDate": "2024-01-19",
      "reason": "within_target_window",
      "buy": {
        "place": "Amazon",
        "url": "https://amazon.com/..."
      }
    }
  ]
}
```

**Error Responses:**
- `400` - Validation error
- `401` - Missing/invalid API key
- `500` - Internal/adapter error

### GET /healthz

Health check endpoint.

**Response:**
```json
{
  "ok": true,
  "time": "2024-01-15T10:30:00.000Z"
}
```

## Deployment

### Environment Setup

For production deployment, ensure:

1. **Secure API Key**: Generate with `openssl rand -base64 32`
2. **Environment Variables**: Set all required variables
3. **HTTPS**: Use reverse proxy (nginx, CloudFlare)
4. **Secrets Security**: Never commit secrets to git

### Deployment Options

#### 1. Traditional VPS/Server

```bash
# Clone repository
git clone <your-repo>
cd pantry-pilot

# Install dependencies
npm install --production

# Set environment variables
cp .env.example .env
# Edit .env file

# Start with process manager
npm install -g pm2
pm2 start src/app/index.js --name inventory-service
pm2 startup
pm2 save
```

#### 2. Docker

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 8080

USER node

CMD ["node", "src/app/index.js"]
```

**Build and run:**
```bash
docker build -t pantry-pilot .
docker run -d --env-file .env -p 8080:8080 --name pantry pantry-pilot
```

#### 3. Cloud Platforms

**Railway:**
1. Connect GitHub repository
2. Add environment variables
3. Deploy automatically

**Render:**
1. Connect GitHub repository  
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Add environment variables

**Heroku:**
```bash
heroku create your-app-name
heroku config:set API_KEY=your-key
# Set other environment variables
git push heroku main
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Development

### Project Structure

```
src/
├── domain/                 # Core business logic
│   ├── entities/          # Domain entities
│   ├── services/          # Domain services  
│   ├── ports/             # Interfaces/contracts
│   ├── usecases/          # Application use cases
│   └── errors/            # Domain errors
├── adapters/              # External integrations
│   ├── inventory/         # Inventory repositories
│   ├── notify/            # Notification services
│   ├── runtime/           # Runtime services
│   ├── http/              # HTTP API
│   └── mappers/           # Data mappers
├── app/                   # Application composition
└── tests/                 # Test files
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Watch mode
npm run test:watch
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Development Commands

```bash
# Start in development mode (auto-restart)
npm run dev

# Start normally
npm start

# Run tests
npm test

# Lint code
npm run lint
```

### Adding New Features

The project uses **Ports & Adapters (Hexagonal) Architecture**:

1. **Domain Layer**: Add business logic in `src/domain/`
2. **Application Layer**: Modify use cases in `src/domain/usecases/`
3. **Infrastructure**: Add adapters in `src/adapters/`
4. **Composition**: Wire dependencies in `src/app/compose.js`

### Testing Strategy

- **Unit Tests**: Test domain logic in isolation
- **Integration Tests**: Test adapters with real dependencies
- **End-to-End Tests**: Test complete workflows via HTTP API

## Architecture

### Ports & Adapters Pattern

The service follows Hexagonal Architecture principles:

**Core Domain** (Pure JavaScript):
- `Product` entity with business rules
- `ReplenishmentPolicy` service with decision logic
- `CheckAndNotifyReplenishment` use case
- Ports (interfaces) for external dependencies

**Adapters** (Infrastructure):
- Google Sheets repository
- SMTP email notifier  
- HTTP API endpoints
- Configuration management
- Logging and monitoring

**Benefits**:
- Testable business logic
- Swappable external dependencies
- Clear separation of concerns
- Framework independence

### Decision Logic

The replenishment algorithm considers:

1. **Auto-subscription check**: Skip if active subscription
2. **Consumption analysis**: Calculate daily usage rate
3. **Depletion calculation**: Days until stock runs out
4. **Target window**: Lead time + safety stock days
5. **Reorder decision**: Trigger if depletion ≤ target window
6. **Quantity calculation**: Cover target + review horizon
7. **Constraints**: Apply pack size and minimum order rules

### Data Flow

1. **Trigger**: API call or scheduled job
2. **Read**: Fetch inventory from Google Sheets
3. **Compute**: Apply replenishment policy to each item
4. **Update**: Save decisions back to Google Sheets
5. **Notify**: Email summary of items needing replenishment

## Troubleshooting

### Common Issues

**Google Sheets Authentication Error**
```
Solution: Check service account email and private key formatting
- Ensure service account has access to the sheet
- Private key must preserve newline characters (\n)
```

**SMTP Authentication Failed**
```
Solution: Use Gmail App Password, not regular password
- Enable 2-factor authentication on Gmail
- Generate app-specific password
- Use app password in SMTP_PASS
```

**No Items Found in Sheet**
```
Solution: Check sheet structure and data format
- Verify column headers match expected format
- Ensure required columns (id, name, unit, qty_remaining) have data
- Check for empty rows or formatting issues
```

**API Returns 401 Unauthorized**
```
Solution: Check API key configuration
- Ensure API_KEY environment variable is set
- Use correct header: x-api-key
- Generate secure random API key
```

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug npm start
```

### Health Checks

Monitor service health:
- `GET /healthz` - Service status
- Check logs for errors
- Monitor Google Sheets API quotas
- Test email delivery

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check this README first
2. Review the [troubleshooting section](#troubleshooting)
3. Check existing GitHub issues
4. Create a new issue with detailed information

---

**🥫 Keep your pantry stocked with Pantry Pilot!**