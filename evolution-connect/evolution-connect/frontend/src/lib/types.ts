export type GameStatus =
  | "lobby"
  | "instructions"
  | "color_assignment"
  | "round_active"
  | "between_rounds"
  | "finished";

export interface ColorInfo {
  name: string;
  hex: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  color: ColorInfo | null;
  groupIndex: number | null;
  score: number;
  connected: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface AdminSnapshot {
  sessionId: string;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  roundDurationSeconds: number;
  roundEndsAt: number | null;
  players: PublicPlayer[];
  leaderboard: LeaderboardEntry[];
  totalConnections: number;
}

export type GroupMemberButtonState =
  | "default"
  | "pending_sent"
  | "pending_received"
  | "confirmed";

export interface GroupMember {
  id: string;
  name: string;
  buttonState: GroupMemberButtonState;
}

export interface PlayerSnapshot {
  sessionId: string;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  roundEndsAt: number | null;
  me: {
    id: string;
    name: string;
    color: ColorInfo | null;
    score: number;
  };
  groupMembers: GroupMember[];
}

export interface FinalResults {
  leaderboard: LeaderboardEntry[];
  winners: LeaderboardEntry[];
  needsTieBreaker: boolean;
  totalConnections: number;
}
