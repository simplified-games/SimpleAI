// js/firebase-config.js
// ─── REPLACE THESE WITH YOUR ACTUAL FIREBASE PROJECT VALUES ────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

// ─── DENO BACKEND URL (your Deno Deploy URL) ───────────────────────────────────
const DENO_API_URL = "https://YOUR_PROJECT.deno.dev";

// ─── ADMIN EMAIL ───────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "alex@hbig.com.au";

// ─── TOKEN CONFIG ──────────────────────────────────────────────────────────────
const TOKEN_CONFIG = {
  baseAllowance:    75000,   // tokens per window
  resetIntervalMs:  3 * 60 * 60 * 1000, // 3 hours
  imageGenCost:     1000,    // flat per image
  reasoningMult:    1.5,     // multiplier for thinking models
};

export { FIREBASE_CONFIG, DENO_API_URL, ADMIN_EMAIL, TOKEN_CONFIG };
