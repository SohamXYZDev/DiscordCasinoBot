const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
  
  // First, count all non-Ace cards
  for (const card of hand) {
    if (card.rank === "A") {
      aces++;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      value += 10;
    } else {
      value += parseInt(card.rank);
    }
  }
  
  // Now handle Aces - try to use as many as 11 as possible without busting
  if (aces > 0) {
    // If we can use one Ace as 11 without busting, do it
    if (value + 11 + (aces - 1) <= 21) {
      value += 11 + (aces - 1); // One Ace as 11, rest as 1
    } else {
      value += aces; // All Aces as 1
    }
  }
  
  return value;
}

// Helper function to create and shuffle a deck
function createShuffledDeck() {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Add a dictionary for custom Discord emojis
const customEmojis = {
  "A♠": "<:spades1:1388539286332244059>",
  "2♠": "<:spades2:1388539289482301651>",
  "3♠": "<:spades3:1388539292372046024>",
  "4♠": "<:spades4:1388539296146784308>",
  "5♠": "<:spades5:1388539299372470433>",
  "6♠": "<:spades6:1388539302467731577>",
  "7♠": "<:spades7:1388539305559068826>",
  "8♠": "<:spades8:1388539308176052294>",
  "9♠": "<:spades9:1388539311087157328>",
  "10♠": "<:spades10:1388539320696176845>",

  "J♠": "<:spadesj:1388551451248168972>",
  "Q♠": "<:spadesQ:1388551755490525225>",
  "K♠": "<:spadesk:1388551392226185386>",

  "A♥": "<:hearts1:1388539112583335986>",
  "2♥": "<:hearts2:1388539114898329701>",
  "3♥": "<:hearts3:1388539117855440956>",
  "4♥": "<:hearts4:1388539121873719359>",
  "5♥": "<:hearts5:1388539124843020360>",
  "6♥": "<:hearts6:1388539127892414575>",
  "7♥": "<:hearts7:1388539130866176182>",
  "8♥": "<:hearts8:1388539133609250836>",
  "9♥": "<:hearts9:1388539136360583369>",
  "10♥": "<:hearts10:1388539139066036428>",
  "J♥": "<:diamondsj:1388539104106647624>",
  "Q♥": "<:heartsq:1388539145097576612>",
  "K♥": "<:heartsk:1388539142027350096>",
  "A♦": "<:diamonds1:1388539073253343383>",
  "2♦": "<:diamonds2:1388539076159868959>",
  "3♦": "<:diamonds3:1388539079121043557>",
  "4♦": "<:diamonds4:1388539081448755350>",
  "5♦": "<:diamonds5:1388539084187762759>",
  "6♦": "<:diamonds6:1388539086888767631>",
  "7♦": "<:diamonds7:1388539089585836042>",
  "8♦": "<:diamonds8:1388539093763362907>",
  "9♦": "<:diamonds9:1388539096905023551>",
  "10♦": "<:diamonds10:1388539100314996931>",
  "J♦": "<:diamondsj:1388539104106647624>",
  "Q♦": "<:diamondsq:1388539110217617418>",
  "K♦": "<:diamondsk:1388539107541651467>",
  "A♣": "<:clubs1:1388539232670453890>",
  "2♣": "<:clubs2:1388539235723776141>",
  "3♣": "<:clubs3:1388539246255669428>",
  "4♣": "<:clubs4:1388539250672402532>",
  "5♣": "<:clubs5:1388539253679591656>",
  "6♣": "<:clubs6:1388539256103895051>",
  "7♣": "<:clubs7:1388539258968477696>",
  "8♣": "<:clubs8:1388539262596812843>",
  "9♣": "<:clubs9:1388539266602242139>",
  "10♣": "<:clubs10:1388539270192435282>",
  "J♣": "<:clubsj:1388539273678159892>",
  "Q♣": "<:clubsq:1388539282259574956>",
  "K♣": "<:clubsk:1388539277805359135>"
};

// Helper function to render cards using custom emojis
function renderCard(card) {
  const cardKey = `${card.rank}${card.suit}`;
  return customEmojis[cardKey] || `${card.rank}${card.suit}`; // Fallback to default if emoji not found
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of blackjack against the dealer!")
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet (number or 'all')")
        .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const amountInput = interaction.options.getString("amount");
    let user = await User.findOne({ userId });
    let amount;
    // Accept 'all' (case-insensitive) as all-in bet
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseInt(amountInput);
    }
    if (amount <= 0) {
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
    const cd = checkCooldown(userId, "blackjack", 10);
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
    // Check if game is disabled
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("blackjack")) {
        return interaction.reply({ content: "🚫 The Blackjack game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message with loading gif
    await interaction.reply({ content: "<a:loading:1388538675465424967> Dealing cards..." });
    await new Promise(res => setTimeout(res, 1500));
    // Initial hands (finite deck)
    let deck = createShuffledDeck();
    function drawFromDeck() { return deck.pop(); }
    let playerHand = [drawFromDeck(), drawFromDeck()];
    let dealerHand = [drawFromDeck(), drawFromDeck()];
    let playerValue = handValue(playerHand);
    let dealerValue = handValue([dealerHand[0]]); // Only show one card

    // Show the value of the dealer's visible card
    let dealerVisibleValue = handValue([dealerHand[0]]);

    // Initialize embed before any use (including insurance logic)
    let embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack")
      .setDescription(`Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${playerValue})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`)
      .setColor(0x41fb2e)
      .setFields(
        { name: "How to Play", value: "Press **Hit** to draw a card, **Stand** to hold, **Double Down** to double your bet and draw one card, or **Split** if you have a pair.", inline: false },
        { name: "Your Bet", value: `${amount} ${currency}`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

    // --- Add split state variables here ---
    let splitActive = false;
    let splitHands = null;
    let splitBets = null;
    let splitResults = null;
    let splitIndex = 0;
    let doubleDown = false;
    // --- End split state vars ---

    // Prepare the row variable BEFORE any use (including insurance logic)
    function getActionRow() {
      let canSplit = playerHand[0].rank === playerHand[1].rank && playerHand.length === 2 && !splitActive;
      let canDouble = user.balance >= amount && playerHand.length === 2 && !splitActive && !doubleDown;
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("double").setLabel("Double Down").setStyle(ButtonStyle.Danger).setDisabled(!canDouble),
        new ButtonBuilder().setCustomId("split").setLabel("Split").setStyle(ButtonStyle.Success).setDisabled(!canSplit)
      );
    }
    let row = getActionRow();

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
    let dealerFullValue = null; // <-- Fix: declare in outer scope
    if (playerValue === 21 && playerHand.length === 2) {
      // Player has natural blackjack (Ace + 10-value card)
      dealerFullValue = handValue(dealerHand);
      if (dealerFullValue === 21 && dealerHand.length === 2) {
        // Both have natural blackjack: push
        win = null;
        payout = 0;
        if (insuranceTaken) {
          insurancePayout = amount;
          user.balance += insurancePayout * 2; // Insurance pays 2:1
        }
      } else {
        // Player wins with natural blackjack, 3:2 payout (house edge applied)
        win = true;
        payout = Math.floor(amount * 1.5 * HOUSE_EDGE); // 3:2 payout, house edge
        if (insuranceTaken) {
          insurancePayout = 0;
        }
      }
      finished = true;
    }

    if (finished) {
      if (win === true) {
        // For natural blackjack, payout already includes bet + winnings
        if (playerValue === 21 && playerHand.length === 2 && !(dealerFullValue === 21 && dealerHand.length === 2)) {
          user.balance += amount + payout; // Return bet + 3:2 winnings (house edge applied)
        } else {
          user.balance += betForResult + Math.floor(betForResult * HOUSE_EDGE); // Standard win
        }
      } else if (win === null) {
        payout = 0;
        user.balance += amount; // Refund bet on draw
      } else if (win === false) {
        payout = 0; // Already deducted at start
      }
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
      let finalEmbed = new EmbedBuilder()
        .setTitle("🃏 Blackjack")
        .setColor(
          win === true ? 0x41fb2e : win === false ? 0xff0000 : 0xffff00
        )
        .setDescription(`Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${handValue(playerHand)})\nDealer's hand: ${dealerHand.map(renderCard).join(" ")} (Value: ${handValue(dealerHand)})`)
        .addFields(
          { name: win === true ? "Blackjack! You Win!" : win === false ? "Both Blackjack! Draw" : "Draw", value: resultField, inline: false },
          { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
          { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
        )
        .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setImage(
          win === true
            ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless"
            : win === false
              ? "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless"
              : "https://media.discordapp.net/attachments/1374310263003807778/1388826613483044924/YOU_WIN_2.png?ex=68626513&is=68611393&hm=33806f5a224060dea92fe4e17fdbd919a5ece77882aa5d24ced8826f1a99785f&=&format=webp&quality=lossless"
        );
      if (insuranceTaken) {
        finalEmbed.addFields({ name: "Insurance", value: insurancePayout > 0 ? `You won insurance: **+${insurancePayout} ${currency}**` : "Insurance lost.", inline: false });
      }
      finalEmbed.setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
      await interaction.editReply({ embeds: [finalEmbed], components: [], content: null });
      return;
    }
    await interaction.editReply({ embeds: [embed], components: [row], content: null });

    // Await user interaction for hit/stand/double/split
    let collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && ["hit", "stand", "double", "split"].includes(i.customId),
      time: 30000
    });
    collector.on("collect", async i => {
      // Always check if user can afford double down at the moment of click
      if (i.customId === "double" && !splitActive && playerHand.length === 2) {
        // Fetch latest user balance from DB to prevent exploits
        const freshUser = await User.findOne({ userId });
        if (!freshUser || freshUser.balance < amount) {
          await i.reply({ content: "❌ Not enough balance to double down.", ephemeral: true });
          return;
        }
        doubleDown = true;
        freshUser.balance -= amount;
        if (freshUser.balance < 0) freshUser.balance = 0;
        await freshUser.save();
        user.balance = freshUser.balance; // keep in-memory value in sync
        playerHand.push(drawFromDeck());
        playerValue = handValue(playerHand);
        let dealerVisibleValue = handValue([dealerHand[0]]);
        embed.setDescription(`You doubled down! Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${playerValue})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
        row = getActionRow();
        await i.update({ embeds: [embed], components: [row], content: null });
        finished = true;
        collector.stop("double");
        return;
      }
      if (i.customId === "split") {
        let canSplit = playerHand[0].rank === playerHand[1].rank && playerHand.length === 2 && !splitActive;
        if (!canSplit) return;
        
        // Fetch latest user balance from DB to prevent exploits
        const freshUser = await User.findOne({ userId });
        if (!freshUser || freshUser.balance < amount) {
          await i.reply({ content: "❌ Not enough balance to split.", ephemeral: true });
          return;
        }
        freshUser.balance -= amount;
        await freshUser.save();
        user.balance = freshUser.balance; // keep in-memory value in sync
        splitActive = true;
        splitHands = [
          [playerHand[0], drawFromDeck()],
          [playerHand[1], drawFromDeck()]
        ];
        splitBets = [amount, amount];
        splitResults = [null, null];
        splitIndex = 0;
        embed.setDescription(`Split! Playing hand 1: ${splitHands[0].map(renderCard).join(" ")} (Value: ${handValue(splitHands[0])})\nDealer shows: ${renderCard(dealerHand[0])}`);
        row = getActionRow();
        await i.update({ embeds: [embed], components: [row] });
        return;
      }
      if (splitActive) {
        // Play out split hands one by one
        let hand = splitHands[splitIndex];
        if (i.customId === "hit") {
          hand.push(drawFromDeck());
          let dealerVisibleValue = handValue([dealerHand[0]]);
          embed.setDescription(`Split! Playing hand ${splitIndex + 1}: ${hand.map(renderCard).join(" ")} (Value: ${handValue(hand)})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
          let splitRow = getActionRow();
          await i.update({ embeds: [embed], components: [splitRow], content: null });
          if (handValue(hand) > 21) {
            splitResults[splitIndex] = "bust";
            splitIndex++;
            
            // Check if we need to move to next hand or finish all hands
            if (splitIndex >= splitHands.length) {
              collector.stop("splitdone");
            } else {
              // Update description for next hand
              let dealerVisibleValue = handValue([dealerHand[0]]);
              embed.setDescription(`Split! Playing hand ${splitIndex + 1}: ${splitHands[splitIndex].map(renderCard).join(" ")} (Value: ${handValue(splitHands[splitIndex])})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
              let splitRow = getActionRow();
              await i.update({ embeds: [embed], components: [splitRow], content: null });
            }
          }
        } else if (i.customId === "stand") {
          splitResults[splitIndex] = "stand";
          splitIndex++;
        }
        
        // Check if we need to move to next hand or finish all hands
        if (splitIndex >= splitHands.length) {
          // All hands completed, stop collector
          collector.stop("splitdone");
        } else {
          // Update description for next hand
          let dealerVisibleValue = handValue([dealerHand[0]]);
          embed.setDescription(`Split! Playing hand ${splitIndex + 1}: ${splitHands[splitIndex].map(renderCard).join(" ")} (Value: ${handValue(splitHands[splitIndex])})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
          let splitRow = getActionRow();
          await i.update({ embeds: [embed], components: [splitRow], content: null });
        }
        return;
      }
      // Normal (non-split) play
      if (i.customId === "hit") {
        playerHand.push(drawFromDeck());
        playerValue = handValue(playerHand);
        let dealerVisibleValue = handValue([dealerHand[0]]);
        embed.setDescription(`Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${playerValue})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
        row = getActionRow();
        await i.update({ embeds: [embed], components: [row], content: null });
        if (playerValue > 21) {
          finished = true;
          playerBusted = true;
          collector.stop("bust");
        }
      } else if (i.customId === "stand") {
        finished = true;
        let dealerVisibleValue = handValue([dealerHand[0]]);
        embed.setDescription(`Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${playerValue})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
        row = getActionRow();
        await i.update({ embeds: [embed], components: [row], content: null });
        collector.stop("stand");
      }
      if (i.customId === "double" && !splitActive && playerHand.length === 2 && !doubleDown) {
        // Fetch latest user balance from DB to prevent exploits
        const freshUser = await User.findOne({ userId });
        if (!freshUser || freshUser.balance < amount) {
          await i.reply({ content: "❌ Not enough balance to double down.", ephemeral: true });
          return;
        }
        doubleDown = true;
        freshUser.balance -= amount;
        if (freshUser.balance < 0) freshUser.balance = 0;
        await freshUser.save();
        user.balance = freshUser.balance; // keep in-memory value in sync
        playerHand.push(drawFromDeck());
        playerValue = handValue(playerHand);
        let dealerVisibleValue = handValue([dealerHand[0]]);
        embed.setDescription(`You doubled down! Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${playerValue})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
        row = getActionRow();
        await i.update({ embeds: [embed], components: [row], content: null });
        finished = true;
        collector.stop("double");
        return;
      }
    });
    await new Promise(res => collector.once("end", res));
    // Disable buttons after game ends
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("double").setLabel("Double Down").setStyle(ButtonStyle.Danger).setDisabled(true),
      new ButtonBuilder().setCustomId("split").setLabel("Split").setStyle(ButtonStyle.Success).setDisabled(true)
    );

    // Dealer's turn - play normally for both regular and split games
    dealerValue = handValue(dealerHand);
    while (dealerValue < 17) {
      dealerHand.push(drawFromDeck());
      dealerValue = handValue(dealerHand);
    }
    // Result logic (after dealer's turn)
    if (splitActive) {
      // Handle split hands results
      let totalWinnings = 0;
      let totalLosses = 0;
      let hand1Result, hand2Result;
      
      // Calculate result for each hand
      for (let i = 0; i < splitHands.length; i++) {
        let handVal = handValue(splitHands[i]);
        let bet = splitBets[i];
        
        if (handVal > 21) {
          // Hand busted - loss
          totalLosses += bet;
          if (i === 0) hand1Result = "bust";
          else hand2Result = "bust";
        } else if (dealerValue > 21 || handVal > dealerValue) {
          // Hand wins
          let winnings = Math.floor(bet * HOUSE_EDGE);
          user.balance += bet + winnings; // Return bet + winnings
          totalWinnings += winnings;
          if (i === 0) hand1Result = "win";
          else hand2Result = "win";
        } else if (handVal === dealerValue) {
          // Push - refund bet
          user.balance += bet;
          if (i === 0) hand1Result = "draw";
          else hand2Result = "draw";
        } else {
          // Hand loses
          totalLosses += bet;
          if (i === 0) hand1Result = "lose";
          else hand2Result = "lose";
        }
      }
      
      // XP for split hands
      let xpGain = 10;
      if (totalWinnings > 0) user.xp += xpGain * 2;
      else user.xp += xpGain;
      
      // Level up logic
      const nextLevelXp = user.level * 100;
      if (user.xp >= nextLevelXp) {
        user.level += 1;
        user.xp = user.xp - nextLevelXp;
      }
      
      await user.save();
      
      // Bet history for split
      const Bet = require("../../models/Bet");
      await Bet.create({
        userId,
        game: "blackjack",
        amount: amount * 2, // Total amount bet (both hands)
        result: totalWinnings > totalLosses ? "win" : totalWinnings === totalLosses ? "draw" : "lose",
        payout: totalWinnings - totalLosses,
        details: { splitHands, dealerHand, hand1Result, hand2Result },
      });
      
      // Create split results embed
      let netResult = totalWinnings - totalLosses;
      let resultField = netResult > 0 ? `**+${netResult} ${currency}**` : 
                       netResult < 0 ? `**${netResult} ${currency}**` : "No change";
      
      let finalEmbed = new EmbedBuilder()
        .setTitle("🃏 Blackjack - Split Results")
        .setColor(netResult > 0 ? 0x41fb2e : netResult < 0 ? 0xff0000 : 0xffff00)
        .setDescription(
          `**Hand 1:** ${splitHands[0].map(renderCard).join(" ")} (Value: ${handValue(splitHands[0])}) - ${hand1Result}\n` +
          `**Hand 2:** ${splitHands[1].map(renderCard).join(" ")} (Value: ${handValue(splitHands[1])}) - ${hand2Result}\n` +
          `**Dealer:** ${dealerHand.map(renderCard).join(" ")} (Value: ${dealerValue})`
        )
        .addFields(
          { name: "Net Result", value: resultField, inline: false },
          { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
          { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
        )
        .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setImage(
          netResult > 0
            ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless"
            : netResult < 0
              ? "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless"
              : "https://media.discordapp.net/attachments/1374310263003807778/1388826613483044924/YOU_WIN_2.png?ex=68626513&is=68611393&hm=33806f5a224060dea92fe4e17fdbd919a5ece77882aa5d24ced8826f1a99785f&=&format=webp&quality=lossless"
        );
      
      await interaction.editReply({ embeds: [finalEmbed], components: [disabledRow], content: null });
      return;
    }
    
    // Regular (non-split) game result logic
    let betForResult = doubleDown ? amount * 2 : amount;
    if (playerValue > 21) {
      win = false;
      payout = -betForResult;
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      win = true;
      payout = Math.floor(betForResult * HOUSE_EDGE); // Just the winnings
      user.balance += betForResult + payout; // Return bet + winnings
    } else if (playerValue === dealerValue) {
      win = null;
      payout = 0;
      user.balance += betForResult; // Refund bet on draw
    } else {
      win = false;
      payout = -betForResult;
    }
    
    if (user.balance < 0) user.balance = 0;
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
    // Final embed for regular games
    let resultField;
    if (win === true) resultField = `**+${payout} ${currency}**`;
    else if (win === false) resultField = `**-${Math.abs(payout)} ${currency}**`;
    else resultField = "No change (draw)";
    let finalEmbed = new EmbedBuilder()
      .setTitle("🃏 Blackjack")
      .setColor(
        win === true ? 0x41fb2e : win === false ? 0xff0000 : 0xffff00
      )
      .setDescription(`Your hand: ${playerHand.map(renderCard).join(" ")} (Value: ${handValue(playerHand)})\nDealer's hand: ${dealerHand.map(renderCard).join(" ")} (Value: ${handValue(dealerHand)})`)
      .addFields(
        { name: win === true ? "You Won!" : win === false ? "You Lost" : "Draw", value: resultField, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setImage(
        win === true
          ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless"
          : win === false
            ? "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless"
            : "https://media.discordapp.net/attachments/1374310263003807778/1388826613483044924/YOU_WIN_2.png?ex=68626513&is=68611393&hm=33806f5a224060dea92fe4e17fdbd919a5ece77882aa5d24ced8826f1a99785f&=&format=webp&quality=lossless"
      );
    if (doubleDown) {
      finalEmbed.addFields({ name: "Double Down", value: `You doubled your bet to **${betForResult} ${currency}**.`, inline: false });
    }
    await interaction.editReply({ embeds: [finalEmbed], components: [disabledRow], content: null });
  },
};
