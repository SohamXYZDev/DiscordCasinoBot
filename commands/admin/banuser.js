const User = require("../../models/User");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please mention a user to ban. Usage: `.banuser @user`');
    }
    
    const userMention = args[0];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    if (!userId || isNaN(userId)) {
      return message.reply('❌ Please provide a valid user mention. Usage: `.banuser @user`');
    }
    
    try {
      const user = await message.client.users.fetch(userId);
      await User.findOneAndUpdate(
        { userId: user.id },
        { $set: { banned: true } },
        { new: true, upsert: true }
      );
      await message.reply(`✅ Banned <@${user.id}> from economy commands.`);
    } catch (error) {
      await message.reply('❌ Could not find that user.');
    }
  },
};
