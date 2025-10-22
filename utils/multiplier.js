async function getMultiplier(user, guild, client) {
  let xpmultiplier = 1.0;

  // Fetch the member from the guild
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return xpmultiplier;

  // Find the booster role
  const boosterRole = guild.roles.cache.find(r => r.tags?.premiumSubscriberRole);
  if (boosterRole && member.roles.cache.has(boosterRole.id)) {
    xpmultiplier += 0.5;
  }

  // Twitch subscriber roles
  const twitchTier1Role = guild.roles.cache.find(r => r.name === "Twitch Subscriber: Tier 1");
  const twitchTier2Role = guild.roles.cache.find(r => r.name === "Twitch Subscriber: Tier 2");
  const twitchTier3Role = guild.roles.cache.find(r => r.name === "Twitch Subscriber: Tier 3");

  if (twitchTier1Role && member.roles.cache.has(twitchTier1Role.id)) {
    xpmultiplier += 0.2;
  }
  if (twitchTier2Role && member.roles.cache.has(twitchTier2Role.id)) {
    xpmultiplier += 0.4;
  }
  if (twitchTier3Role && member.roles.cache.has(twitchTier3Role.id)) {
    xpmultiplier += 0.8;
  }

  return xpmultiplier;
}

module.exports = { getMultiplier };