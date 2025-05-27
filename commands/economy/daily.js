const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const connectDB = require("../../config/db");
const GuildConfig = require("../../models/GuildConfig");

const DAILY_REWARD = 500;
const COOLDOWN_HOURS = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily coins."),
  
  async execute(interaction) {
    await connectDB();

    const userId = interaction.user.id;
    let user = await User.findOne({ userId });

    if (user && user.banned) {
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }

    const now = new Date();
    const cooldown = COOLDOWN_HOURS * 60 * 60 * 1000;

    if (!user) {
      user = await User.create({ userId });
    }

    const lastClaim = user.lastDaily || new Date(0);
    const timeSinceLast = now - lastClaim;

    if (timeSinceLast < cooldown) {
      const remaining = cooldown - timeSinceLast;
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("⏳ Daily Cooldown")
            .setDescription(`You already claimed your daily reward!\nTry again in **${hours}h ${minutes}m ${seconds}s**.`)
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

    user.balance += DAILY_REWARD;
    user.lastDaily = now;
    await user.save();

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("🎉 Daily Reward")
          .setDescription(`You claimed **${DAILY_REWARD} ${currency}**!\nYour new balance is **${user.balance} ${currency}**.`)
          .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      ]
    });
  },
};
