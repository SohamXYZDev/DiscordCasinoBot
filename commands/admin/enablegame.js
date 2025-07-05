const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please specify a game to enable. Usage: `.enablegame <game>`\nValid games: coinflip, rps, hilo, roulette, blackjack, baccarat, mines, dragontower');
    }
    
    const game = args[0].toLowerCase();
    const guildId = message.guildId;
    const config = await GuildConfig.findOne({ guildId });
    
    // List of valid games
    const validGames = [
      "coinflip", "rps", "hilo", "roulette", "blackjack", "baccarat", "mines", "dragontower"
    ];
    
    if (!validGames.includes(game)) {
      return message.reply(`❌ ${game} is not a valid game command.\nValid games: ${validGames.join(', ')}`);
    }
    
    if (!config || !config.disabledGames || !config.disabledGames.includes(game)) {
      return message.reply(`❌ The game ${game} is not disabled.`);
    }
    
    config.disabledGames = config.disabledGames.filter(g => g !== game);
    await config.save();
    await message.reply(`✅ Enabled the game ${game} for this server.`);
  },
};
