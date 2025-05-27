const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("xpleaderboard")
    .setDescription("Show the top users by XP/level in this server."),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }
    // Get all user IDs in the guild
    const memberIds = new Set(guild.members.cache.map(m => m.user.id));
    // Find users in DB who are in this guild
    const allTop = await User.find({ userId: { $in: Array.from(memberIds) } })
      .sort({ level: -1, xp: -1 })
      .limit(10);
    const embed = new EmbedBuilder()
      .setTitle("🏅 XP Leaderboard")
      .setColor(0x7289da)
      .setDescription(
        allTop.length
          ? allTop
              .map((u, i) => `**${i + 1}.** <@${u.userId}> — Level ${u.level} | XP: ${u.xp}`)
              .join("\n")
          : "No users found."
      );
    await interaction.reply({ embeds: [embed] });
  },
};
