export const CONFIG_KEY_LOG_CHANNEL = "log_channel";
export const CONFIG_KEY_ADMIN_ROLE = "admin_role";

const configStore = new Map<string, string>();

export function setConfig(guildId: string, key: string, value: string) {
  configStore.set(`${guildId}:${key}`, value);
}

export function getConfig(guildId: string, key: string): string | undefined {
  return configStore.get(`${guildId}:${key}`);
}
