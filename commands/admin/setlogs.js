const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlogs")
    .setDescription("Set the log channel for command usage logs.")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to log commands in.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId;
    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: { logChannel: channel.id } },
      { new: true, upsert: true }
    );
    await interaction.reply({ content: `✅ Set <#${channel.id}> as the log channel for command usage.`, ephemeral: true });
  },
};
