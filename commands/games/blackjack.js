const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

// Helper functions for blackjack
function drawCard() {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  return { rank, suit };
}

function handValue(hand) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      value += 11;
      aces++;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      value += 10;
    } else {
      value += parseInt(card.rank);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of blackjack against the dealer!")
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet")
        .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const amount = interaction.options.getInteger("amount");
    if (amount <= 0) {
      return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
    }
    let user = await User.findOne({ userId });
    if (!user || user.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough coins.", ephemeral: true });
    }
    if (user.banned) {
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }
    // Cooldown (20s)
    const cd = checkCooldown(userId, "blackjack", 20);
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
      if (config && config.disabledGames && config.disabledGames.includes("blackjack")) {
        return interaction.reply({ content: "🚫 The Blackjack game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message with loading gif
    await interaction.reply({ content: "<a:loading:1376139232090914846> Dealing cards...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1500));
    // Initial hands
    let playerHand = [drawCard(), drawCard()];
    let dealerHand = [drawCard(), drawCard()];
    let playerValue = handValue(playerHand);
    let dealerValue = handValue([dealerHand[0]]); // Only show one card

    // Check for auto-win (blackjack)
    let finished = false;
    let win = false;
    let payout = 0;
    let playerBusted = false;
    if (playerValue === 21) {
      // Player has blackjack
      // Dealer checks for blackjack
      const dealerFullValue = handValue(dealerHand);
      if (dealerFullValue === 21) {
        // Both have blackjack: push
        win = null;
        payout = 0;
      } else {
        // Player wins with blackjack, 2.5x payout (house edge applied)
        win = true;
        payout = Math.floor(amount * 2.37); // 2.5x - 5% house edge
      }
      finished = true;
    }

    if (finished) {
      if (win === true) user.balance += payout;
      else if (win === false) user.balance -= amount;
      // XP
      let xpGain = 10;
      if (win === true) user.xp += xpGain * 2;
      else if (win === false) user.xp += xpGain;
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
        game: "blackjack",
        amount,
        result: win === true ? "win" : win === false ? "lose" : "draw",
        payout: payout,
        details: { playerHand, dealerHand, autoBlackjack: true },
      });
      // Final embed
      let resultField;
      if (win === true) resultField = `**+${payout} ${currency}**`;
      else if (win === false) resultField = `**-${amount} ${currency}**`;
      else resultField = "No change (draw)";
      let embed = new EmbedBuilder()
        .setTitle("🃏 Blackjack")
        .setColor(win === true ? 0x00ff99 : win === false ? 0xff0000 : 0xffff00)
        .setDescription(`Your hand: ${playerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(playerHand)})\nDealer's hand: ${dealerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(dealerHand)})`)
        .addFields(
          { name: win === true ? "Blackjack! You Win!" : win === false ? "Both Blackjack! Draw" : "Draw", value: resultField, inline: false },
          { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
          { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
        )
        .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
      await interaction.editReply({ embeds: [embed], components: [], content: null });
      return;
    }

    // Show initial hand with buttons
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    let embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack")
      .setDescription(`Your hand: ${playerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${playerValue})\nDealer shows: ${dealerHand[0].rank}${dealerHand[0].suit}`)
      .setColor(0x5865f2)
      .addFields(
        { name: "How to Play", value: "Press **Hit** to draw a card, or **Stand** to hold.", inline: false },
        { name: "Your Bet", value: `${amount} ${currency}`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary)
    );
    await interaction.editReply({ embeds: [embed], components: [row], content: null });

    // Await user interaction for hit/stand
    let collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && ["hit", "stand"].includes(i.customId),
      time: 30000
    });
    collector.on("collect", async i => {
      if (i.customId === "hit") {
        playerHand.push(drawCard());
        playerValue = handValue(playerHand);
        embed.setDescription(`Your hand: ${playerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${playerValue})\nDealer shows: ${dealerHand[0].rank}${dealerHand[0].suit}`);
        await i.update({ embeds: [embed], components: [row] });
        if (playerValue > 21) {
          finished = true;
          playerBusted = true;
          collector.stop("bust");
        }
      } else if (i.customId === "stand") {
        finished = true;
        collector.stop("stand");
      }
    });
    await new Promise(res => collector.once("end", res));
    // Disable buttons after game ends
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    // Dealer's turn
    dealerValue = handValue(dealerHand);
    while (!playerBusted && dealerValue < 17) {
      dealerHand.push(drawCard());
      dealerValue = handValue(dealerHand);
    }
    // Determine result
    if (playerValue > 21) {
      win = false;
      payout = -amount;
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      win = true;
      // House edge: 5% reduction
      payout = Math.floor(amount * 1.95);
    } else if (playerValue === dealerValue) {
      win = null;
      payout = 0;
    } else {
      win = false;
      payout = -amount;
    }
    if (win === true) user.balance += payout;
    else if (win === false) user.balance -= amount;
    // XP
    let xpGain = 10;
    if (win === true) user.xp += xpGain * 2;
    else if (win === false) user.xp += xpGain;
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
      game: "blackjack",
      amount,
      result: win === true ? "win" : win === false ? "lose" : "draw",
      payout: payout,
      details: { playerHand, dealerHand },
    });
    // Final embed
    let resultField;
    if (win === true) resultField = `**+${payout} ${currency}**`;
    else if (win === false) resultField = `**-${amount} ${currency}**`;
    else resultField = "No change (draw)";
    embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack")
      .setColor(win === true ? 0x00ff99 : win === false ? 0xff0000 : 0xffff00)
      .setDescription(`Your hand: ${playerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(playerHand)})\nDealer's hand: ${dealerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(dealerHand)})`)
      .addFields(
        { name: win === true ? "You Won!" : win === false ? "You Lost" : "Draw", value: resultField, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed], components: [disabledRow], content: null });
  },
};
