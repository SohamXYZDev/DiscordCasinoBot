const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetprobabilities")
    .setDescription("Reset all modified win probabilities for all games (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }
    let config = await GuildConfig.findOne({ guildId });
    if (!config) {
      return interaction.reply({ content: "No server config found. Nothing to reset.", ephemeral: true });
    }
    config.probabilities = {};
    await config.save();
    return interaction.reply({ content: `✅ All game win probabilities have been reset to default.`, ephemeral: true });
  },
};
