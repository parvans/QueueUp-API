// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import * as AuthService from '../services/auth.service';

export async function register(req: Request, res: Response) {
  const { name, email, password, phone } = req.body;
  const result = await AuthService.registerUser(name, email, password, phone);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = await AuthService.loginUser(email, password);
  res.json(result);
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;
  const result = await AuthService.refreshAccessToken(refreshToken);
  res.json(result);
}