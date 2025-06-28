const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } = require("discord.js");

// Crypto addresses
const CRYPTO_OPTIONS = [
  { label: "ETH", value: "eth", address: "0x1372aE9cE07a158C2896480a2b3aeAFE3d0D2590" },
  { label: "BTC", value: "btc", address: "bc1qujg5wz6vd9c9txfcmyk2n8wj97tw3a0cdchhxn" },
  { label: "SOL", value: "sol", address: "HW3eNL3ohJMfkU3CepDpfoTCSXBtW2omAZfoohZB4DDy" },
  { label: "LTC", value: "ltc", address: "ltc1q7gjdmfpl3y2hwc8s73qjh9m3wh4lhy3j4z4ms9" },
  { label: "USDC (ETH)", value: "usdc", address: "0x1372aE9cE07a158C2896480a2b3aeAFE3d0D2590" },
  { label: "USDT (ETH)", value: "usdt", address: "0x1372aE9cE07a158C2896480a2b3aeAFE3d0D2590" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Create a private deposit ticket to get a crypto address."),
  async execute(interaction) {
    // Check for existing ticket
    const guild = interaction.guild;
    const user = interaction.user;
    const existing = guild.channels.cache.find(
      c => c.name.startsWith("deposit-") && c.topic === `Deposit ticket for ${user.id}`
    );
    if (existing) {
      return interaction.reply({ content: `🚫 You already have a deposit ticket: <#${existing.id}>`, ephemeral: true });
    }
    // Find next ticket number
    const ticketCount = guild.channels.cache.filter(c => c.name.startsWith("deposit-")).size + 1;
    const channelName = `deposit-${ticketCount.toString().padStart(4, "0")}`;
    // Create private channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Deposit ticket for ${user.id}`,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ],
    });
    // Ephemeral reply with channel link
    await interaction.reply({ content: `✅ Your deposit ticket has been made at <#${channel.id}>`, ephemeral: true });
    // Embed and dropdown
    const embed = new EmbedBuilder()
      .setTitle("Deposit Ticket")
      .setDescription("Which crypto would you like to use to deposit?")
      .setColor(0x41fb2e);
    const select = new StringSelectMenuBuilder()
      .setCustomId("deposit-crypto-select")
      .setPlaceholder("Select a cryptocurrency...")
      .addOptions(CRYPTO_OPTIONS.map(opt => ({ label: opt.label, value: opt.value })));
    const row = new ActionRowBuilder().addComponents(select);
    await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
  },
  async handleComponent(interaction) {
    if (interaction.customId !== "deposit-crypto-select") return;
    const selected = interaction.values[0];
    const crypto = CRYPTO_OPTIONS.find(opt => opt.value === selected);
    if (!crypto) return interaction.reply({ content: "Unknown crypto.", ephemeral: true });
    await interaction.reply({ content: `**${crypto.label} ADDRESS:**\n\n\`\`\`\n${crypto.address}\n\`\`\`\n\n**➡️ After sending your crypto, send the transaction link here. An admin will verify it and update your balance shortly.**` });
  },
};
