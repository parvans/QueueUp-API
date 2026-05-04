// src/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';

export async function registerUser(name: string, email: string, password: string, phone?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, phone },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);
  await saveRefreshToken(user.id, refreshToken);

  return { user, accessToken, refreshToken };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);
  await saveRefreshToken(user.id, refreshToken);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) throw new Error('Invalid refresh token');

  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as {
    id: string; email: string; role: string;
  };

  const { accessToken, refreshToken: newRefresh } = generateTokens(
    payload.id, payload.email, payload.role
  );

  // Rotate refresh token — invalidate old, save new
  await prisma.refreshToken.delete({ where: { token } });
  await saveRefreshToken(payload.id, newRefresh);

  return { accessToken, refreshToken: newRefresh };
}

// ── Helpers ───────────────────────────────────────────────────────

function generateTokens(id: string, email: string, role: string) {
  const accessToken = jwt.sign(
    { id, email, role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { id, email, role },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
}

async function saveRefreshToken(userId: string, token: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
}