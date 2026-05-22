// js/firebase-config.js
// ─── REPLACE THESE WITH YOUR ACTUAL FIREBASE PROJECT VALUES ────────────────────
const firebaseConfig = {

  apiKey: "AIzaSyCI3HIINwfMCUlIIrl6cKb_ovmarHhA_Is",

  authDomain: "simpleai-firebase.firebaseapp.com",

  projectId: "simpleai-firebase",

  storageBucket: "simpleai-firebase.firebasestorage.app",

  messagingSenderId: "533498949517",

  appId: "1:533498949517:web:75bd5f7b0db29eb6fe97c4"

};



// ─── DENO BACKEND URL (your Deno Deploy URL) ───────────────────────────────────
const DENO_API_URL = "https://simpleai-api.simplifiedtest10.deno.net/";

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
