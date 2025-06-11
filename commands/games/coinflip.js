const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const { checkCooldown } = require("../../utils/cooldown");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Bet on a coin flip! Win or lose your coins.")
    .addStringOption(option =>
      option
        .setName("side")
        .setDescription("Choose heads or tails")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" }
        )
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("How many coins to bet")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    let amountInput = interaction.options.getInteger("amount");
    if (amountInput === null || amountInput === undefined) {
      amountInput = interaction.options.getString("amount");
    }
    let user = await User.findOne({ userId });
    if (!user) {
      return interaction.reply({ content: "❌ You don't have an account.", ephemeral: true });
    }
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all-in") {
      amount = user.balance;
    } else {
      amount = parseInt(amountInput);
    }
    if (!amount || amount <= 0) {
      return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
    }
    if (user.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough coins.", ephemeral: true });
    }
    if (user.banned) {
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }

    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("coinflip")) {
        return interaction.reply({ content: "🚫 The Coinflip game is currently disabled on this server.", ephemeral: true });
      }
    }

    const cooldownSeconds = 15;
    const cd = checkCooldown(userId, "coinflip", cooldownSeconds);
    if (cd > 0) {
      return interaction.reply({
        content: `⏳ You must wait ${cd}s before flipping again.`,
        ephemeral: true,
      });
    }

    // Fetch server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }

    // Anticipation message
    await interaction.reply({ content: "<a:loading:1376139232090914846> Flipping a coin...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));

    // Coin flip logic
    const HOUSE_EDGE = 0.90;
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = side === result;
    let payout = won ? Math.floor(amount * HOUSE_EDGE) : -amount;
    if (won) user.balance += payout;
    else user.balance -= amount;

    let resultText, color;
    let xpGain = 5;
    if (won) {
      resultText = `You win! You gained **+${payout} ${currency}**.`;
      color = 0x00ff00;
      user.xp += xpGain * 2;
    } else {
      resultText = `You lose! You lost **-${amount} ${currency}**.`;
      color = 0xff0000;
      user.xp += xpGain;
    }

    // Level up logic
    const nextLevelXp = user.level * 100;
    if (user.xp >= nextLevelXp) {
      user.level += 1;
      user.xp = user.xp - nextLevelXp;
      resultText += `\n🎉 You leveled up to **Level ${user.level}**!`;
    }

    user.lastCoinflip = new Date();
    await user.save();

    // Bet history
    const Bet = require("../../models/Bet");
    await Bet.create({
      userId,
      game: "coinflip",
      amount,
      result: won ? "win" : "lose",
      payout: won ? payout : -amount,
      details: { side, result },
    });

    const embed = new EmbedBuilder()
      .setTitle("🪙 Coin Flip")
      .setColor(won ? 0x00ff99 : 0xff0000)
      .addFields(
        { name: "Your Bet", value: `${amount} ${currency} on ${side.charAt(0).toUpperCase() + side.slice(1)}`, inline: false },
        { name: "Result", value: result.charAt(0).toUpperCase() + result.slice(1), inline: true },
        { name: won ? "You Won!" : "You Lost", value: won ? `**+${payout} ${currency}**` : `**-${amount} ${currency}**`, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

    await interaction.editReply({ embeds: [embed], content: null });
  },
};
