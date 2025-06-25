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
  "A♠": "<:spades1:1379814832873803787>",
  "2♠": "<:spades2:1379814835516346399>",
  "3♠": "<:spades3:1379814839052140586>",
  "4♠": "<:spades4:1379814842415845559>",
  "5♠": "<:spades5:1379814845012250694>",
  "6♠": "<:spades6:1379814847306399927>",
  "7♠": "<:spades7:1379814850099941416>",
  "8♠": "<:spades8:1379814853002399774>",
  "9♠": "<:spades9:1379814856458244247>",
  "10♠": "<:spades10:1379814859507630091>",
  "J♠": "<:spadesj:1379814862045315133>",
  "Q♠": "<:spadesq:1379814989388578967>",
  "K♠": "<:spadesk:1379814864796516412>",
  "A♥": "<:hearts1:1379815423511363667>",
  "2♥": "<:hearts2:1379815426061762570>",
  "3♥": "<:hearts3:1379815428695658536>",
  "4♥": "<:hearts4:1379815431405178922>",
  "5♥": "<:hearts5:1379815435196829828>",
  "6♥": "<:hearts6:1379815438245957723>",
  "7♥": "<:hearts7:1379815440359886860>",
  "8♥": "<:hearts8:1379815442763223120>",
  "9♥": "<:hearts9:1379815445590179931>",
  "10♥": "<:hearts10:1386688667006795851>",
  "J♥": "<:diamondsj:1379815414653259856>",
  "Q♥": "<:heartsq:1386688669565452419>",
  "K♥": "<:heartsk:1386688498249240596>",
  "A♦": "<:diamonds1:1379815381077725184>",
  "2♦": "<:diamonds2:1379815383799828672>",
  "3♦": "<:diamonds3:1379815386551156877>",
  "4♦": "<:diamonds4:1379815390313578606>",
  "5♦": "<:diamonds5:1379815396852502570>",
  "6♦": "<:diamonds6:1379815400354877581>",
  "7♦": "<:diamonds7:1379815403068457172>",
  "8♦": "<:diamonds8:1379815405568393226>",
  "9♦": "<:diamonds9:1379815408470851654>",
  "10♦": "<:diamonds10:1379815411855523900>",
  "J♦": "<:diamondsj:1379815414653259856>",
  "Q♦": "<:diamondsq:1379815420214775869>",
  "K♦": "<:diamondsk:1379815417412976670>",
  "A♣": "<:clubs1:1379814797377278185>",
  "2♣": "<:clubs2:1379814800514875473>",
  "3♣": "<:clubs3:1379814802855297094>",
  "4♣": "<:clubs4:1379814805526810624>",
  "5♣": "<:clubs5:1379814807926214686>",
  "6♣": "<:clubs6:1379814810429947934>",
  "7♣": "<:clubs7:1379814812975890503>",
  "8♣": "<:clubs8:1379814815266242561>",
  "9♣": "<:clubs9:1379814818013384806>",
  "10♣": "<:clubs10:1379814820907450390>",
  "J♣": "<:clubsj:1379814824799764571>",
  "Q♣": "<:clubsq:1379814830470332446>",
  "K♣": "<:clubsk:1379814827039395862>"
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
    await interaction.reply({ content: "<a:loading:1376139232090914846> Dealing cards..." });
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
    if (playerValue === 21 && playerHand.length === 2) {
      // Player has natural blackjack (Ace + 10-value card)
      const dealerFullValue = handValue(dealerHand);
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
              : "https://media.discordapp.net/attachments/1374336171341254741/1384893853445918812/YOU_WIN_2.png?ex=68541668&is=6852c4e8&hm=cd5a689a50ab22dc57ee9e5b4c2f97bc2eb54c6515a9bde2052fceac3224e19e&=&format=webp&quality=lossless"
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
      if (i.customId === "split" && canSplit && !splitActive) {
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
          }
        } else if (i.customId === "stand") {
          splitResults[splitIndex] = "stand";
          splitIndex++;
          let dealerVisibleValue = handValue([dealerHand[0]]);
          embed.setDescription(`Split! Playing hand ${splitIndex}: ${splitHands[splitIndex-1].map(renderCard).join(" ")} (Value: ${handValue(splitHands[splitIndex-1])})\nDealer shows: ${renderCard(dealerHand[0])} (Value: ${dealerVisibleValue})`);
          let splitRow = getActionRow();
          await i.update({ embeds: [embed], components: [splitRow], content: null });
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

    // Dealer's turn
    dealerValue = handValue(dealerHand);
    while ((!playerBusted && !splitActive) && dealerValue < 17) {
      dealerHand.push(drawFromDeck());
      dealerValue = handValue(dealerHand);
    }
    // Result logic (after dealer's turn)
    let betForResult = doubleDown ? amount * 2 : amount;
    if (playerValue > 21) {
      win = false;
      payout = -betForResult;
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      win = true;
      payout = betForResult + Math.floor(betForResult * HOUSE_EDGE); // Return original bet + profit
    } else if (playerValue === dealerValue) {
      win = null;
      payout = 0;
      user.balance += betForResult; // Refund bet on draw
    } else {
      win = false;
      payout = -betForResult;
    }
    if (win === true) user.balance += betForResult + Math.floor(betForResult * HOUSE_EDGE);
    // Do NOT deduct again on loss, already deducted at start
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
            : "https://media.discordapp.net/attachments/1374336171341254741/1384893853445918812/YOU_WIN_2.png?ex=68541668&is=6852c4e8&hm=cd5a689a50ab22dc57ee9e5b4c2f97bc2eb54c6515a9bde2052fceac3224e19e&=&format=webp&quality=lossless"
      );
    if (doubleDown) {
      finalEmbed.addFields({ name: "Double Down", value: `You doubled your bet to **${betForResult} ${currency}**.`, inline: false });
    }
    await interaction.editReply({ embeds: [finalEmbed], components: [disabledRow], content: null });
  },
};
