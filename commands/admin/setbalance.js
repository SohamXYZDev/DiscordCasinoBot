const { SlashCommandBuilder } = require("discord.js");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setbalance")
    .setDescription("Set a user's balance.")
    .addUserOption(option =>
      option.setName("user").setDescription("User to set").setRequired(true)
    )
    .addNumberOption(option =>
      option.setName("amount").setDescription("New balance").setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has("Administrator")) {
      return interaction.reply({ content: "❌ You need Administrator permission.", ephemeral: true });
    }
    const user = interaction.options.getUser("user");
    const amount = interaction.options.getNumber("amount");
    if (amount < 0) {
      return interaction.reply({ content: "❌ Balance cannot be negative.", ephemeral: true });
    }
    const dbUser = await User.findOneAndUpdate(
      { userId: user.id },
      { $set: { balance: Math.round(amount * 100) / 100 } },
      { new: true, upsert: true }
    );
    await interaction.reply({ content: `✅ Set <@${user.id}>'s balance to ${dbUser.balance.toFixed(2)}.` });
  },
};
