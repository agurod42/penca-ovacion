// Models reverse-engineered from the Penca Antel Ovación API responses.
// Field presence mirrors observed payloads; optional fields use `?` or `| null`.

/** Stored authentication tokens. */
export interface Tokens {
  accessToken: string;
  refreshToken?: string;
}

/** Decoded JWT access-token payload. */
export interface JwtPayload {
  sub: number;
  email: string;
  iat: number;
  exp: number;
}

/** Authenticated account, from `GET /auth/me`. */
export interface CurrentUser {
  id: string;
  fullName: string;
  nickname: string;
  email: string;
  country: string | null;
  roles: string[];
  capabilities: string[];
  authProviders: string[];
  createdAt: string;
  verifiedType: string;
}

export interface Tournament {
  id: string;
  name: string;
  shortName: string;
  logoName: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoName: string;
  flagEmoji: string | null;
}

export type MatchStatus = string; // e.g. "Por Jugar", "Finalizado"

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  startDate: string;
  matchDay: string;
  venueName: string;
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface MatchEvent {
  // The capture only ever returned an empty events array; shape is best-effort.
  [key: string]: unknown;
}

export interface PopularScore {
  homeScore: number;
  awayScore: number;
  percentage: number;
  label: string;
}

export interface MatchStatistics {
  totalPredictions: number;
  homeWinPercentage: number;
  drawPercentage: number;
  awayWinPercentage: number;
  popularScores: PopularScore[];
}

export interface OviPrediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away' | 'draw' | string;
  confidence: 'low' | 'medium' | 'high' | string;
  tagline: string;
  reasoning: string;
}

export interface Group {
  id: string;
  guid: string;
  name: string;
  imageName: string;
  memberCount: number;
  isPrivate: boolean;
  code: string;
  position: number;
  totalPoints: number;
  subtitle: string;
  tournamentName: string;
  tournamentId: string;
  ownerId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  prizes: string[];
  prizesFlyerImageName?: string | null;
  groupType?: string;
  groupTypeId?: number;
  groupTypeLabel?: string;
  isVerified?: boolean;
}

export interface RankingUser {
  id: string;
  nickname: string;
  avatarName: string | null;
  country: string | null;
  verifiedType: string;
}

export interface RankingEntry {
  id: string;
  position: number;
  user: RankingUser;
  points: number;
  isAdmin: boolean;
  isOwner: boolean;
}

export interface GroupPosition {
  userId: string;
  position: number | null;
  points: number | null;
}

export interface GroupPositions {
  memberCount: number;
  positions: GroupPosition[];
}

export interface WallPostUser {
  id: string;
  nickname: string;
  avatarName: string | null;
  verifiedType: string;
}

export interface WallPost {
  id: string;
  user: WallPostUser;
  content: string;
  contentImageUrl: string | null;
  likes: number;
  comments: number;
  createdAt: string;
  isLikedByUser?: boolean;
  entities?: unknown;
}

export interface PollOption {
  id: string;
  text: string;
  order: number;
  voteCount: number;
  percentage: number;
}

export interface Poll {
  id: string;
  question: string;
  imageUrl: string | null;
  createdAt: string;
  closesAt: string;
  expiresAt: string;
  status: string;
  isClosed: boolean;
  isExpired: boolean;
  totalVotes: number;
  options: PollOption[];
}

export interface Article {
  id: number;
  title: string;
  subtitle: string | null;
  lead: string | null;
  imageUrl: string | null;
  contentImageUrl: string | null;
  videoUrl: string | null;
  hasVideo: boolean;
  author: string | null;
  sourceText: string | null;
  publishedAt: string;
}

export interface OviDigest {
  id: string;
  kind: string;
  date: string;
  title: string;
  subtitle: string;
  summary: string;
}

export interface PredictionStats {
  totalPredictions: number;
  totalPoints: number;
  exactHits: number;
}

export interface UserPrediction {
  // Shape varies; the capture only returned empty arrays for this user.
  [key: string]: unknown;
}

export interface UserPredictions {
  user: WallPostUser;
  data: UserPrediction[];
  hasMore: boolean;
  stats: PredictionStats;
}

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface FollowStatus {
  isFollowing: boolean;
}

/** Generic `{ data, hasMore? }` paginated envelope used by several endpoints. */
export interface Page<T> {
  data: T[];
  hasMore?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export type MatchView = 'upcoming' | 'finished';
