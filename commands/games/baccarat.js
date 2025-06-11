const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

// Baccarat logic helpers
function drawCard() {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  return { rank, suit };
}

function baccaratValue(hand) {
  let value = 0;
  for (const card of hand) {
    if (["10", "J", "Q", "K"].includes(card.rank)) value += 0;
    else if (card.rank === "A") value += 1;
    else value += parseInt(card.rank);
  }
  return value % 10;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("baccarat")
    .setDescription("Play a game of baccarat! Bet on Player, Banker, or Tie.")
    .addStringOption(option =>
      option.setName("beton")
        .setDescription("Who do you bet on?")
        .setRequired(true)
        .addChoices(
          { name: "Player (2x)", value: "player" },
          { name: "Banker (1.95x)", value: "banker" },
          { name: "Tie (8x)", value: "tie" }
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
    // Cooldown (20s)
    const cd = checkCooldown(userId, "baccarat", 20);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
    }
    // Server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    // Game disabled check
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("baccarat")) {
        return interaction.reply({ content: "🚫 The Baccarat game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1376139232090914846> Dealing baccarat cards...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1500));
    // Initial hands
    let playerHand = [drawCard(), drawCard()];
    let bankerHand = [drawCard(), drawCard()];
    let playerValue = baccaratValue(playerHand);
    let bankerValue = baccaratValue(bankerHand);
    // Natural win check
    let natural = playerValue >= 8 || bankerValue >= 8;
    // Third card rules (simplified)
    if (!natural) {
      if (playerValue <= 5) {
        playerHand.push(drawCard());
        playerValue = baccaratValue(playerHand);
      }
      if (bankerValue <= 5) {
        bankerHand.push(drawCard());
        bankerValue = baccaratValue(bankerHand);
      }
    }
    // Determine winner
    let winner;
    if (playerValue > bankerValue) winner = "player";
    else if (bankerValue > playerValue) winner = "banker";
    else winner = "tie";
    // Payouts with house edge
    let payout = 0;
    if (betOn === winner) {
      if (winner === "player") payout = Math.floor(amount * 1.90); // 5% house edge
      else if (winner === "banker") payout = Math.floor(amount * 1.85); // 7.5% house edge
      else if (winner === "tie") payout = Math.floor(amount * 7.5); // 6.25% house edge
      user.balance += payout;
    } else {
      payout = -amount;
      user.balance -= amount;
    }
    // XP
    let xpGain = 10;
    if (betOn === winner) user.xp += xpGain * 2;
    else user.xp += xpGain;
    // Level up logic
    const nextLevelXp = user.level * 100;
    let resultText = "";
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
      game: "baccarat",
      amount,
      result: betOn === winner ? "win" : "lose",
      payout: payout,
      details: { betOn, winner, playerHand, bankerHand },
    });
    // Result embed
    let resultField;
    if (betOn === winner) resultField = `**+${payout} ${currency}**`;
    else resultField = `**-${amount} ${currency}**`;
    const embed = new EmbedBuilder()
      .setTitle("🎴 Baccarat")
      .setColor(betOn === winner ? 0x00ff99 : 0xff0000)
      .setDescription(
        `You bet on: **${betOn.charAt(0).toUpperCase() + betOn.slice(1)}**\n\n` +
        `Player: ${playerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${playerValue})\n` +
        `Banker: ${bankerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${bankerValue})\n` +
        `Result: **${winner.charAt(0).toUpperCase() + winner.slice(1)}**`
      )
      .addFields(
        { name: betOn === winner ? "You Won!" : "You Lost", value: resultField, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
