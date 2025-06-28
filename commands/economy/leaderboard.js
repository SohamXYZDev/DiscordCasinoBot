const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top users by balance."),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const guild = interaction.guild;
      if (!guild) {
        return interaction.editReply({ content: "This command can only be used in a server." });
      }
      // Find top users in DB who are not banned
      const allTop = await User.find({ banned: { $ne: true } })
        .sort({ balance: -1 });
      // Filter to users who are currently in the server
      const memberIds = new Set(guild.members.cache.map(m => m.user.id));
      const top = allTop.filter(u => memberIds.has(u.userId)).slice(0, 10);
      // Fetch server currency
      const GuildConfig = require("../../models/GuildConfig");
      let currency = "coins";
      const config = await GuildConfig.findOne({ guildId: guild.id });
      if (config && config.currency) currency = config.currency;
      const embed = new EmbedBuilder()
        .setTitle("🏆 Leaderboard")
        .setColor(0x41fb2e)
        .setDescription(
          top.length
            ? top
                .map((u, i) => `**${i + 1}.** <@${u.userId}> — ${u.balance} ${currency}`)
                .join("\n")
            : "No users found."
        );
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: "An unexpected error occurred while generating the leaderboard." });
    }
  },
};
