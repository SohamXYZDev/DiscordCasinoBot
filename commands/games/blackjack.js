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

    // Insurance logic (stake.com): Offer if dealer shows Ace
    let insuranceOffered = false;
    let insuranceTaken = false;
    let insurancePayout = 0;
    if (dealerHand[0].rank === "A") {
      insuranceOffered = true;
      // Offer insurance button
      const insuranceRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("insurance_yes").setLabel("Take Insurance").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("insurance_no").setLabel("No Insurance").setStyle(ButtonStyle.Secondary)
      );
      embed.addFields({ name: "Insurance", value: "Dealer shows an Ace! Take insurance for half your bet? (Pays 2:1 if dealer has blackjack)", inline: false });
      await interaction.editReply({ embeds: [embed], components: [row, insuranceRow], content: null });
      // Wait for insurance choice
      let insuranceCollector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && ["insurance_yes", "insurance_no"].includes(i.customId),
        time: 20000
      });
      await new Promise(res => {
        insuranceCollector.on("collect", async i => {
          if (i.customId === "insurance_yes") {
            if (user.balance < Math.floor(amount / 2)) {
              await i.reply({ content: "❌ Not enough balance for insurance.", ephemeral: true });
              insuranceTaken = false;
            } else {
              user.balance -= Math.floor(amount / 2);
              await user.save();
              insuranceTaken = true;
              await i.update({ content: "✅ Insurance taken!", embeds: [embed], components: [row, insuranceRow] });
            }
          } else {
            insuranceTaken = false;
            await i.update({ content: "No insurance taken.", embeds: [embed], components: [row, insuranceRow] });
          }
          insuranceCollector.stop();
        });
        insuranceCollector.on("end", res);
      });
      // Remove insurance row for next UI
      embed.data.fields = embed.data.fields.filter(f => f.name !== "Insurance");
    }
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
        if (insuranceTaken) {
          insurancePayout = amount;
          user.balance += insurancePayout;
        }
      } else {
        // Player wins with blackjack, 2.5x payout (house edge applied)
        win = true;
        payout = Math.floor(amount * 2.37); // 2.5x - 5% house edge
        if (insuranceTaken) {
          insurancePayout = 0;
        }
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
        details: { playerHand, dealerHand, autoBlackjack: true, insurance: insuranceTaken, insurancePayout },
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
        );
      if (insuranceTaken) {
        embed.addFields({ name: "Insurance", value: insurancePayout > 0 ? `You won insurance: **+${insurancePayout} ${currency}**` : "Insurance lost.", inline: false });
      }
      embed.setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
      await interaction.editReply({ embeds: [embed], components: [], content: null });
      return;
    }

    // Show initial hand with buttons
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    let canSplit = playerHand[0].rank === playerHand[1].rank;
    let embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack")
      .setDescription(`Your hand: ${playerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${playerValue})\nDealer shows: ${dealerHand[0].rank}${dealerHand[0].suit}`)
      .setColor(0x5865f2)
      .addFields(
        { name: "How to Play", value: "Press **Hit** to draw a card, **Stand** to hold, or **Split** if you have a pair.", inline: false },
        { name: "Your Bet", value: `${amount} ${currency}`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("split").setLabel("Split").setStyle(ButtonStyle.Success).setDisabled(!canSplit)
    );
    await interaction.editReply({ embeds: [embed], components: [row], content: null });

    // Await user interaction for hit/stand/split
    let splitActive = false;
    let splitHands = [];
    let splitBets = [];
    let splitResults = [];
    let splitIndex = 0;
    let collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && ["hit", "stand", "split"].includes(i.customId),
      time: 30000
    });
    collector.on("collect", async i => {
      if (i.customId === "split" && canSplit && !splitActive) {
        // Split logic: create two hands, deduct extra bet
        if (user.balance < amount) {
          await i.reply({ content: "❌ Not enough balance to split.", ephemeral: true });
          return;
        }
        user.balance -= amount;
        await user.save();
        splitActive = true;
        splitHands = [
          [playerHand[0], drawCard()],
          [playerHand[1], drawCard()]
        ];
        splitBets = [amount, amount];
        splitResults = [null, null];
        splitIndex = 0;
        embed.setDescription(`Split! Playing hand 1: ${splitHands[0].map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(splitHands[0])})\nDealer shows: ${dealerHand[0].rank}${dealerHand[0].suit}`);
        await i.update({ embeds: [embed], components: [row] });
        return;
      }
      if (splitActive) {
        // Play out split hands one by one
        let hand = splitHands[splitIndex];
        if (i.customId === "hit") {
          hand.push(drawCard());
          embed.setDescription(`Split! Playing hand ${splitIndex + 1}: ${hand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(hand)})\nDealer shows: ${dealerHand[0].rank}${dealerHand[0].suit}`);
          await i.update({ embeds: [embed], components: [row] });
          if (handValue(hand) > 21) {
            splitResults[splitIndex] = "bust";
            splitIndex++;
          }
        } else if (i.customId === "stand") {
          splitResults[splitIndex] = "stand";
          splitIndex++;
        }
        // Move to next hand or finish
        if (splitIndex >= splitHands.length) {
          collector.stop("splitdone");
        } else if (splitResults[splitIndex]) {
          // If next hand already finished (e.g. both bust), skip
          splitIndex++;
          if (splitIndex >= splitHands.length) collector.stop("splitdone");
        }
        return;
      }
      // Normal (non-split) play
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
      new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("split").setLabel("Split").setStyle(ButtonStyle.Success).setDisabled(true)
    );

    // Dealer's turn
    dealerValue = handValue(dealerHand);
    while ((!playerBusted && !splitActive) && dealerValue < 17) {
      dealerHand.push(drawCard());
      dealerValue = handValue(dealerHand);
    }
    // Result logic
    if (splitActive) {
      // For each split hand, resolve result
      let splitPayouts = [0, 0];
      let splitWin = [false, false];
      for (let idx = 0; idx < splitHands.length; idx++) {
        let hand = splitHands[idx];
        let value = handValue(hand);
        let result = splitResults[idx];
        if (result === "bust" || value > 21) {
          splitWin[idx] = false;
          splitPayouts[idx] = -amount;
        } else {
          // Dealer draws for split hands
          let dealerVal = handValue(dealerHand);
          if (dealerVal > 21 || value > dealerVal) {
            splitWin[idx] = true;
            splitPayouts[idx] = Math.floor(amount * 1.95);
            user.balance += splitPayouts[idx];
          } else if (value === dealerVal) {
            splitWin[idx] = null;
            splitPayouts[idx] = 0;
          } else {
            splitWin[idx] = false;
            splitPayouts[idx] = -amount;
          }
        }
      }
      // XP for split
      let xpGain = 10;
      for (let idx = 0; idx < splitHands.length; idx++) {
        if (splitWin[idx] === true) user.xp += xpGain * 2;
        else if (splitWin[idx] === false) user.xp += xpGain;
      }
      // Level up logic
      const nextLevelXp = user.level * 100;
      let resultText = "";
      if (user.xp >= nextLevelXp) {
        user.level += 1;
        user.xp = user.xp - nextLevelXp;
        resultText += `\n🎉 You leveled up to **Level ${user.level}**!`;
      }
      await user.save();
      // Bet history for both hands
      const Bet = require("../../models/Bet");
      for (let idx = 0; idx < splitHands.length; idx++) {
        await Bet.create({
          userId,
          game: "blackjack",
          amount,
          result: splitWin[idx] === true ? "win" : splitWin[idx] === false ? "lose" : "draw",
          payout: splitPayouts[idx],
          details: { playerHand: splitHands[idx], dealerHand, split: true, handIndex: idx },
        });
      }
      // Final embed for split
      let splitDesc = splitHands.map((hand, idx) =>
        `Hand ${idx + 1}: ${hand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(hand)}) - ` +
        (splitWin[idx] === true ? `**+${Math.abs(splitPayouts[idx])} ${currency}**` : splitWin[idx] === false ? `**-${amount} ${currency}**` : "No change (draw)")
      ).join("\n");
      let embed = new EmbedBuilder()
        .setTitle("🃏 Blackjack (Split)")
        .setColor(0x5865f2)
        .setDescription(`${splitDesc}\nDealer's hand: ${dealerHand.map(c => `${c.rank}${c.suit}`).join(" ")} (Value: ${handValue(dealerHand)})`)
        .addFields(
          { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
          { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
        )
        .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
      await interaction.editReply({ embeds: [embed], components: [disabledRow], content: null });
      return;
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
