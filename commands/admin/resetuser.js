const { SlashCommandBuilder } = require("discord.js");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetuser")
    .setDescription("Reset a user's balance and stats.")
    .addUserOption(option =>
      option.setName("user").setDescription("User to reset").setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const user = interaction.options.getUser("user");
    await User.findOneAndUpdate(
      { userId: user.id },
      { $set: { balance: 1000, lastDaily: null, lastCoinflip: null, banned: false } },
      { new: true, upsert: true }
    );
    await interaction.reply({ content: `✅ Reset <@${user.id}>'s balance and stats.` });
  },
};
