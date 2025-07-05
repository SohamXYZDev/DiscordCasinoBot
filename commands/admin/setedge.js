const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please specify a house edge percentage. Usage: `.setedge <percentage>` (0-50)');
    }
    
    const edge = parseFloat(args[0]);
    const guildId = message.guildId;
    
    if (!guildId) {
      return message.reply("❌ This command can only be used in a server.");
    }
    
    if (isNaN(edge) || edge < 0 || edge > 50) {
      return message.reply('❌ Please provide a valid house edge between 0 and 50 percent. Usage: `.setedge <percentage>`');
    }
    
    let config = await GuildConfig.findOne({ guildId });
    if (!config) config = new GuildConfig({ guildId });
    config.houseEdge = edge;
    await config.save();
    await message.reply(`✅ Set house edge to ${edge}% for all games on this server.`);
  },
};
