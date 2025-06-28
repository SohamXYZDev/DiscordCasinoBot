const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");

// List of supported games for probability adjustment
const SUPPORTED_GAMES = [
  "baccarat",
  "blackjack",
  "coinflip",
  "dragontower",
  "hilo",
  "mines",
  "roulette",
  "rps"
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setprobability")
    .setDescription("Set the win probability for a game (admin only)")
    .addStringOption(option =>
      option.setName("game")
        .setDescription("Select the game to adjust")
        .setRequired(true)
        .addChoices(
          ...SUPPORTED_GAMES.map(g => ({ name: g.charAt(0).toUpperCase() + g.slice(1), value: g }))
        )
    )
    .addIntegerOption(option =>
      option.setName("probability")
        .setDescription("Set the win probability (0-100, as a percent)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const game = interaction.options.getString("game");
    const probability = interaction.options.getInteger("probability");
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }
    // Update or create config
    let config = await GuildConfig.findOne({ guildId });
    if (!config) {
      config = new GuildConfig({ guildId });
    }
    if (!config.probabilities) config.probabilities = {};
    config.probabilities[game] = probability;
    await config.save();
    return interaction.reply({ content: `✅ Probability for **${game}** set to **${probability}%**.`, ephemeral: true });
  },
};
