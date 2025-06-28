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
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet (number or 'all')")
        .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    let amountInput = interaction.options.getString("amount");
    let color = interaction.options.getString("color"); // <-- FIX: get color from interaction
    let user = await User.findOne({ userId });
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseFloat(amountInput);
    }
    if (!amount || amount <= 0) {
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: "🚫 Invalid bet amount.", ephemeral: true });
      } else {
        return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
      }
    }
    // Server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    if (user.balance < amount) {
      return interaction.reply({ content: `❌ You don't have enough ${currency}.`, ephemeral: true });
    }
    if (user.banned) {
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
      } else {
        return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
      }
    }
    // Cooldown (10s)
    const cd = checkCooldown(userId, "roulette", 10);
    if (cd > 0) {
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
      }
    }
    // Deduct initial bet immediately to prevent mid-game quitting exploits
    user.balance -= amount;
    if (user.balance < 0) user.balance = 0;
    await user.save();
    // Fetch house edge from config (default 5%)
    let houseEdge = 5;
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && typeof config.houseEdge === "number") houseEdge = config.houseEdge;
    }
    const HOUSE_EDGE = 1 - (houseEdge / 100);
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

    // --- Probability rigging logic for red/black ---
    let resultColor;
    let config = null;
    let riggedProbability = null;
    if (interaction.guildId) {
      config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.probabilities && typeof config.probabilities.roulette === "number") {
        riggedProbability = config.probabilities.roulette;
      }
    }
    if ((color === "red" || color === "black") && riggedProbability !== null) {
      // Only rig for red/black bets
      // green stays at 1/15 (6.67%), rest is split by rigged probability
      // riggedProbability is the percent chance (0-100) to win if betting red/black
      // If user bets red: red = riggedProbability%, black = (100 - riggedProbability - greenChance)%, green = 1/15
      // We'll keep green at 1/15, so red+black = 14/15 (93.33%)
      const greenChance = 1 / 15;
      const redOrBlackChance = (1 - greenChance);
      const winChance = riggedProbability / 100 * redOrBlackChance;
      const loseChance = redOrBlackChance - winChance;
      const rand = Math.random();
      if (rand < greenChance) {
        resultColor = "green";
      } else if (rand < greenChance + winChance) {
        resultColor = color; // rigged win
      } else {
        // rigged loss: must be the other color
        resultColor = color === "red" ? "black" : "red";
      }
    } else {
      // Default: Spin the wheel: 0 = green, 1-7 = red, 8-14 = black
      const spin = Math.floor(Math.random() * 15);
      if (spin === 0) resultColor = "green";
      else if (spin <= 7) resultColor = "red";
      else resultColor = "black";
    }
    // House edge: reduce payout by 5%
    let win = resultColor === color;
    let payout;
    let result = win ? "win" : "lose";
    if (win) {
      payout = Math.floor(amount * PAYOUTS[color] * HOUSE_EDGE);
      user.balance += payout;
    } else {
      payout = 0; // Already deducted at start
    }
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
      result,
      payout: win ? payout : -amount,
      details: { color, resultColor },
    });
    // Build and send result embed (edit the previous reply)
    const embed = new EmbedBuilder()
      .setTitle("🎰 Roulette")
      .setColor(win ? 0x41fb2e : 0xff0000)
      .addFields(
        { name: "Your Bet", value: `${amount} ${currency} on ${color.charAt(0).toUpperCase() + color.slice(1)}`, inline: false },
        { name: "Result", value: resultColor.charAt(0).toUpperCase() + resultColor.slice(1), inline: true },
        { name: win ? "You Won!" : "You Lost", value: win ? `**+${payout} ${currency}**` : `**-${amount} ${currency}**`, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setImage(win ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless" : "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6b1727&=&format=webp&quality=lossless");
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
