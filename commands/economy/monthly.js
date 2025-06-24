const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const connectDB = require("../../config/db");
const GuildConfig = require("../../models/GuildConfig");

const MONTHLY_REWARD = 5;
const COOLDOWN_DAYS = 30;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("monthly")
    .setDescription("Claim your monthly coins."),
  async execute(interaction) {
    await connectDB();
    const userId = interaction.user.id;
    let user = await User.findOne({ userId });
    if (user && user.banned) {
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }
    const now = new Date();
    const cooldown = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (!user) {
      user = await User.create({ userId });
    }
    const lastClaim = user.lastMonthly || new Date(0);
    const timeSinceLast = now - lastClaim;
    if (timeSinceLast < cooldown) {
      const remaining = cooldown - timeSinceLast;
      const days = Math.floor(remaining / (24 * 3600000));
      const hours = Math.floor((remaining % (24 * 3600000)) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("⏳ Monthly Cooldown")
            .setDescription(`You already claimed your monthly reward!\nTry again in **${days}d ${hours}h ${minutes}m**.`)
        ],
        ephemeral: true,
      });
    }
    // Fetch server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    user.balance += MONTHLY_REWARD;
    user.lastMonthly = now;
    await user.save();
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x41fb2e)
          .setTitle("🎁 Monthly Reward")
          .setDescription(`You claimed **${MONTHLY_REWARD} ${currency}**!\nYour new balance is **${user.balance} ${currency}**.`)
          .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      ]
    });
  },
};
