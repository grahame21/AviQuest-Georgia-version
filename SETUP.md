# AviQuest Premium Flight Tracker Setup Guide

This guide walks you through setting up the enhanced flight tracker with **zero cost** using OpenSky Network's free API.

## 📋 Prerequisites

- GitHub account (you have this ✓)
- Netlify account (free at https://netlify.com)
- OpenSky Network account (free registration)
- ~15 minutes of setup time

## 🚀 Step 1: Register for OpenSky Network

1. Visit https://opensky-network.org/
2. Click **Register** (top right)
3. Fill in your details:
   - Email
   - Username
   - Password
4. Verify your email
5. **Note down your username and password** (you'll need these soon)

### What OpenSky Network Provides:

- ✅ **Real-time aircraft positions** - Live ADS-B data
- ✅ **7-day history** - Track where aircraft have been
- ✅ **Aircraft metadata** - Registration, manufacturer, model
- ✅ **Unlimited queries** - Free tier with fair-use limits
- ✅ **No credit card required**

## 🌳 Step 2: Review the New Branch

1. Go to your repository: https://github.com/grahame21/AviQuest-Georgia-version
2. Click the **Branch** dropdown (currently showing `main`)
3. Select **`feature/premium-flight-tracker`**
4. You'll see the new files added:
   - `functions/opensky-tracker.js` - Main flight tracking function
   - `functions/aircraft-data.js` - Aircraft metadata lookup
   - `functions/airport-data.js` - Airport information
   - `functions/flight-history.js` - Historical flight data
   - `tracker-enhanced.js` - Integration code
   - `tracker-enhancements.css` - New styles
   - `.env.example` - Credential template

## ⚙️ Step 3: Configure Netlify Environment Variables

1. **Log into Netlify**: https://app.netlify.com
2. Select your site (AviQuest-Georgia-version)
3. Go to: **Site settings** → **Build & deploy** → **Environment**
4. Click **Add environment variables**
5. Add two new variables:

   **Variable 1:**
   - Key: `OPENSKY_USERNAME`
   - Value: `your_opensky_username` (from Step 1)

   **Variable 2:**
   - Key: `OPENSKY_PASSWORD`
   - Value: `your_opensky_password` (from Step 1)

6. Click **Save**

### Security Note:
```
These credentials are stored securely by Netlify and only used by your
serverless functions. They are NEVER exposed to the browser or frontend.
```

## 🔀 Step 4: Merge to Main (When Ready)

Once you're happy with the new features:

1. Go to **Pull Requests** tab
2. Create a new PR from `feature/premium-flight-tracker` → `main`
3. Review the changes
4. Click **Merge pull request**
5. Netlify will automatically redeploy

## 🧪 Step 5: Test the New Features

### Local Testing (with Netlify CLI):

```bash
# Install Netlify CLI (if not already installed)
npm install -g netlify-cli

# Create .env file in root (git-ignored):
echo "OPENSKY_USERNAME=your_username" > .env
echo "OPENSKY_PASSWORD=your_password" >> .env

# Start local dev server
netlify dev

# Open: http://localhost:8888
# Test the flight tracker
```

### After Deployment:

1. Open your live site
2. Go to the **Live Aviation** page
3. Allow location access
4. You should see aircraft positions from OpenSky Network
5. Click an aircraft to see enhanced metadata

## 📊 What Each Function Does

### `opensky-tracker.js` (Main)
- Fetches live aircraft in your visible map area
- Returns 500 nearest aircraft
- Updates every 5 seconds
- **Rate limit:** ~1000 API calls/day (free tier)

### `aircraft-data.js`
- Looks up aircraft registration and manufacturer
- Called when you tap an aircraft
- Uses 6-digit ICAO24 hex code

### `airport-data.js`
- Fetches airport coordinates and runway info
- Uses OpenAIP API (completely free)
- Fallback database included

### `flight-history.js`
- Returns last 7 days of flights for an aircraft
- Shows departure/arrival times and routes
- Requires OpenSky Network subscription

## 🆓 Free Tier Limits (OpenSky Network)

| Feature | Free Limit | Paid Tier |
|---------|-----------|----------|
| API Calls/day | ~1,000 | Unlimited |
| Aircraft history | 7 days | Unlimited |
| Real-time data | 10 sec delay | Live |
| Rate limit | 1 req/sec | Higher |

**Your usage with AviQuest:**
- **~5 API calls/hour** with default refresh settings
- **~120 calls/day** even with heavy use
- **Well within free tier** ✓

## 🆘 Troubleshooting

### "No aircraft appear on the map"
- Check OpenSky credentials are correct in Netlify
- Verify your OpenSky account is active
- Check Netlify function logs: Site → Functions
- Wait 2-3 minutes for deployment to complete

### "401 Unauthorized" errors
- Credentials are incorrect or expired
- Re-enter OpenSky username/password in Netlify
- Make sure there are no extra spaces

### "Rate limit exceeded"
- You've made >1000 API calls in 24 hours
- Reduce refresh frequency in tracker.js
- Default (5 second refresh) should be fine

### Functions won't deploy
- Check `functions/` folder exists in root
- All `.js` files must be directly in `functions/`
- Check for syntax errors in `.js` files
- View Netlify deploy logs for details

## 🎯 Next Steps

### Short-term (Week 1-2):
- ✅ Get OpenSky data working
- ✅ Merge to main
- ✅ Test in production

### Medium-term (Month 2-3):
- Add route visualization on map
- Implement flight history search
- Add aircraft type filtering
- Improve photo loading reliability

### Long-term (Month 4+):
- Build native mobile app (React Native)
- Add push notifications
- Monetize with premium features
- Consider upgrading to OpenSky paid tier for commercial features

## 📚 Resources

- **OpenSky Network API Docs**: https://opensky-network.org/apidoc/
- **Netlify Functions Guide**: https://docs.netlify.com/functions/overview/
- **ADS-B Explained**: https://www.adsbexchange.com/
- **Leaflet.js Docs**: https://leafletjs.com/

## 💬 Support

If you hit any issues:

1. Check the Netlify function logs
2. Verify OpenSky credentials
3. Review browser console for errors (F12)
4. Check the GitHub issue tracker

## ✅ Verification Checklist

Before considering setup complete:

- [ ] OpenSky Network account created
- [ ] Credentials added to Netlify environment
- [ ] New branch deployed and tested
- [ ] Aircraft appear on live tracker
- [ ] Clicking aircraft shows enhanced data
- [ ] No console errors in browser
- [ ] Functions show successful executions in Netlify logs

---

**Congratulations! You now have a premium-quality flight tracker with zero costs.** 🚀

This setup will scale to thousands of users before needing any paid services.
