// utils/cooldown.js
const cooldowns = new Map();

function checkCooldown(userId, command, seconds) {
  const now = Date.now();
  if (!cooldowns.has(command)) cooldowns.set(command, new Map());
  const timestamps = cooldowns.get(command);
  const cooldownAmount = seconds * 1000;

  if (timestamps.has(userId)) {
    const expiration = timestamps.get(userId) + cooldownAmount;
    if (now < expiration) {
      return Math.ceil((expiration - now) / 1000);
    }
  }
  timestamps.set(userId, now);
  return 0;
}

module.exports = { checkCooldown };
