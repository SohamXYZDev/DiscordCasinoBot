const { SlashCommandBuilder } = require("discord.js");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banuser")
    .setDescription("Ban a user from economy commands.")
    .addUserOption(option =>
      option.setName("user").setDescription("User to ban").setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const user = interaction.options.getUser("user");
    await User.findOneAndUpdate(
      { userId: user.id },
      { $set: { banned: true } },
      { new: true, upsert: true }
    );
    await interaction.reply({ content: `✅ Banned <@${user.id}> from economy commands.` });
  },
};
