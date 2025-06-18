const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getUserBalance } = require("../../utils/economy");

// Crypto options (same as deposit)
const CRYPTO_OPTIONS = [
  { label: "ETH", value: "eth" },
  { label: "BTC", value: "btc" },
  { label: "SOL", value: "sol" },
  { label: "LTC", value: "ltc" },
  { label: "USDC (ETH)", value: "usdc" },
  { label: "USDT (ETH)", value: "usdt" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Request a withdrawal of your chips to crypto.")
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("How many chips do you want to withdraw?")
        .setRequired(true)
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    const amount = interaction.options.getInteger("amount");
    // Check user balance
    const balance = await getUserBalance(user.id);
    if (amount > balance) {
      return interaction.reply({ content: `🚫 You do not have enough chips to withdraw. Your balance: **${balance}**`, ephemeral: true });
    }
    // Check for existing ticket
    const existing = guild.channels.cache.find(
      c => c.name.startsWith("withdraw-") && c.topic === `Withdraw ticket for ${user.id}`
    );
    if (existing) {
      return interaction.reply({ content: `🚫 You already have a withdraw ticket: <#${existing.id}>`, ephemeral: true });
    }
    // Find next ticket number
    const ticketCount = guild.channels.cache.filter(c => c.name.startsWith("withdraw-")).size + 1;
    const channelName = `withdraw-${ticketCount.toString().padStart(4, "0")}`;
    // Create private channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Withdraw ticket for ${user.id}`,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ],
    });
    // Ephemeral reply with channel link
    await interaction.reply({ content: `✅ Your withdraw ticket has been made at <#${channel.id}>`, ephemeral: true });
    // Embed and dropdown
    const embed = new EmbedBuilder()
      .setTitle("Withdraw Ticket")
      .setDescription(`How many chips do you want to withdraw?\n\n**Amount:** ${interaction.options.getInteger("amount")}\n\nSelect the crypto you want to withdraw to:`)
      .setColor(0x41fb2e);
    const select = new StringSelectMenuBuilder()
      .setCustomId("withdraw-crypto-select")
      .setPlaceholder("Select a cryptocurrency...")
      .addOptions(CRYPTO_OPTIONS.map(opt => ({ label: opt.label, value: opt.value })));
    const row = new ActionRowBuilder().addComponents(select);
    await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
  },
  async handleComponent(interaction) {
    if (interaction.customId !== "withdraw-crypto-select") return;
    const selected = interaction.values[0];
    const crypto = CRYPTO_OPTIONS.find(opt => opt.value === selected);
    if (!crypto) return interaction.reply({ content: "Unknown crypto.", ephemeral: true });
    await interaction.reply({ content: `You selected **${crypto.label}** for your withdrawal. Please wait for an admin to process your request.` });
  },
};
