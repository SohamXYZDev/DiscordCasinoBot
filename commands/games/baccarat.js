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

// Add a dictionary for custom Discord emojis (same as blackjack)
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
  return customEmojis[cardKey] || `${card.rank}${card.suit}`;
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
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet (number or 'all')")
        .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    let amountInput = interaction.options.getString("amount");
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseFloat(amountInput);
    }
    let user = await User.findOne({ userId });
    // If user typed 'all' but has 0 balance, treat as invalid
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
      return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
    }
    // Cooldown (10s)
    const cd = checkCooldown(userId, "baccarat", 10);
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
      if (config && config.currency) currency = config.currency;
    }
    // Game disabled check
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("baccarat")) {
        if (interaction.replied || interaction.deferred) {
          return interaction.editReply({ content: "🚫 The Baccarat game is currently disabled on this server.", ephemeral: true });
        } else {
          return interaction.reply({ content: "🚫 The Baccarat game is currently disabled on this server.", ephemeral: true });
        }
      }
    }
    // Anticipation message
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: "<a:loading:1388538675465424967> Dealing baccarat cards...", ephemeral: false });
    } else {
      await interaction.reply({ content: "<a:loading:1388538675465424967> Dealing baccarat cards...", ephemeral: false });
    }
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
    let profit = 0;
    if (betOn === winner) {
      if (winner === "player") {
        profit = Math.floor(amount * (1 - houseEdge / 100)); // 1.90x total, 0.90x profit if 5% edge
      } else if (winner === "banker") {
        profit = Math.floor(amount * (1 - (houseEdge + 5) / 100)); // 1.85x total, 0.85x profit if 5% edge
      } else if (winner === "tie") {
        profit = Math.floor(amount * (7.5 - (7.5 * houseEdge / 100))); // 7.5x total, house edge applied
      }
      payout = profit;
      user.balance += amount + profit; // Return bet + profit
    } else if (winner === "tie") {
      payout = 0;
      user.balance += amount; // Refund bet on draw
    } else {
      payout = 0; // Already deducted at start
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
      .setColor(
        winner === betOn ? 0x41fb2e : winner === "tie" ? 0xffff00 : 0xff0000
      )
      .setDescription(
        `You bet on: **${betOn.charAt(0).toUpperCase() + betOn.slice(1)}**\n\n` +
        `Player: ${playerHand.map(renderCard).join(" ")} (Value: ${playerValue})\n` +
        `Banker: ${bankerHand.map(renderCard).join(" ")} (Value: ${bankerValue})\n` +
        `Result: **${winner.charAt(0).toUpperCase() + winner.slice(1)}**`
      )
      .addFields(
        { name: betOn === winner ? "You Won!" : "You Lost", value: resultField, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setImage(
        winner === betOn
          ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless"
          : winner === "tie"
            ? "https://media.discordapp.net/attachments/1374336171341254741/1384893853445918812/YOU_WIN_2.png?ex=68541668&is=6852c4e8&hm=cd5a689a50ab22dc57ee9e5b4c2f97bc2eb54c6515a9bde2052fceac3224e19e&=&format=webp&quality=lossless"
            : "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless"
      );
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
