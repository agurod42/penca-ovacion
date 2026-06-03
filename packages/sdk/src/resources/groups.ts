import type { Http } from '../http.js';
import type { Group, GroupPositions, Page, PaginationParams, RankingEntry } from '../types.js';

export interface RankingParams extends PaginationParams {
  /** Revision token echoed by the app; optional cache-buster. */
  rev?: number;
}

export class Groups {
  constructor(private http: Http) {}

  /**
   * Groups the current user belongs to.
   *
   * The endpoint is inconsistent: it returns a bare array when called without
   * pagination, but a `{ data, hasMore }` envelope when `page`/`limit` are
   * present. We always normalize to a flat array.
   */
  async mine(params: PaginationParams = {}): Promise<Group[]> {
    const res = await this.http.request<Group[] | Page<Group>>('/api/v1/groups/mine', {
      query: { page: params.page ?? 1, limit: params.limit ?? 20 },
    });
    return Array.isArray(res) ? res : (res.data ?? []);
  }

  /** Public/featured groups available to join. */
  public(params: PaginationParams = {}): Promise<Page<Group>> {
    return this.http.request<Page<Group>>('/api/v1/groups/public', {
      query: { page: params.page ?? 1, limit: params.limit ?? 20 },
    });
  }

  /** Groups from finished tournaments. */
  finished(params: PaginationParams = {}): Promise<Page<Group>> {
    return this.http.request<Page<Group>>('/api/v1/groups/finished', {
      query: { page: params.page ?? 1, limit: params.limit ?? 20 },
    });
  }

  /** Join a group by invite code. */
  join(code: string): Promise<Group> {
    return this.http.request<Group>('/api/v1/groups/join', { method: 'POST', body: { code } });
  }

  /** Leave a group by id. */
  leave(groupId: string): Promise<{ success: boolean }> {
    return this.http.request<{ success: boolean }>(`/api/v1/groups/${groupId}/leave`, {
      method: 'POST',
    });
  }

  /** Ranking (leaderboard) for a group. */
  ranking(groupId: string, params: RankingParams = {}): Promise<Page<RankingEntry>> {
    return this.http.request<Page<RankingEntry>>(`/api/v1/groups/${groupId}/ranking`, {
      query: { page: params.page ?? 1, limit: params.limit ?? 20, rev: params.rev },
    });
  }

  /** Positions of specific users within a group. */
  positions(groupId: string, userIds: string[]): Promise<GroupPositions> {
    return this.http.request<GroupPositions>(`/api/v1/groups/${groupId}/positions`, {
      query: { userIds: userIds.join(',') },
    });
  }
}
