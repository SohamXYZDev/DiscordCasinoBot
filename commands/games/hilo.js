const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hilo")
    .setDescription("Play HiLo! Guess if the next number is higher or lower. Bet your coins!")
    .addStringOption(option =>
      option.setName("guess")
        .setDescription("Will the next number be higher or lower?")
        .setRequired(true)
        .addChoices(
          { name: "Higher", value: "higher" },
          { name: "Lower", value: "lower" }
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
    const cd = checkCooldown(userId, "hilo", 10);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
    }
    // Deduct initial bet immediately to prevent mid-game quitting exploits
    user.balance -= amount;
    if (user.balance < 0) user.balance = 0;
    await user.save();
    // Server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1376139232090914846> Drawing a card...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));
    // HiLo logic: pick a number 1-9, show it, then pick next number 1-9
    const first = Math.floor(Math.random() * 9) + 1;
    let second;
    do {
      second = Math.floor(Math.random() * 9) + 1;
    } while (second === first); // ensure not the same
    let result;
    if ((guess === "higher" && second > first) || (guess === "lower" && second < first)) {
      result = "win";
    } else if (second === first) {
      result = "draw";
    } else {
      result = "lose";
    }
    // House edge: 5% reduction in payout
    const HOUSE_EDGE = 0.90;
    let payout;
    if (result === "draw") {
      payout = 0;
      user.balance += amount; // Refund bet on draw
    } else if (result === "win") {
      payout = Math.floor(amount * HOUSE_EDGE);
      user.balance += amount + payout; // Return bet + profit
    } else {
      payout = 0; // Already deducted at start
    }
    let resultText, color;
    let xpGain = 5;
    if (result === "win") {
      user.xp += xpGain * 2;
      resultText = `You win! You gained **+${payout} ${currency}**.`;
      color = 0x00ff99;
    } else if (result === "draw") {
      user.xp += xpGain;
      resultText = `It's a draw! You get your bet back: **+${amount} ${currency}**.`;
      color = 0xffff00;
    } else {
      user.xp += xpGain;
      resultText = `You lose! You lost **-${amount} ${currency}**.`;
      color = 0xff0000;
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
      game: "hilo",
      amount,
      result,
      payout: result === "win" ? payout : -amount,
      details: { guess, first, second },
    });
    const embed = new EmbedBuilder()
      .setTitle("🔢 HiLo")
      .setColor(color)
      .setDescription(`First number: **${first}**\nSecond number: **${second}**`)
      .addFields(
        { name: "Your Guess", value: guess.charAt(0).toUpperCase() + guess.slice(1), inline: true },
        { name: "Result", value: resultText, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
