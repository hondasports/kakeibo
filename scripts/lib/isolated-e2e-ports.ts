const PORTS = [
  { key: "vite", env: "E2E_VITE_PORT", default: 5173, label: "Vite dev" },
  {
    key: "convexCloud",
    env: "E2E_CONVEX_CLOUD_PORT",
    default: 3210,
    label: "Convex local backend (api)",
  },
  {
    key: "convexSite",
    env: "E2E_CONVEX_SITE_PORT",
    default: 3211,
    label: "Convex local backend (http actions)",
  },
] as const;

export type E2EPorts = Record<(typeof PORTS)[number]["key"], number>;
export const E2E_PORT_ENV_VARS = PORTS.map(({ env }) => env);

export function resolveE2EPorts(env: NodeJS.ProcessEnv = process.env): E2EPorts {
  const entries = PORTS.map((definition) => {
    const value = env[definition.env];
    const port = value === undefined ? definition.default : Number(value);
    if (
      (value !== undefined && !/^[0-9]+$/.test(value)) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error(`${definition.env} には1〜65535の整数ポートを指定してください`);
    }
    return [definition.key, port] as const;
  });
  if (new Set(entries.map(([, port]) => port)).size !== PORTS.length) {
    throw new Error("E2EのVite/API/HTTP actionsには異なるポートを指定してください");
  }
  return Object.fromEntries(entries) as E2EPorts;
}

export function hasCustomE2EPorts(env: NodeJS.ProcessEnv = process.env): boolean {
  return E2E_PORT_ENV_VARS.some((name) => env[name] !== undefined);
}

export function e2ePortChecks(ports: E2EPorts) {
  return PORTS.map(({ key, label }) => ({ port: ports[key], label }));
}

export function e2ePortEnv(ports: E2EPorts): NodeJS.ProcessEnv {
  return Object.fromEntries(PORTS.map(({ key, env }) => [env, String(ports[key])]));
}
