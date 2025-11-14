import type { JWTPayload } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { CognitoConfig } from '../config/env';

export interface VerifiedUser {
  sub: string;
  email?: string;
  payload: JWTPayload;
}

/**
 * Creates a verifier that validates Cognito ID tokens against the user pool's
 * JWKS. The returned function throws on invalid tokens and returns the relevant
 * claims for downstream authorisation.
 */
export function createCognitoVerifier(config: CognitoConfig) {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async function verifyToken(token: string): Promise<VerifiedUser> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: config.clientId,
    });

    if (payload.token_use !== 'id') {
      throw new Error('Cognito token must be an ID token.');
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!sub) {
      throw new Error('Cognito token missing sub claim.');
    }

    const email = typeof payload.email === 'string' ? payload.email : undefined;

    return { sub, email, payload };
  };
}
