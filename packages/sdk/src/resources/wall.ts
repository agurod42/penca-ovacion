import type { Http } from '../http.js';
import type { Page, PaginationParams, WallPost } from '../types.js';

export interface WallPostsParams extends PaginationParams {
  groupId?: string;
}

export interface CreateWallPostInput {
  content: string;
  groupId: string;
}

export class Wall {
  constructor(private http: Http) {}

  /** Whether the social wall feature is enabled. */
  status(): Promise<{ enabled: boolean }> {
    return this.http.request<{ enabled: boolean }>('/api/v1/wall/status');
  }

  /** List wall posts, optionally scoped to a group. */
  posts(params: WallPostsParams = {}): Promise<Page<WallPost>> {
    return this.http.request<Page<WallPost>>('/api/v1/wall/posts', {
      query: { page: params.page ?? 1, limit: params.limit ?? 10, groupId: params.groupId },
    });
  }

  /** Publish a new wall post to a group. */
  post(input: CreateWallPostInput): Promise<WallPost> {
    return this.http.request<WallPost>('/api/v1/wall/posts', {
      method: 'POST',
      body: { content: input.content, groupId: input.groupId },
    });
  }
}
