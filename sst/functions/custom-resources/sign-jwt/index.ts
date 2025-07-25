import type { Handler } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { Resource } from 'sst';

export const handler: Handler<{
  payload: string;
  issuer: string;
  expiresIn: string;
}, string> = async ({ payload, issuer, expiresIn }) => {
  const token = jwt.sign(payload, Resource.JWTSecret.value, { issuer, expiresIn });
  return token;
};
