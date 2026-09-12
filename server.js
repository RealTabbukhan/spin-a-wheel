const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ─────────────────────────────────────── */

app.use(compression());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Prevent browser from caching pages in development so deletions reflect immediately
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    etag: false,
  })
);

/* ── View Engine ───────────────────────────────────── */

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ── Routes ────────────────────────────────────────── */

app.get('/', (_req, res) => {
  res.render('index', {
    title: 'Spin a Wheel — Free Random Name Picker & Spinner',
    description:
      'Free online spin the wheel tool. Pick random names, make decisions, run raffles and classroom activities.',
    keywords:
      'spin the wheel, random name picker, wheel spinner, picker wheel, random wheel, decision maker',
  });
});

/* ── 404 Not Found ─────────────────────────────────── */

app.use((_req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#0a0e27;color:#fff;"><h1>404 — Page Not Found</h1><p style="color:#94a3b8;">This page has been removed or does not exist.</p><p style="margin-top:24px;"><a href="/" style="color:#38bdf8;text-decoration:none;font-weight:600;">← Back to Wheel</a></p></body></html>');
});

/* ── Start ─────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`✨ Spin the Wheel server running → http://localhost:${PORT}`);
});
