const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const HELP_IMAGE = "https://media.discordapp.net/attachments/1374310263003807778/1384544261814489109/Untitled_design_-_2025-06-17T162721.029_1.png?ex=6856c553&is=685573d3&hm=b6976c7cb0dc0a9ee6ceed3c1f3aa022e3b896f8e404c1f793b67ceda4de15f8&=&format=webp&quality=lossless";

const CATEGORIES = [
  {
    label: "Economy",
    value: "economy",
    description: "Balance, deposit, withdraw, give, leaderboard, etc."
  },
  {
    label: "Games",
    value: "games",
    description: "Blackjack, roulette, coinflip, mines, and more."
  },
  {
    label: "Admin",
    value: "admin",
    description: "Admin-only commands for managing the bot."
  }
];

const COMMANDS = {
  economy: [
    { name: "/balance", desc: "Check your balance." },
    { name: "/deposit", desc: "Deposit crypto for chips." },
    { name: "/withdraw", desc: "Withdraw chips to crypto." },
    { name: "/give", desc: "Give chips to another user." },
    { name: "/leaderboard", desc: "View the richest users." },
    { name: "/history", desc: "See your transaction history." },
    { name: "/monthly", desc: "Claim your monthly bonus." },
    { name: "/xpleaderboard", desc: "View the XP leaderboard." },
    { name: "/analytics", desc: "View your game stats." },
  ],
  games: [
    { name: "/blackjack", desc: "Play blackjack." },
    { name: "/roulette", desc: "Play roulette." },
    { name: "/coinflip", desc: "Flip a coin." },
    { name: "/mines", desc: "Play mines." },
    { name: "/dragontower", desc: "Play Dragon Tower." },
    { name: "/hilo", desc: "Play HiLo." },
    { name: "/baccarat", desc: "Play baccarat." },
    { name: "/rps", desc: "Rock Paper Scissors." },
  ],
  admin: [
    { name: "/banuser", desc: "Ban a user from the bot." },
    { name: "/disablegame", desc: "Disable a game." },
    { name: "/enablegame", desc: "Enable a game." },
    { name: "/resetuser", desc: "Reset a user's data." },
    { name: "/setbalance", desc: "Set a user's balance." },
    { name: "/setcurrency", desc: "Set the server currency." },
    { name: "/setedge", desc: "Set the house edge." },
    { name: "/setlogs", desc: "Set the logs channel." },
  ]
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all bot commands and categories interactively."),
  async execute(interaction) {
    // Main help embed
    const embed = new EmbedBuilder()
      .setTitle("DarcoBot Help")
      .setDescription("Select a category below to view its commands.")
      .setImage(HELP_IMAGE)
      .setColor(0x5865f2);
    const select = new StringSelectMenuBuilder()
      .setCustomId("help-category-select")
      .setPlaceholder("Select a command category...")
      .addOptions(CATEGORIES.map(cat => ({
        label: cat.label,
        value: cat.value,
        description: cat.description
      })));
    const row = new ActionRowBuilder().addComponents(select);
    await interaction.reply({ embeds: [embed], components: [row] });
  },
  async handleComponent(interaction) {
    try {
      if (interaction.customId !== "help-category-select") return;
      const selected = interaction.values[0];
      const commands = COMMANDS[selected] || [];
      if (!commands.length) {
        console.error("Unknown category selected:", selected);
        return interaction.reply({ content: "Unknown category.", ephemeral: true });
      }
      // Try update first, fallback to followUp if already replied
      try {
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Commands: ${CATEGORIES.find(c => c.value === selected)?.label || selected}`)
              .setColor(0x5865f2)
              .setDescription(commands.map(cmd => `**${cmd.name}**: ${cmd.desc}`).join("\n"))
          ],
          components: [interaction.message.components[0]],
        });
      } catch (err) {
        console.error("interaction.update failed:", err);
        try {
          await interaction.followUp({
            embeds: [
              new EmbedBuilder()
                .setTitle(`Commands: ${CATEGORIES.find(c => c.value === selected)?.label || selected}`)
                .setColor(0x5865f2)
                .setDescription(commands.map(cmd => `**${cmd.name}**: ${cmd.desc}`).join("\n"))
            ],
            components: [interaction.message.components[0]],
            ephemeral: false
          });
        } catch (err2) {
          console.error("interaction.followUp failed:", err2);
          await interaction.reply({ content: "An error occurred displaying help. Please try again.", ephemeral: true });
        }
      }
    } catch (e) {
      console.error("handleComponent top-level error:", e);
      if (!interaction.replied) {
        await interaction.reply({ content: "An error occurred displaying help. Please try again.", ephemeral: true });
      }
    }
  }
};
