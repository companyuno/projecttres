# PM2 Setup Guide

PM2 is a process manager for Node.js applications that keeps your server running in the background and automatically restarts it if it crashes.

## Installation

```bash
npm install -g pm2
```

## Starting the Server with PM2

```bash
# Start the server
pm2 start ecosystem.config.js

# Or start directly
pm2 start server.js --name vwap-tracker
```

## PM2 Commands

```bash
# View running processes
pm2 list

# View logs
pm2 logs vwap-tracker

# Stop the server
pm2 stop vwap-tracker

# Restart the server
pm2 restart vwap-tracker

# Delete the process from PM2
pm2 delete vwap-tracker

# Save current process list (for auto-start on reboot)
pm2 save

# Setup PM2 to start on system boot (macOS/Linux)
pm2 startup
# Follow the instructions it gives you
```

## Auto-Start on Reboot

1. Start your server: `pm2 start ecosystem.config.js`
2. Save the process list: `pm2 save`
3. Setup startup script: `pm2 startup`
4. Follow the instructions it prints

## Monitoring

```bash
# Real-time monitoring
pm2 monit

# View detailed info
pm2 show vwap-tracker
```

## Notes

- The server will keep running even if you close your terminal
- If your computer sleeps/shuts down, PM2 will stop (normal behavior)
- After rebooting, PM2 will auto-start if you've run `pm2 save` and `pm2 startup`
- Use the dashboard restart button for soft restarts without stopping PM2
- Use `pm2 restart vwap-tracker` for full PM2 restarts

