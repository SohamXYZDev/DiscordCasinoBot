const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  async executePrefix(message, args) {
    if (args.length === 0) {
      return message.reply('❌ Please mention a channel for logs. Usage: `.setlogs #channel`');
    }
    
    const channelMention = args[0];
    const channelId = channelMention.replace(/[<#>]/g, '');
    
    if (!channelId || isNaN(channelId)) {
      return message.reply('❌ Please provide a valid channel mention. Usage: `.setlogs #channel`');
    }
    
    try {
      const channel = await message.guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return message.reply('❌ Please provide a valid text channel.');
      }
      
      const guildId = message.guildId;
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { logChannel: channel.id } },
        { new: true, upsert: true }
      );
      
      await message.reply(`✅ Set <#${channel.id}> as the log channel for command usage.`);
    } catch (error) {
      await message.reply('❌ Could not find that channel.');
    }
  },
};
