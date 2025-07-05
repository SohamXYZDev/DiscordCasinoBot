const GuildConfig = require("../../models/GuildConfig");

// List of supported games for probability adjustment
const SUPPORTED_GAMES = [
  "baccarat",
  "blackjack",
  "coinflip",
  "dragontower",
  "hilo",
  "mines",
  "roulette",
  "rps"
];

module.exports = {
  async executePrefix(message, args) {
    if (args.length < 2) {
      return message.reply(`❌ Please specify a game and probability. Usage: \`.setprobability <game> <probability>\`\nSupported games: ${SUPPORTED_GAMES.join(', ')}`);
    }
    
    const game = args[0].toLowerCase();
    const probability = parseInt(args[1]);
    const guildId = message.guildId;
    
    if (!guildId) {
      return message.reply("This command can only be used in a server.");
    }
    
    if (!SUPPORTED_GAMES.includes(game)) {
      return message.reply(`❌ **${game}** is not a supported game.\nSupported games: ${SUPPORTED_GAMES.join(', ')}`);
    }
    
    if (isNaN(probability) || probability < 0 || probability > 100) {
      return message.reply('❌ Please provide a valid probability between 0 and 100 percent.');
    }
    
    // Update or create config
    let config = await GuildConfig.findOne({ guildId });
    if (!config) {
      config = new GuildConfig({ guildId });
    }
    if (!config.probabilities) config.probabilities = {};
    config.probabilities[game] = probability;
    await config.save();
    return message.reply(`✅ Probability for **${game}** set to **${probability}%**.`);
  },
};
