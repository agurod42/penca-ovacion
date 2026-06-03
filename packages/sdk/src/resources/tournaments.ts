import type { Http } from '../http.js';
import type { Match, MatchView, Page, PaginationParams, Tournament } from '../types.js';

export interface TournamentMatchesParams extends PaginationParams {
  view?: MatchView;
  groupId?: string;
}

export class Tournaments {
  constructor(private http: Http) {}

  /** List all available tournaments. */
  list(): Promise<Tournament[]> {
    return this.http.request<Tournament[]>('/api/v1/tournaments');
  }

  /** List matches for a tournament, optionally filtered by view and group. */
  matches(tournamentId: string, params: TournamentMatchesParams = {}): Promise<Page<Match>> {
    return this.http.request<Page<Match>>(`/api/v1/tournaments/${tournamentId}/matches`, {
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        view: params.view,
        groupId: params.groupId,
      },
    });
  }
}
