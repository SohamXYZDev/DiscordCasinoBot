const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const User = require("../../models/User");
const GuildConfig = require("../../models/GuildConfig");
const { checkCooldown } = require("../../utils/cooldown");

// Helper to generate a random path of safe/unsafe for the tower
function generateTower(height, width, dragonsPerRow) {
  // Each row has n unique dragons, rest are safe
  const tower = [];
  for (let y = 0; y < height; y++) {
    const row = Array(width).fill(false);
    let dragonIndices = [];
    while (dragonIndices.length < dragonsPerRow) {
      let idx = Math.floor(Math.random() * width);
      if (!dragonIndices.includes(idx)) dragonIndices.push(idx);
    }
    for (const idx of dragonIndices) row[idx] = true;
    tower.push(row);
  }
  return tower;
}

function getMultiplierDragon(level, width, dragonsPerRow) {
  // Multiplier increases with each level climbed, more dragons = higher risk = higher reward
  // Example: 1.5x for first, up to ~10x for top, scale with dragons
  const base = 1.3 + (width * 0.1) + (dragonsPerRow - 1) * 0.2;
  return parseFloat((base ** level).toFixed(2));
}

const DIFFICULTY_SETTINGS = {
  easy:   { height: 9, width: 4, dragons: 1, label: 'Easy' },
  medium: { height: 9, width: 3, dragons: 1, label: 'Medium' },
  hard:   { height: 9, width: 2, dragons: 1, label: 'Hard' },
  expert: { height: 9, width: 3, dragons: 2, label: 'Expert' },
  master: { height: 9, width: 4, dragons: 3, label: 'Master' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dragontower")
    .setDescription("Climb the Dragon Tower! Pick a safe tile each floor and cash out for bigger rewards.")
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How many coins to bet (number or 'all')")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("difficulty")
        .setDescription("Choose a difficulty mode")
        .setRequired(true)
        .addChoices(
          { name: "Easy", value: "easy" },
          { name: "Medium", value: "medium" },
          { name: "Hard", value: "hard" },
          { name: "Expert", value: "expert" },
          { name: "Master", value: "master" }
        )
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    let amountInput = interaction.options.getString("amount");
    // Accept 'all' (case-insensitive) as all-in bet
    let user = await User.findOne({ userId });
    let amount;
    if (typeof amountInput === "string" && amountInput.toLowerCase() === "all") {
      amount = user.balance;
    } else {
      amount = parseInt(amountInput);
    }
    const difficulty = interaction.options.getString("difficulty");
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const width = settings.width;
    const height = settings.height;
    const dragonsPerRow = settings.dragons;
    if (!user) {
      return interaction.reply({ content: "❌ You don't have an account.", ephemeral: true });
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
    // Cooldown (10s)
    const cd = checkCooldown(userId, "dragontower", 10);
    if (cd > 0) {
      return interaction.reply({ content: `⏳ You must wait ${cd}s before playing again.`, ephemeral: true });
    }
    // Deduct initial bet immediately to prevent mid-game quitting exploits
    user.balance -= amount;
    if (user.balance < 0) user.balance = 0;
    await user.save();
    // Server currency
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }
    // Check if game is disabled in server
    const guildId = interaction.guildId;
    if (guildId) {
      const config = await GuildConfig.findOne({ guildId });
      if (config && config.disabledGames && config.disabledGames.includes("dragontower")) {
        return interaction.reply({ content: "🚫 The Dragon Tower game is currently disabled on this server.", ephemeral: true });
      }
    }
    // Anticipation message
    await interaction.reply({ content: `<a:loading:1376139232090914846> Entering the Dragon Tower... (Difficulty: ${settings.label})`, ephemeral: false });
    await new Promise(res => setTimeout(res, 1200));
    // Game state
    let tower = generateTower(height, width, dragonsPerRow);
    let currentLevel = 0;
    let finished = false;
    let win = false;
    let payout = 0;
    let path = [];
    // Helper to render current row as buttons
    function getRowButtons(disabled = false, reveal = false) {
      const row = new ActionRowBuilder();
      for (let x = 0; x < width; x++) {
        let label = reveal && tower[currentLevel] && tower[currentLevel][x] ? "🐉" : "⬛";
        let style = reveal && tower[currentLevel] && tower[currentLevel][x] ? ButtonStyle.Danger : ButtonStyle.Secondary;
        // If this is the picked tile on this floor
        if (path[currentLevel] === x) {
          if (tower[currentLevel][x]) {
            // Picked a dragon, show red
            label = "🐉";
            style = ButtonStyle.Danger;
          } else {
            // Picked a safe tile, show green
            label = "🟩";
            style = ButtonStyle.Success;
          }
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dtower_${x}`)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(disabled || (reveal && tower[currentLevel] && tower[currentLevel][x]))
        );
      }
      return [row];
    }
    // Initial embed
    let embed = new EmbedBuilder()
      .setTitle("🐉 Dragon Tower")
      .setDescription(`Climb the tower! Pick a safe tile on each floor. Press **Cash Out** to claim your winnings.\n**Difficulty:** ${settings.label}`)
      .addFields(
        { name: "Bet", value: `${amount} ${currency}`, inline: true },
        { name: "Floors", value: `${height}`, inline: true },
        { name: "Tiles per Floor", value: `${width}`, inline: true },
        { name: "Dragons per Floor", value: `${dragonsPerRow}`, inline: true },
        { name: "Current Floor", value: `${currentLevel + 1} / ${height}`, inline: true },
        { name: "Safe Picks", value: `${currentLevel}`, inline: true }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    let currentMultiplier = getMultiplierDragon(currentLevel, width, dragonsPerRow);
    let cashRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dtower_cashout").setLabel(`💰 Cash Out (${currentMultiplier}x)`).setStyle(ButtonStyle.Primary)
    );
    await interaction.editReply({ embeds: [embed], components: [...getRowButtons(), cashRow], content: null });
    // Collector for game
    const filter = i => i.user.id === interaction.user.id && (i.customId.startsWith("dtower_") || i.customId === "dtower_cashout");
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
    collector.on("collect", async i => {
      if (i.customId === "dtower_cashout") {
        finished = true;
        win = true;
        payout = Math.floor(amount * getMultiplierDragon(currentLevel, width, dragonsPerRow) * 0.95); // 5% house edge
        user.balance += payout;
        await user.save();
        collector.stop("cashout");
        return;
      }
      const x = parseInt(i.customId.split("_")[1]);
      path[currentLevel] = x;
      if (tower[currentLevel][x]) {
        // Hit a dragon
        finished = true;
        win = false;
        payout = 0;
        collector.stop("dragon");
      } else {
        currentLevel++;
        if (currentLevel >= height) {
          // Reached the top!
          finished = true;
          win = true;
          payout = Math.floor(amount * getMultiplierDragon(currentLevel, width, dragonsPerRow) * 0.95);
          user.balance += payout;
          await user.save();
          collector.stop("top");
          return;
        }
      }
      // Update embed and buttons
      embed.setFields(
        { name: "Bet", value: `${amount} ${currency}`, inline: true },
        { name: "Floors", value: `${height}`, inline: true },
        { name: "Tiles per Floor", value: `${width}`, inline: true },
        { name: "Dragons per Floor", value: `${dragonsPerRow}`, inline: true },
        { name: "Current Floor", value: `${currentLevel + 1} / ${height}`, inline: true },
        { name: "Safe Picks", value: `${currentLevel}`, inline: true }
      );
      let updateMultiplier = getMultiplierDragon(currentLevel, width, dragonsPerRow);
      let updateCashRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("dtower_cashout").setLabel(`💰 Cash Out (${updateMultiplier}x)`).setStyle(ButtonStyle.Primary)
      );
      await i.update({ embeds: [embed], components: [...getRowButtons(), updateCashRow] });
    });
    await new Promise(res => collector.once("end", res));
    // Disable all buttons and reveal dragons on current row
    const disabledRows = getRowButtons(true, true);
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
    await Bet.create({
      userId,
      game: "dragontower",
      amount,
      result: win ? "win" : "lose",
      payout: win ? payout : -amount,
      details: { path, win, height, width, dragonsPerRow, tower, difficulty: settings.label },
    });
    // Final embed
    embed = new EmbedBuilder()
      .setTitle("🐉 Dragon Tower")
      .setDescription(
        win
          ? `You cashed out after ${currentLevel} floors! (Difficulty: ${settings.label})`
          : `You hit a dragon on floor ${currentLevel + 1}! (Difficulty: ${settings.label})`
      )
      .addFields(
        { name: win ? "You Won!" : "You Lost", value: win ? `**+${payout} ${currency}**` : `**-${amount} ${currency}**`, inline: false },
        { name: "Your Balance", value: `${user.balance} ${currency}`, inline: false },
        { name: "XP", value: `${user.xp} / ${user.level * 100} (Level ${user.level})`, inline: false },
        { name: "Dragons per Floor", value: `${dragonsPerRow}`, inline: false }
      )
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed], components: disabledRows, content: null });
  },
};
