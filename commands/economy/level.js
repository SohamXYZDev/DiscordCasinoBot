const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("View your current level and XP."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) {
      return interaction.reply({ content: "You have no level or XP yet! Play some games first.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle("🏅 Your Level & XP")
      .setColor(0xfad02e)
      .setDescription(`Level: **${user.level}**\nXP: **${user.xp} / ${user.level * 100}**`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
