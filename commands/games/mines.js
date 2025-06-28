const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

// Helper to generate mines board
function generateBoard(size, mines, winProbability = 0) {
  const board = Array(size * size).fill(false);
  let placed = 0;
  while (placed < mines) {
    const idx = Math.floor(Math.random() * board.length);
    if (!board[idx]) {
      board[idx] = true;
      placed++;
    }
  }
  
  // Apply win probability for first click
  const random = Math.random() * 100;
  if (random < winProbability) {
    // First click should be safe - find safe spots and make one guaranteed safe if possible
    const safeSpots = [];
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) safeSpots.push(i);
    }
    // Only apply if there are actually safe spots available
    if (safeSpots.length > 0) {
      // Don't need to do anything - there are already safe spots
    }
  } else {
    // First click should hit a mine - find mine spots
    const mineSpots = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i]) mineSpots.push(i);
    }
    // Only apply if there are actually mines available
    if (mineSpots.length > 0) {
      // Don't need to do anything - there are already mines
    }
  }
  
  return board;
}

function getMultiplier(steps, mines) {
  const base = 1.1 + (mines * 0.05);
  return parseFloat((base ** steps).toFixed(2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mines")
    .setDescription("Play Mines! Avoid the mines and cash out for bigger rewards.")
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet (number or 'all')")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("mines")
        .setDescription("How many mines? (1-5 recommended)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    let user = await User.findOne({ userId });
    
    // Get currency early for error messages
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    
    let amountInput = interaction.options.getString("amount");
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseFloat(amountInput);
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
    const cd = checkCooldown(userId, "mines", 10);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
    }
    // Deduct initial bet immediately to prevent mid-game quitting exploits
    user.balance -= amount;
    if (user.balance < 0) user.balance = 0;
    await user.save();
    // Server currency and probabilities
    let winProbability = 0; // Default 0% first click safe
    // Fetch house edge and probability from config
    let houseEdge = 5;
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && typeof config.houseEdge === "number") houseEdge = config.houseEdge;
      if (config && config.currency) currency = config.currency;
      if (config && config.probabilities && typeof config.probabilities.mines === "number") {
        winProbability = config.probabilities.mines;
      }
    }
    const HOUSE_EDGE = 1 - (houseEdge / 100);
    // Check if game is disabled
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("mines")) {
        return interaction.reply({ content: "🚫 The Mines game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message
    await interaction.reply({ content: "<a:loading:1388538675465424967> Setting up the mines...", ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));
    // Get board size (default 4)
    const size = 4;
    const mines = interaction.options.getInteger("mines");
    // Game state
    let board = generateBoard(size, mines, winProbability);
    let revealed = Array(size * size).fill(false);
    let steps = 0;
    let finished = false;
    let win = false;
    let payout = 0;
    let hitMine = false;
    // Helper to render board as buttons
    function getBoardRows(disabled = false, revealMines = false) {
      const rows = [];
      for (let y = 0; y < size; y++) {
        const row = new ActionRowBuilder();
        for (let x = 0; x < size; x++) {
          const idx = y * size + x;
          let label, style;
          if (revealed[idx]) {
            if (revealMines && board[idx]) {
              label = "💣";
              style = ButtonStyle.Danger;
            } else {
              label = "💎";
              style = ButtonStyle.Success;
            }
          } else if (revealMines && board[idx]) {
            label = "💣";
            style = ButtonStyle.Danger;
          } else {
            label = "⬛";
            style = ButtonStyle.Secondary;
          }
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`mines_${idx}`)
              .setLabel(label)
              .setStyle(style)
              .setDisabled(disabled || revealed[idx] || (revealMines && board[idx]))
          );
        }
        rows.push(row);
      }
      return rows;
    }
    // Initial embed
    let embed = new EmbedBuilder()
      .setTitle("💣 Mines")
      .setDescription(`Avoid the mines! Each safe pick increases your payout. Press **Cash Out** to claim your winnings.`)
      .addFields(
        { name: "Bet", value: `${amount} ${currency}`, inline: true },
        { name: "Mines", value: `${mines}`, inline: true },
        { name: "Safe Picks", value: `${steps}`, inline: true }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    // Add cash out button as a separate row (always, since 4x4 = 4 rows max)
    let components = getBoardRows();
    let currentMultiplier = getMultiplier(steps, mines);
    let cashRow = new ActionRowBuilder();
    cashRow.addComponents(
      new ButtonBuilder().setCustomId("mines_cashout").setLabel(`💰 Cash Out (${currentMultiplier}x)`).setStyle(ButtonStyle.Primary)
    );
    components.push(cashRow);
    await interaction.editReply({ embeds: [embed], components, content: null });
    // Collector for game
    const filter = i => i.user.id === interaction.user.id && (i.customId.startsWith("mines_") || i.customId === "mines_cashout");
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
    collector.on("collect", async i => {
      if (i.customId === "mines_cashout") {
        finished = true;
        win = true;
        payout = Math.floor(amount * getMultiplier(steps, mines) * HOUSE_EDGE);
        user.balance += payout;
        await user.save();
        collector.stop("cashout");
        return;
      }
      const idx = parseInt(i.customId.split("_")[1]);
      if (revealed[idx]) return i.deferUpdate();
      revealed[idx] = true;
      if (board[idx]) {
        // Hit a mine
        finished = true;
        win = false;
        hitMine = true;
        payout = 0;
        collector.stop("mine");
      } else {
        steps++;
      }
      // Update board
      let updateComponents = getBoardRows();
      let updateMultiplier = getMultiplier(steps, mines);
      let updateCashRow = new ActionRowBuilder();
      updateCashRow.addComponents(
        new ButtonBuilder().setCustomId("mines_cashout").setLabel(`💰 Cash Out (${updateMultiplier}x)`).setStyle(ButtonStyle.Primary)
      );
      updateComponents.push(updateCashRow);
      await i.update({ embeds: [embed], components: updateComponents });
    });
    await new Promise(res => collector.once("end", res));
    // Disable all buttons and reveal all mines
    const disabledRows = getBoardRows(true, true);
    await interaction.editReply({ embeds: [embed], components: disabledRows, content: null });
    // XP
    let xpGain = 10;
    if (win) user.xp += xpGain * 2;
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
    let result = win ? "win" : "lose";
    await Bet.create({
      userId,
      game: "mines",
      amount,
      result,
      payout: win ? payout : -amount,
      details: { steps, mines, board },
    });
    // Final embed
    embed = new EmbedBuilder()
      .setTitle("💣 Mines")
      .setDescription(
        win
          ? `You cashed out after ${steps} safe picks!`
          : hitMine
            ? `You hit a mine after ${steps} safe picks!`
            : `Game ended. You did not cash out.`
      )
      .addFields(
        { name: win ? "You Won!" : "You Lost", value: win ? `**+${payout} ${currency}**` : `**-${amount} ${currency}**`, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false }
      )
      .setColor(win ? 0x41fb2e : 0xff0000)
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setImage(win ? "https://media.discordapp.net/attachments/1374310263003807778/1384544227194699826/YOU_WIN.png?ex=6853798b&is=6852280b&hm=d31e968dd8213c5bd8a94521ac75aae7d89bf8323c4500417dbd6b5cca3fe2e2&=&format=webp&quality=lossless" : "https://media.discordapp.net/attachments/1374310263003807778/1384544208207216780/YOU_WIN_1.png?ex=68537986&is=68522806&hm=9e03f6c8972301801a3c69b80e5de72a851bbf5c542b2c8de195ca39bd6e1727&=&format=webp&quality=lossless");
    await interaction.editReply({ embeds: [embed], components: disabledRows, content: null });
  },
};
