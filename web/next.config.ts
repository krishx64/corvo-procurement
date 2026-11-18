import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: false,
  // Keep pg outside the bundle: its optional native bindings and dynamic
  // requires are fragile inside serverless bundles.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
