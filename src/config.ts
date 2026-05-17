import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const PI_EXA_CONFIG_FILE = join(getAgentDir(), "pi-exa.json");

export interface PiExaConfig {
  mcpUseApiKey?: boolean;
  deepSearchEnabled?: boolean;
}

export async function getPiExaConfig(): Promise<PiExaConfig> {
  try {
    return JSON.parse(
      await readFile(PI_EXA_CONFIG_FILE, "utf8"),
    ) as PiExaConfig;
  } catch {
    return {};
  }
}

export async function setPiExaConfig(updates: PiExaConfig) {
  const config = await getPiExaConfig();
  const nextConfig = { ...config, ...updates };

  await mkdir(dirname(PI_EXA_CONFIG_FILE), { recursive: true });
  await writeFile(
    PI_EXA_CONFIG_FILE,
    `${JSON.stringify(nextConfig, null, 2)}\n`,
  );
}
