import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

function lanHosts(): string[] {
  const hosts: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) hosts.push(a.address);
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  transpilePackages: ["@freeharmony/engine", "@freeharmony/advice"],
  allowedDevOrigins: lanHosts(),
  turbopack: {
    // Monorepo root — keeps a stray lockfile in $HOME from confusing detection.
    root: join(__dirname, "..", ".."),
  },
};

export default nextConfig;
