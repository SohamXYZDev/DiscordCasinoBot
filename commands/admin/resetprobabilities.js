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
    config.probabilities = {
      "coinflip": 50,     // Perfect 50/50
      "hilo": 50,         // Perfect 50/50 for higher/lower
      "mines": 50,        // 50% chance first click is safe (balanced)
      "rps": 33           // Rock Paper Scissors: 1/3 chance
    };
    await config.save();
    return interaction.reply({ content: `✅ Probabilities reset to natural odds for games that support it (coinflip, hilo, mines, rps).`, ephemeral: true });
  },
};
