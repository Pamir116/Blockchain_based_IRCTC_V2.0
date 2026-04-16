const express = require("express");
const router  = express.Router();

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

// key: "train|coach|seat|dateKey"  value: { wallet, expiresAt, lockId }
const locks = new Map();

function lockKey(train, coach, seat, dateKey) {
  return `${train}|${coach}|${seat}|${dateKey}`;
}

function isExpired(lock) {
  return Date.now() > lock.expiresAt;
}

// Clean up expired locks periodically
setInterval(() => {
  for (const [k, v] of locks) {
    if (isExpired(v)) locks.delete(k);
  }
}, 30000);

// POST /api/seatlock/lock
// Body: { train, coach, seat, dateKey, wallet }
// Returns: { ok, lockId, expiresAt } or { ok:false, heldBy, remainingSecs }
router.post("/lock", (req, res) => {
  const { train, coach, seat, dateKey, wallet } = req.body;
  if (!train || !coach || seat == null || !dateKey || !wallet)
    return res.status(400).json({ ok: false, error: "Missing fields" });

  const k    = lockKey(train, coach, seat, dateKey);
  const held = locks.get(k);

  if (held && !isExpired(held)) {
    if (held.wallet.toLowerCase() === wallet.toLowerCase()) {
      // Same wallet re-locking — refresh timer
      held.expiresAt = Date.now() + LOCK_TTL_MS;
      return res.json({ ok: true, lockId: held.lockId, expiresAt: held.expiresAt, refreshed: true });
    }
    const remaining = Math.ceil((held.expiresAt - Date.now()) / 1000);
    return res.json({ ok: false, heldBy: held.wallet.slice(0, 10) + "...", remainingSecs: remaining });
  }

  const lockId    = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + LOCK_TTL_MS;
  locks.set(k, { wallet: wallet.toLowerCase(), lockId, expiresAt });

  console.log(`[SeatLock] 🔒 ${train}/${coach}/seat${seat} locked by ${wallet.slice(0, 10)}... for 5 min`);
  res.json({ ok: true, lockId, expiresAt });
});

// DELETE /api/seatlock/unlock
// Body: { train, coach, seat, dateKey, wallet }
router.delete("/unlock", (req, res) => {
  const { train, coach, seat, dateKey, wallet } = req.body;
  const k    = lockKey(train, coach, seat, dateKey);
  const held = locks.get(k);

  if (held && held.wallet === wallet?.toLowerCase()) {
    locks.delete(k);
    console.log(`[SeatLock] 🔓 ${train}/${coach}/seat${seat} released by ${wallet.slice(0, 10)}...`);
    return res.json({ ok: true });
  }
  res.json({ ok: false, error: "Lock not found or not owned by this wallet" });
});

// GET /api/seatlock/status/:train/:coach/:seat/:dateKey
router.get("/status/:train/:coach/:seat/:dateKey", (req, res) => {
  const { train, coach, seat, dateKey } = req.params;
  const k    = lockKey(train, coach, seat, dateKey);
  const held = locks.get(k);

  if (!held || isExpired(held)) {
    locks.delete(k);
    return res.json({ locked: false });
  }
  res.json({
    locked: true,
    heldBy: held.wallet.slice(0, 10) + "...",
    remainingSecs: Math.ceil((held.expiresAt - Date.now()) / 1000),
  });
});

module.exports = router;
