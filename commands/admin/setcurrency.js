const { SlashCommandBuilder } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setcurrency")
    .setDescription("Set a custom currency symbol for this server.")
    .addStringOption(option =>
      option.setName("currency").setDescription("Currency symbol or name").setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const currency = interaction.options.getString("currency");
    const guildId = interaction.guildId;
    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: { currency } },
      { new: true, upsert: true }
    );
    await interaction.reply({ content: `✅ Set this server's currency to ${currency}.` });
  },
};
