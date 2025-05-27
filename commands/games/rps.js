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
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet")
        .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const choice = interaction.options.getString("choice");
    const amount = interaction.options.getInteger("amount");
    if (amount <= 0) {
      return interaction.reply({ content: "❌ Invalid bet amount.", ephemeral: true });
    }
    let user = await User.findOne({ userId });
    if (!user || user.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough coins.", ephemeral: true });
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
    // Server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    // Check if game is disabled
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("rps")) {
        return interaction.reply({ content: "🚫 The Rock Paper Scissors game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1376139232090914846> Choosing rock, paper, or scissors...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));
    // Bot's move and house edge
    const HOUSE_EDGE = 0.90;
    const moves = ["rock", "paper", "scissors"];
    const botMove = moves[Math.floor(Math.random() * 3)];
    let result;
    let payout;
    if (choice === botMove) {
      result = "draw";
      payout = 0;
    } else if (
      (choice === "rock" && botMove === "scissors") ||
      (choice === "paper" && botMove === "rock") ||
      (choice === "scissors" && botMove === "paper")
    ) {
      result = "win";
      payout = Math.floor(amount * HOUSE_EDGE);
      user.balance += payout;
    } else {
      result = "lose";
      payout = -amount;
      user.balance -= amount;
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
      .setColor(color)
      .addFields(
        { name: "Your Move", value: choice.charAt(0).toUpperCase() + choice.slice(1), inline: true },
        { name: "Bot's Move", value: botMove.charAt(0).toUpperCase() + botMove.slice(1), inline: true },
        { name: "Result", value: resultText, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
