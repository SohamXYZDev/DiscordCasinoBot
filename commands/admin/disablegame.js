const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please specify a game to disable. Usage: `.disablegame <game>`\nValid games: coinflip, rps, hilo, roulette, blackjack, baccarat, mines, dragontower');
    }
    
    const game = args[0].toLowerCase();
    const guildId = message.guildId;
    const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
    if (!config.disabledGames) config.disabledGames = [];
    
    // List of valid games
    const validGames = [
      "coinflip", "rps", "hilo", "roulette", "blackjack", "baccarat", "mines", "dragontower"
    ];
    
    if (!validGames.includes(game)) {
      return message.reply(`❌ ${game} is not a valid game command.\nValid games: ${validGames.join(', ')}`);
    }
    
    if (config.disabledGames.includes(game)) {
      return message.reply(`❌ The game ${game} is already disabled.`);
    }
    
    config.disabledGames.push(game);
    await config.save();
    await message.reply(`✅ Disabled the game ${game} for this server.`);
  },
};
