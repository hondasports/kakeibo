export function parseEnvFile(content: string): Map<string, string>;

export function deriveClerkJwtIssuerDomain(publishableKey: string): string;

export function isLocalEndpoint(value: string | undefined | null): boolean;

export function isLocalConvexEnvironment(env: ReadonlyMap<string, string> | undefined): boolean;
