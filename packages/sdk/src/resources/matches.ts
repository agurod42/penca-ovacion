import type { Http } from '../http.js';
import type { MatchEvent, MatchStatistics, OviPrediction } from '../types.js';

export interface PredictionInput {
  homeScore: number;
  awayScore: number;
}

export class Matches {
  constructor(private http: Http) {}

  /** Timeline events for a match (goals, cards, ...). */
  async events(matchId: string): Promise<MatchEvent[]> {
    const res = await this.http.request<{ events: MatchEvent[] }>(
      `/api/v1/matches/${matchId}/events`,
    );
    return res.events ?? [];
  }

  /** Aggregate prediction statistics for a match, optionally scoped to a group. */
  statistics(matchId: string, options: { groupId?: string } = {}): Promise<MatchStatistics> {
    return this.http.request<MatchStatistics>(`/api/v1/matches/${matchId}/statistics`, {
      query: { groupId: options.groupId },
    });
  }

  /** Ovi (the AI pundit) prediction and reasoning for a match. */
  oviPrediction(matchId: string): Promise<OviPrediction> {
    return this.http.request<OviPrediction>(`/api/v1/matches/${matchId}/ovi-prediction`);
  }

  /** Submit (or overwrite) the current user's score prediction for a match. */
  predict(matchId: string, input: PredictionInput): Promise<{ success: boolean }> {
    return this.http.request<{ success: boolean }>(`/api/v1/matches/${matchId}/predictions`, {
      method: 'POST',
      body: { homeScore: input.homeScore, awayScore: input.awayScore },
    });
  }
}
