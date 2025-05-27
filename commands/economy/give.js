const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give currency to another user from your own balance.")
    .addUserOption(option =>
      option.setName("user").setDescription("User to give to").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("Amount to give").setRequired(true)
    ),
  async execute(interaction) {
    const giverId = interaction.user.id;
    const receiver = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    if (receiver.id === giverId) {
      return interaction.reply({ content: "❌ You can't give currency to yourself!", ephemeral: true });
    }
    if (amount <= 0) {
      return interaction.reply({ content: "❌ Amount must be greater than 0.", ephemeral: true });
    }
    let giver = await User.findOne({ userId: giverId });
    if (!giver || giver.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough balance to give.", ephemeral: true });
    }
    if (giver.banned) {
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }
    let receiverUser = await User.findOne({ userId: receiver.id });
    if (!receiverUser) {
      receiverUser = await User.create({ userId: receiver.id });
    }
    if (receiverUser.banned) {
      return interaction.reply({ content: "🚫 That user is banned from economy commands.", ephemeral: true });
    }
    // Fetch server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    giver.balance -= amount;
    receiverUser.balance += amount;
    await giver.save();
    await receiverUser.save();
    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("💸 Transfer Complete")
      .setDescription(`You gave **${amount} ${currency}** to <@${receiver.id}>!\nYour new balance: **${giver.balance} ${currency}**`)
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.reply({ embeds: [embed] });
  },
};
