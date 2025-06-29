const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hilo")
    .setDescription("Play HiLo! Guess if the next number is higher or lower. Bet your coins!")
    .addStringOption(option =>
      option.setName("guess")
        .setDescription("Will the next number be higher or lower?")
        .setRequired(true)
        .addChoices(
          { name: "Higher", value: "higher" },
          { name: "Lower", value: "lower" }
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
    let guess = interaction.options.getString("guess");
    let user = await User.findOne({ userId });
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseFloat(amountInput);
    }
    if (!amount || amount <= 0) {
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: "🚫 Invalid bet amount.", ephemeral: true });
      } else {
        return interaction.reply({ content: "🚫 Invalid bet amount.", ephemeral: true });
      }
    }
    if (user.balance < amount) {
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: `❌ You don't have enough ${currency}.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ You don't have enough ${currency}.`, ephemeral: true });
      }
    }
    if (user.banned) {
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
      } else {
        return interaction.reply({ content: "🚫 You are banned from using economy commands.", ephemeral: true });
      }
    }
    // Cooldown (10s)
    const cd = checkCooldown(userId, "hilo", 10);
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
    // Fetch probability from config (default 50%)
    let winProbability = 50;
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.probabilities && typeof config.probabilities.hilo === "number") {
        winProbability = config.probabilities.hilo;
      }
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1388538675465424967> Drawing a card...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));
    // HiLo logic: pick a number 1-9, show it, then pick next number 1-9
    const first = Math.floor(Math.random() * 9) + 1;
    let second;
    do {
      second = Math.floor(Math.random() * 9) + 1;
    } while (second === first); // ensure not the same
    let result;
    // Determine win using probability
    const userWins = Math.random() * 100 < winProbability;
    if (userWins) {
      result = "win";
    } else {
      result = "lose";
    }
    // House edge: 5% reduction in payout
    let payout;
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
    if (result === "win") {
      user.xp += xpGain * 2;
      resultText = `You win! You gained **+${payout} ${currency}**.`;
      color = 0x00ff99;
    } else if (result === "draw") {
      user.xp += xpGain;
      resultText = `It's a draw! You get your bet back: **+${amount} ${currency}**.`;
      color = 0xffff00;
    } else {
      user.xp += xpGain;
      resultText = `You lose! You lost **-${amount} ${currency}**.`;
      color = 0xff0000;
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
      game: "hilo",
      amount,
      result,
      payout: userWins ? payout : -amount,
      details: { guess, first, second },
    });
    const embed = new EmbedBuilder()
      .setTitle("🔢 HiLo")
      .setColor(
        result === "win" ? 0x41fb2e : result === "lose" ? 0xff0000 : 0xffff00
      )
      .setDescription(`First number: **${first}**\nSecond number: **${second}**`)
      .addFields(
        { name: "Your Guess", value: guess.charAt(0).toUpperCase() + guess.slice(1), inline: true },
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
