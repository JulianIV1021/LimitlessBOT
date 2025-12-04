# Limitless Arbitrage Trading Bot

Professional trading bot for Limitless Exchange - Farm Season 2 airdrop with automated arbitrage strategies on Base network.

![Limitless Bot](https://img.shields.io/badge/Network-Base-blue) ![Season 2](https://img.shields.io/badge/Season-2-purple) ![Airdrop](https://img.shields.io/badge/Farming-Airdrop-green)

## 🚀 Quick Deploy

### Option 1: Vercel (Recommended)

1. Push this folder to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project" → Import your repo
4. Click "Deploy" - Done!

Or use Vercel CLI:
```bash
npm i -g vercel
vercel
```

### Option 2: Netlify

1. Push to GitHub
2. Go to [netlify.com](https://netlify.com)
3. "Add new site" → "Import an existing project"
4. Select repo → Deploy

Or drag & drop the `dist` folder after building:
```bash
npm run build
# Then drag 'dist' folder to netlify.com
```

### Option 3: Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
limitless-deploy/
├── index.html          # Entry HTML
├── package.json        # Dependencies
├── vite.config.js      # Vite bundler config
├── tailwind.config.js  # Tailwind CSS config
├── postcss.config.js   # PostCSS config
└── src/
    ├── main.jsx        # React entry point
    ├── App.jsx         # Main trading bot component
    └── index.css       # Tailwind styles
```

## ⚙️ Configuration

### Switch to Live Mode

In `src/App.jsx`, change:
```javascript
const [demoMode, setDemoMode] = useState(false);  // false for live
```

### Bot Settings (Defaults)

| Setting | Default | Description |
|---------|---------|-------------|
| Max Pair Cost | $0.98 | Maximum YES + NO combined price |
| Profit Target | $50 | Auto-stop when reached |
| Shares/Trade | 10 | Shares to buy per opportunity |
| Check Interval | 3s | How often to scan markets |
| Max YES Price | $0.52 | Only buy YES below this |
| Max NO Price | $0.52 | Only buy NO below this |

## 🎯 Strategy Explained

The arbitrage strategy works because:

1. **YES + NO always = $1** at market resolution
2. If you buy YES at $0.48 and NO at $0.48
3. Total cost = $0.96
4. One WILL pay $1.00 → **Guaranteed $0.04 profit**

The bot scans for markets where:
- YES price < $0.52
- NO price < $0.52  
- Combined pair cost < $0.98

## 🔗 API Integration

The Limitless Exchange API uses EIP-712 typed data signing:

```javascript
// Authentication
POST /auth
Body: { signature, timestamp, address }

// Get markets
GET /markets?status=active&type=hourly

// Place order
POST /orders
Body: { order, signature }
```

Full API docs: `https://api.limitless.exchange/api-v1`

## 🎁 Season 2 Airdrop

- **Ends**: January 26, 2026
- **Min Volume**: $200 to qualify
- **Points**: Earned per trade volume
- **Quality Bonus**: Higher for winning predictions

## ⚠️ Disclaimer

- This is for educational purposes
- Trading involves risk of loss
- Test in demo mode first
- Never invest more than you can afford to lose
- DYOR (Do Your Own Research)

## 📜 License

MIT License - Use at your own risk.
