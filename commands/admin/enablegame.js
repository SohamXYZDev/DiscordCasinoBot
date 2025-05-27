const { SlashCommandBuilder } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("enablegame")
    .setDescription("Enable a previously disabled game for this server.")
    .addStringOption(option =>
      option.setName("game")
        .setDescription("Game command to enable (e.g. coinflip, mines, dragontower, etc.)")
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const game = interaction.options.getString("game").toLowerCase();
    const guildId = interaction.guildId;
    const config = await GuildConfig.findOne({ guildId });
    // List of valid games
    const validGames = [
      "coinflip", "rps", "hilo", "roulette", "blackjack", "baccarat", "mines", "dragontower"
    ];
    if (!validGames.includes(game)) {
      return interaction.reply({ content: `❌ ${game} is not a valid game command.`, ephemeral: true });
    }
    if (!config || !config.disabledGames || !config.disabledGames.includes(game)) {
      return interaction.reply({ content: `❌ The game ${game} is not disabled.`, ephemeral: true });
    }
    config.disabledGames = config.disabledGames.filter(g => g !== game);
    await config.save();
    await interaction.reply({ content: `✅ Enabled the game ${game} for this server.` });
  },
};
