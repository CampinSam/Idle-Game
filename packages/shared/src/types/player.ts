export interface Player {
  id: string;
  username: string;
  email?: string;
  walletAddress?: string;
  keeperLevel: number;
  keeperXp: number;
  prestigeTokens: number;
  createdAt: string;
  primaryLocationId?: string | null;
  unlocks?: string[];
}

export interface RegisterDto {
  username: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  player: Player;
}
