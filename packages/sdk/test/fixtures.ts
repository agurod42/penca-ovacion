// Synthetic fixtures mirroring real API response shapes. All identifiers and
// personal data are fabricated — no data from any real capture is committed here.

export const tournaments = [
  {
    id: '00000000-0000-0000-0000-000000000096',
    name: 'Mundial 2026',
    shortName: 'Copa 2026',
    logoName: '',
  },
  {
    id: '00000000-0000-0000-0000-000000000098',
    name: 'Copa Libertadores 2026',
    shortName: 'Libertadores 2026',
    logoName: 'https://example.test/logo.png',
  },
];

export const matchesPage = {
  data: [
    {
      id: '00000000-0000-0000-0000-000000006ec1',
      homeTeam: {
        id: '00000000-0000-0000-0000-00000000012e',
        name: 'México',
        shortName: 'México',
        logoName: 'https://example.test/teams/mex.png',
        flagEmoji: null,
      },
      awayTeam: {
        id: '00000000-0000-0000-0000-000000000290',
        name: 'Sudáfrica',
        shortName: 'Sudáfrica',
        logoName: 'https://example.test/teams/rsa.png',
        flagEmoji: null,
      },
      startDate: '2026-06-11T19:00:00.000Z',
      matchDay: 'Grupo A - Fecha 1',
      venueName: 'Estadio Azteca',
      status: 'Por Jugar',
    },
  ],
};

export const matchStatistics = {
  totalPredictions: 3,
  homeWinPercentage: 33,
  drawPercentage: 67,
  awayWinPercentage: 0,
  popularScores: [
    { homeScore: 2, awayScore: 1, percentage: 33, label: '2-1' },
    { homeScore: 1, awayScore: 1, percentage: 33, label: '1-1' },
  ],
};

export const oviPrediction = {
  matchId: '28353',
  homeScore: 2,
  awayScore: 0,
  winner: 'home',
  confidence: 'high',
  tagline: 'México arranca con todo en casa',
  reasoning: 'Texto sintético de ejemplo para el pronóstico de Ovi.',
};

export const groupsMine = [
  {
    id: '53974650-90e3-48cd-9452-a4cbde1ee962',
    guid: '53974650-90e3-48cd-9452-a4cbde1ee962',
    name: 'Penca de Prueba',
    imageName: 'https://example.test/groups/test.png',
    memberCount: 42,
    isPrivate: false,
    code: 'TEST1',
    position: 0,
    totalPoints: 0,
    subtitle: '42 miembros',
    tournamentName: 'Mundial 2026',
    tournamentId: '00000000-0000-0000-0000-000000000096',
    ownerId: '00000000-0000-0000-0000-000000005f74',
    isOwner: false,
    isAdmin: false,
    prizes: [],
  },
];

export const ranking = {
  data: [
    {
      id: '00000000-0000-0000-0000-00000098967e',
      position: 1,
      user: {
        id: '00000000-0000-0000-0000-00000098967e',
        nickname: 'Persona Prueba',
        avatarName: null,
        country: 'UY',
        verifiedType: 'none',
      },
      points: 0,
      isAdmin: false,
      isOwner: false,
    },
  ],
};

export const wallPosts = {
  data: [
    {
      id: 'c92ace62-3f51-4dde-b937-1983008bb2dc',
      user: {
        id: '00000000-0000-0000-0000-00000098967e',
        nickname: 'Test User',
        avatarName: null,
        verifiedType: 'none',
      },
      content: 'Hola mundo',
      contentImageUrl: null,
      likes: 5,
      comments: 0,
      createdAt: '2026-06-02T16:00:00.000Z',
      isLikedByUser: false,
      entities: null,
    },
  ],
};

export const currentUser = {
  id: '00000000-0000-0000-0000-00000098d5bc',
  fullName: 'Test User',
  nickname: 'tester',
  email: 'test@example.test',
  country: null,
  roles: ['user'],
  capabilities: [],
  authProviders: ['email'],
  createdAt: '2026-06-02T15:07:25.000Z',
  verifiedType: 'none',
};

// A throwaway, unsigned-but-structurally-valid JWT (HS256, fake payload).
export const fakeJwt = (() => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 12345678, email: 'test@example.test', iat: 1780000000, exp: 4070000000 }),
  ).toString('base64url');
  return `${header}.${payload}.c2lnbmF0dXJl`;
})();
