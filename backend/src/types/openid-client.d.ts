declare module 'openid-client' {
  export interface Configuration {
    serverMetadata(): { issuer: string; [key: string]: any };
  }

  export function discovery(
    issuer: URL,
    clientId: string,
    clientSecret?: string,
    options?: any,
  ): Promise<Configuration>;

  export function randomPKCECodeVerifier(): string;
  export function calculatePKCECodeChallenge(verifier: string): Promise<string>;
  export function randomNonce(): string;

  export function buildAuthorizationUrl(
    config: Configuration,
    params: Record<string, string>,
  ): URL;

  export interface TokenEndpointResponse {
    claims(): Record<string, unknown> | undefined;
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  }

  export function authorizationCodeGrant(
    config: Configuration,
    callbackUrl: URL,
    options: {
      pkceCodeVerifier: string;
      expectedNonce: string;
      expectedState: string;
    },
  ): Promise<TokenEndpointResponse>;
}
