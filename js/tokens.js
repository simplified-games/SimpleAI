// js/tokens.js
import { TOKEN_CONFIG, ADMIN_EMAIL } from "./firebase-config.js";

let db, currentUser;

export function initTokens(firestore, user) {
  db = firestore;
  currentUser = user;
}

export async function getTokenData() {
  if (!db || !currentUser) return null;
  const snap = await db.collection("users").doc(currentUser.uid).get();
  if (!snap.exists) return null;
  return snap.data();
}

export async function ensureUserDoc() {
  if (!db || !currentUser) return;
  const ref = db.collection("users").doc(currentUser.uid);
  const snap = await ref.get();
  const now = Date.now();

  if (!snap.exists) {
    const isAdmin = currentUser.email === ADMIN_EMAIL;
    await ref.set({
      email: currentUser.email,
      displayName: currentUser.displayName ?? "",
      photoURL: currentUser.photoURL ?? "",
      isAdmin,
      tokenBalance: isAdmin ? Infinity : TOKEN_CONFIG.baseAllowance,
      tokenResetTime: now + TOKEN_CONFIG.resetIntervalMs,
      totalUsed: 0,
      createdAt: now,
    });
  } else {
    // Auto-reset if window has expired
    const data = snap.data();
    if (!data.isAdmin && Date.now() > (data.tokenResetTime ?? 0)) {
      await ref.update({
        tokenBalance: TOKEN_CONFIG.baseAllowance,
        tokenResetTime: Date.now() + TOKEN_CONFIG.resetIntervalMs,
      });
    }
  }
}

export async function checkAndDeductTokens(cost) {
  if (!db || !currentUser) return { ok: false, reason: "Not logged in" };
  const ref = db.collection("users").doc(currentUser.uid);
  const snap = await ref.get();
  const data = snap.data();

  if (data.isAdmin) return { ok: true, newBalance: Infinity };

  // Auto-reset check
  if (Date.now() > (data.tokenResetTime ?? 0)) {
    await ref.update({
      tokenBalance: TOKEN_CONFIG.baseAllowance - cost,
      tokenResetTime: Date.now() + TOKEN_CONFIG.resetIntervalMs,
      totalUsed: (data.totalUsed ?? 0) + cost,
    });
    return { ok: true, newBalance: TOKEN_CONFIG.baseAllowance - cost };
  }

  if (data.tokenBalance < cost) {
    return { ok: false, reason: "Insufficient tokens", balance: data.tokenBalance };
  }

  const newBalance = data.tokenBalance - cost;
  await ref.update({
    tokenBalance: newBalance,
    totalUsed: (data.totalUsed ?? 0) + cost,
  });
  return { ok: true, newBalance };
}

export async function getTimeUntilReset() {
  const data = await getTokenData();
  if (!data || data.isAdmin) return 0;
  return Math.max(0, (data.tokenResetTime ?? 0) - Date.now());
}

export function formatResetTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export function calculateCost(tokensUsed, model, reasoning) {
  const base = Math.ceil((tokensUsed * model.costPerKTokens) / 1000) || 1;
  return reasoning ? Math.ceil(base * TOKEN_CONFIG.reasoningMult) : base;
}

// ─── ADMIN FUNCTIONS ──────────────────────────────────────────────────────────
export async function adminGrantTokens(targetEmail, amount) {
  if (!db || !currentUser) return { ok: false };
  const callerSnap = await db.collection("users").doc(currentUser.uid).get();
  if (!callerSnap.data()?.isAdmin) return { ok: false, reason: "Not admin" };

  // Find user by email
  const usersSnap = await db.collection("users").where("email", "==", targetEmail).get();
  if (usersSnap.empty) return { ok: false, reason: "User not found" };

  const userDoc = usersSnap.docs[0];
  const current = userDoc.data().tokenBalance ?? 0;
  await userDoc.ref.update({ tokenBalance: current + amount });

  // Log grant
  await db.collection("adminGrants").add({
    targetEmail,
    amount,
    grantedBy: currentUser.email,
    timestamp: Date.now(),
  });

  return { ok: true };
}

export async function adminGetAllUsers() {
  if (!db || !currentUser) return [];
  const callerSnap = await db.collection("users").doc(currentUser.uid).get();
  if (!callerSnap.data()?.isAdmin) return [];
  const snap = await db.collection("users").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
