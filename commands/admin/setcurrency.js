const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please specify a currency name. Usage: `.setcurrency <currency>`');
    }
    
    const currency = args.join(' '); // Allow multi-word currency names
    const guildId = message.guildId;
    
    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: { currency } },
      { new: true, upsert: true }
    );
    
    await message.reply(`✅ Set this server's currency to ${currency}.`);
  },
};
