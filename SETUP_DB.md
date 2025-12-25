# Database Setup Instructions

## Quick Setup

To connect to your Oracle database, you need to set environment variables. You have two options:

### Option 1: Using .env file (Recommended)

1. Create a `.env` file in the project root:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Oracle credentials:
```
DB_USER=your_username
DB_PASSWORD=your_password
DB_CONNECTION_STRING=localhost:1521/XE
```

3. Install dotenv package:
```bash
npm install dotenv
```

4. Update `index.js` to load .env file (add at the top):
```javascript
import 'dotenv/config';
```

### Option 2: Using Environment Variables Directly

Set the environment variables before running the server:

**Linux/Mac:**
```bash
export DB_USER=your_username
export DB_PASSWORD=your_password
export DB_CONNECTION_STRING=localhost:1521/XE
npm start
```

**Windows (Command Prompt):**
```cmd
set DB_USER=your_username
set DB_PASSWORD=your_password
set DB_CONNECTION_STRING=localhost:1521/XE
npm start
```

**Windows (PowerShell):**
```powershell
$env:DB_USER="your_username"
$env:DB_PASSWORD="your_password"
$env:DB_CONNECTION_STRING="localhost:1521/XE"
npm start
```

## Connection String Format

The connection string format is: `host:port/service_name`

Examples:
- `localhost:1521/XE` - Local Oracle Express Edition
- `192.168.1.100:1521/ORCL` - Remote Oracle instance
- `db.example.com:1521/HRDB` - Named service

## Testing the Connection

Once configured, restart the server and check the console output. You should see:
```
✅ Oracle database pool created
```

If you see warnings about missing credentials, the environment variables are not set correctly.

## Troubleshooting

1. **"Database pool not initialized"** - Check that all three environment variables are set
2. **Connection timeout** - Verify the connection string and that Oracle is running
3. **Authentication failed** - Double-check username and password
4. **TNS error** - Verify the connection string format

