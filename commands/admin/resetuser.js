const User = require("../../models/User");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please mention a user to reset. Usage: `.resetuser @user`');
    }
    
    const userMention = args[0];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    if (!userId || isNaN(userId)) {
      return message.reply('❌ Please provide a valid user mention. Usage: `.resetuser @user`');
    }
    
    try {
      const user = await message.client.users.fetch(userId);
      await User.findOneAndUpdate(
        { userId: user.id },
        { $set: { balance: 1000, lastDaily: null, lastCoinflip: null, banned: false } },
        { new: true, upsert: true }
      );
      await message.reply(`✅ Reset <@${user.id}>'s balance and stats.`);
    } catch (error) {
      await message.reply('❌ Could not find that user.');
    }
  },
};
