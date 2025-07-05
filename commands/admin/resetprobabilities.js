const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  async executePrefix(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      return message.reply("This command can only be used in a server.");
    }
    
    let config = await GuildConfig.findOne({ guildId });
    if (!config) {
      return message.reply("No server config found. Nothing to reset.");
    }
    
    config.probabilities = {
      "coinflip": 50,     // Perfect 50/50
      "hilo": 50,         // Perfect 50/50 for higher/lower
      "mines": 50,        // 50% chance first click is safe (balanced)
      "rps": 33           // Rock Paper Scissors: 1/3 chance
    };
    await config.save();
    return message.reply(`✅ Probabilities reset to natural odds for games that support it (coinflip, hilo, mines, rps).`);
  },
};
