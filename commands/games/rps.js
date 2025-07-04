const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock Paper Scissors and bet your coins!")
    .addStringOption(option =>
      option.setName("choice")
        .setDescription("Your move")
        .setRequired(true)
        .addChoices(
          { name: "Rock", value: "rock" },
          { name: "Paper", value: "paper" },
          { name: "Scissors", value: "scissors" }
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
    let user = await User.findOne({ userId });
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseFloat(amountInput);
    }
    let choice = interaction.options.getString("choice");
    if (amount === null || amount === undefined || isNaN(amount)) {
      return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
    }
    if (!amount || amount <= 0) {
      return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
    }
    if (user.balance < amount) {
      return interaction.reply({ content: `❌ You don't have enough ${currency}.`, ephemeral: true });
    }
    if (user.banned) {
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }
    // Cooldown (10s)
    const { checkCooldown } = require("../../utils/cooldown");
    const cd = checkCooldown(userId, "rps", 10);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
    }
    // Deduct initial bet immediately to prevent mid-game quitting exploits
    user.balance -= amount;
    if (user.balance < 0) user.balance = 0;
    await user.save();
    // Server currency
    let currency = "coins";
    // Fetch house edge from config (default 5%)
    let houseEdge = 5;
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && typeof config.houseEdge === "number") houseEdge = config.houseEdge;
      if (config && config.currency) currency = config.currency;
    }
    const HOUSE_EDGE = 1 - (houseEdge / 100);
    // Check if game is disabled
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("rps")) {
        return interaction.reply({ content: "🚫 The Rock Paper Scissors game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1388538675465424967> Choosing rock, paper, or scissors...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));
    // Bot's move and house edge
    const moves = ["rock", "paper", "scissors"];
    // Fetch probability from config (default 33%)
    let winProbability = 33;
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.probabilities && typeof config.probabilities.rps === "number") {
        winProbability = config.probabilities.rps;
      }
    }
    // Determine outcome using probability
    let result;
    let payout;
    let botMove;
    // User win forced by probability
    if (Math.random() * 100 < winProbability) {
      // User wins: bot picks losing move
      if (choice === "rock") botMove = "scissors";
      else if (choice === "paper") botMove = "rock";
      else botMove = "paper";
      result = "win";
    } else {
      // User loses or draws: bot picks random (with bias to lose less often)
      botMove = moves[Math.floor(Math.random() * 3)];
      if (choice === botMove) result = "draw";
      else if (
        (choice === "rock" && botMove === "scissors") ||
        (choice === "paper" && botMove === "rock") ||
        (choice === "scissors" && botMove === "paper")
      ) result = "win";
      else result = "lose";
    }
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
    if (result === "draw") {
      resultText = `It's a draw! You keep your **${amount} ${currency}**.`;
      color = 0xfad02e;
      user.xp += xpGain;
    } else if (result === "win") {
      resultText = `You win! You gained **+${payout} ${currency}**.`;
      color = 0x00ff99;
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
    await user.save();
    // Bet history
    const Bet = require("../../models/Bet");
    await Bet.create({
      userId,
      game: "rps",
      amount,
      result,
      payout,
      details: { choice, botMove },
    });
    const embed = new EmbedBuilder()
      .setTitle("🪨 📄 ✂️ Rock Paper Scissors")
      .setColor(
        result === "win" ? 0x41fb2e : result === "lose" ? 0xff0000 : 0xffff00
      )
      .addFields(
        { name: "Your Move", value: choice.charAt(0).toUpperCase() + choice.slice(1), inline: true },
        { name: "Bot's Move", value: botMove.charAt(0).toUpperCase() + botMove.slice(1), inline: true },
        { name: "Result", value: resultText, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setImage(
        result === "win"
          ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless"
          : result === "lose"
          ? "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless"
          : "https://media.discordapp.net/attachments/1374310263003807778/1388826613483044924/YOU_WIN_2.png?ex=68626513&is=68611393&hm=33806f5a224060dea92fe4e17fdbd919a5ece77882aa5d24ced8826f1a99785f&=&format=webp&quality=lossless"
      );
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
