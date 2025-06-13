const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setedge")
    .setDescription("Set the house edge (as a percent, e.g. 5 for 5%) for all games on this server.")
    .addNumberOption(option =>
      option.setName("edge")
        .setDescription("House edge percent (e.g. 5 for 5%)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(50)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const edge = interaction.options.getNumber("edge");
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    }
    let config = await GuildConfig.findOne({ guildId });
    if (!config) config = new GuildConfig({ guildId });
    config.houseEdge = edge;
    await config.save();
    await interaction.reply({ content: `✅ Set house edge to ${edge}% for all games on this server.`, ephemeral: true });
  },
};
