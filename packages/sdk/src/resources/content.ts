import type { Http } from '../http.js';
import type {
  Article,
  FollowCounts,
  FollowStatus,
  OviDigest,
  Page,
  PaginationParams,
  Poll,
  UserPredictions,
} from '../types.js';

export class Polls {
  constructor(private http: Http) {}

  /** Active and recent polls with their options and vote tallies. */
  list(): Promise<Poll[]> {
    return this.http.request<Poll[]>('/api/v1/polls');
  }
}

export class Articles {
  constructor(private http: Http) {}

  /** Paginated editorial articles / news. */
  list(params: PaginationParams = {}): Promise<Page<Article>> {
    return this.http.request<Page<Article>>('/api/v1/articles', {
      query: { page: params.page ?? 1, limit: params.limit ?? 5 },
    });
  }
}

export class Home {
  constructor(private http: Http) {}

  /** Ovi's daily AI digest. */
  oviDigest(kind = 'home'): Promise<OviDigest> {
    return this.http.request<OviDigest>('/api/v1/home/ovi-digest', { query: { kind } });
  }
}

export interface UserPredictionsParams extends PaginationParams {
  groupId?: string;
}

export class Users {
  constructor(private http: Http) {}

  /** A user's predictions and aggregate stats. */
  predictions(userId: string, params: UserPredictionsParams = {}): Promise<UserPredictions> {
    return this.http.request<UserPredictions>(`/api/v1/users/${userId}/predictions`, {
      query: { page: params.page ?? 1, limit: params.limit ?? 20, groupId: params.groupId },
    });
  }

  /** Follower / following counts for a user. */
  followCounts(userId: string): Promise<FollowCounts> {
    return this.http.request<FollowCounts>(`/api/v1/users/${userId}/follow/counts`);
  }

  /** Whether the current user follows the given user. */
  followStatus(userId: string): Promise<FollowStatus> {
    return this.http.request<FollowStatus>(`/api/v1/users/${userId}/follow/status`);
  }
}
