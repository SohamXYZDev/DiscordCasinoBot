const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

const COLORS = ["red", "black", "green"];
const PAYOUTS = { red: 2, black: 2, green: 14 };

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("Bet on red, black, or green! Higher payout for green.")
    .addStringOption(option =>
      option.setName("color")
        .setDescription("Choose a color to bet on")
        .setRequired(true)
        .addChoices(
          { name: "Red (2x)", value: "red" },
          { name: "Black (2x)", value: "black" },
          { name: "Green (14x)", value: "green" }
        )
    )
    .addIntegerOption(option =>
      option.setName("amount")
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
    // Cooldown (10s)
    const cd = checkCooldown(userId, "roulette", 10);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
    }
    // Server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    // Check if the game is disabled in the server
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("roulette")) {
        return interaction.reply({ content: "🚫 The Roulette game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1376139232090914846> Spinning the roulette...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1800));
    // Spin the wheel: 0 = green, 1-7 = red, 8-14 = black
    const spin = Math.floor(Math.random() * 15);
    let resultColor;
    if (spin === 0) resultColor = "green";
    else if (spin <= 7) resultColor = "red";
    else resultColor = "black";
    // House edge: reduce payout by 5%
    const HOUSE_EDGE = 0.90;
    let win = resultColor === color;
    let payout = win ? Math.floor(amount * PAYOUTS[color] * HOUSE_EDGE) : -amount;
    if (win) user.balance += payout;
    else user.balance -= amount;

    let resultText;
    let xpGain = 5;
    if (win) {
      user.xp += xpGain * 2;
      resultText = `You win! You gained **+${payout} ${currency}**.`;
    } else {
      user.xp += xpGain;
      resultText = `You lose! You lost **-${amount} ${currency}**.`;
    }
    // Level up logic
    const nextLevelXp = user.level * 100;
    if (user.xp >= nextLevelXp) {
      user.level += 1;
      user.xp = user.xp - nextLevelXp;
      resultText += `\n🎉 You leveled up to **Level ${user.level}**!`;
    }
    await user.save();
    // Bet history
    const Bet = require("../../models/Bet");
    await Bet.create({
      userId,
      game: "roulette",
      amount,
      result: win ? "win" : "lose",
      payout: win ? payout : -amount,
      details: { color, resultColor },
    });
    // Build and send result embed (edit the previous reply)
    const embed = new EmbedBuilder()
      .setTitle("🎰 Roulette")
      .setColor(win ? 0x00ff99 : 0xff0000)
      .addFields(
        { name: "Your Bet", value: `${amount} ${currency} on ${color.charAt(0).toUpperCase() + color.slice(1)}`, inline: false },
        { name: "Result", value: resultColor.charAt(0).toUpperCase() + resultColor.slice(1), inline: true },
        { name: win ? "You Won!" : "You Lost", value: win ? `**+${payout} ${currency}**` : `**-${amount} ${currency}**`, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
