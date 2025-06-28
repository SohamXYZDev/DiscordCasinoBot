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
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet (number or 'all')")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    let amountInput = interaction.options.getString("amount");
    let side = interaction.options.getString("side");
    let user = await User.findOne({ userId });
    if (!user) {
      return interaction.reply({ content: "❌ You don't have an account.", ephemeral: true });
    }
    let amount;
    if (typeof amountInput === "string" && ["all", "all-in"].includes(amountInput.toLowerCase())) {
      amount = user.balance;
    } else {
      amount = parseFloat(amountInput);
    }
    if (!amount || amount <= 0) {
      return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
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
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }

    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("coinflip")) {
        return interaction.reply({ content: "🚫 The Coinflip game is currently disabled on this server.", ephemeral: true });
      }
    }

    // Cooldown (10s)
    const cd = checkCooldown(userId, "coinflip", 10);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
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

    // Fetch probability from config (default 50%)
    let winProbability = 50;
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.probabilities && typeof config.probabilities.coinflip === "number") {
        winProbability = config.probabilities.coinflip;
      }
    }
    // Determine win using probability
    const userWins = Math.random() * 100 < winProbability;
    const flipResult = userWins ? side : (side === "heads" ? "tails" : "heads");

    // Anticipation message
    await interaction.reply({ content: "<a:loading:1388538675465424967> Flipping a coin...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));

    // Coin flip logic
    const won = flipResult === side;
    let payout = 0;
    let result = won ? "win" : "lose";
    if (won) {
      payout = Math.floor(amount * HOUSE_EDGE);
      user.balance += amount + payout; // Return bet + profit
    } else {
      payout = 0; // Already deducted at start
    }

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
      result,
      payout: won ? payout : -amount,
      details: { side, flipResult },
    });

    const embed = new EmbedBuilder()
      .setTitle("🦙 Coin Flip")
      .setColor(won ? 0x41fb2e : 0xff0000)
      .addFields(
        { name: "Your Bet", value: `${amount} ${currency} on ${side.charAt(0).toUpperCase() + side.slice(1)}`, inline: false },
        { name: "Result", value: flipResult.charAt(0).toUpperCase() + flipResult.slice(1), inline: true },
        { name: won ? "You Won!" : "You Lost", value: won ? `**+${payout} ${currency}**` : `**-${amount} ${currency}**`, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setImage(won ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless" : "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless");

    await interaction.editReply({ embeds: [embed], content: null });
  },
};
