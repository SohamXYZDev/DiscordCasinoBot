const User = require("../../models/User");

module.exports = {
  async executePrefix(message, args) {
    if (args.length < 2) {
      return message.reply('❌ Please specify a user and amount. Usage: `.setbalance @user <amount>`');
    }
    
    const userMention = args[0];
    const userId = userMention.replace(/[<@!>]/g, '');
    const amount = parseFloat(args[1]);
    
    if (!userId || isNaN(userId)) {
      return message.reply('❌ Please provide a valid user mention. Usage: `.setbalance @user <amount>`');
    }
    
    if (isNaN(amount) || amount < 0) {
      return message.reply('❌ Please provide a valid non-negative amount. Usage: `.setbalance @user <amount>`');
    }
    
    try {
      const user = await message.client.users.fetch(userId);
      const dbUser = await User.findOneAndUpdate(
        { userId: user.id },
        { $set: { balance: Math.round(amount * 100) / 100 } },
        { new: true, upsert: true }
      );
      await message.reply(`✅ Set <@${user.id}>'s balance to ${dbUser.balance.toFixed(2)}.`);
    } catch (error) {
      await message.reply('❌ Could not find that user.');
    }
  },
};
