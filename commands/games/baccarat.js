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
            ? "https://media.discordapp.net/attachments/1374310263003807778/1388826613483044924/YOU_WIN_2.png?ex=68626513&is=68611393&hm=33806f5a224060dea92fe4e17fdbd919a5ece77882aa5d24ced8826f1a99785f&=&format=webp&quality=lossless"
            : "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless"
      );
    await interaction.editReply({ embeds: [embed], content: null });
  },
};
