import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 调试：打印 API Key 状态（前4位）
  const apiKey = env.FOOTBALL_API_KEY || env.VITE_FOOTBALL_API_KEY || ''
  console.log(`[Vite] API Key configured: ${apiKey ? apiKey.substring(0, 4) + '...' : 'MISSING'}`)

  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api/football': {
          target: 'https://v3.football.api-sports.io',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            const params = url.searchParams

            // NEW: /api/football/fixtures-live -> /fixtures?live=all
            if (path.startsWith('/api/football/fixtures-live')) {
              return '/fixtures?live=all'
            }

            // /api/football/fixture/:id -> /fixtures?id=:id
            const fixtureMatch = path.match(/\/api\/football\/fixture\/(\d+)/)
            if (fixtureMatch) {
              return `/fixtures?id=${fixtureMatch[1]}`
            }

            // /api/football/statistics/:id -> /fixtures/statistics?fixture=:id
            const statsMatch = path.match(/\/api\/football\/statistics\/(\d+)/)
            if (statsMatch) {
              return `/fixtures/statistics?fixture=${statsMatch[1]}`
            }

            // /api/football/events/:id -> /fixtures/events?fixture=:id
            const eventsMatch = path.match(/\/api\/football\/events\/(\d+)/)
            if (eventsMatch) {
              return `/fixtures/events?fixture=${eventsMatch[1]}`
            }

            // /api/football/lineups/:id -> /fixtures/lineups?fixture=:id
            const lineupsMatch = path.match(/\/api\/football\/lineups\/(\d+)/)
            if (lineupsMatch) {
              return `/fixtures/lineups?fixture=${lineupsMatch[1]}`
            }

            // NEW: /api/football/odds-live?fixture=123 -> /odds/live?fixture=123
            if (path.startsWith('/api/football/odds-live')) {
              const fixture = params.get('fixture')
              const bookmaker = params.get('bookmaker')
              const bet = params.get('bet')

              const apiParams = new URLSearchParams()
              if (fixture) apiParams.append('fixture', fixture)
              if (bookmaker) apiParams.append('bookmaker', bookmaker)
              if (bet) apiParams.append('bet', bet)

              return `/odds/live?${apiParams.toString()}`
            }

            // NEW: /api/football/odds-prematch?fixture=123 -> /odds?fixture=123
            if (path.startsWith('/api/football/odds-prematch')) {
              const fixture = params.get('fixture')
              const bookmaker = params.get('bookmaker')
              const bet = params.get('bet')

              const apiParams = new URLSearchParams()
              if (fixture) apiParams.append('fixture', fixture)
              if (bookmaker) apiParams.append('bookmaker', bookmaker)
              if (bet) apiParams.append('bet', bet)

              return `/odds?${apiParams.toString()}`
            }

            // Legacy: /api/football/fixtures?live=all -> /fixtures?live=all
            if (path.startsWith('/api/football/fixtures')) {
              if (params.get('live') === 'all') {
                return '/fixtures?live=all'
              }
              const id = params.get('id')
              if (id) {
                return `/fixtures?id=${id}`
              }
              return '/fixtures'
            }

            // Legacy: /api/football/odds?fixture=123&live=true -> /odds/live?fixture=123
            if (path.startsWith('/api/football/odds')) {
              const fixture = params.get('fixture')
              const isLive = params.get('live') === 'true'
              const bookmaker = params.get('bookmaker')
              const bet = params.get('bet')

              let apiPath = isLive ? '/odds/live' : '/odds'
              const apiParams = new URLSearchParams()
              if (fixture) apiParams.append('fixture', fixture)
              if (bookmaker) apiParams.append('bookmaker', bookmaker)
              if (bet) apiParams.append('bet', bet)

              return `${apiPath}?${apiParams.toString()}`
            }

            // /api/football/data?type=xxx
            if (path.startsWith('/api/football/data')) {
              const type = params.get('type')

              switch (type) {
                case 'predictions': {
                  const fixture = params.get('fixture')
                  return `/predictions?fixture=${fixture}`
                }
                case 'standings': {
                  const league = params.get('league')
                  const season = params.get('season') || '2024'
                  return `/standings?league=${league}&season=${season}`
                }
                case 'lineups': {
                  const fixture = params.get('fixture')
                  return `/fixtures/lineups?fixture=${fixture}`
                }
                case 'team-stats': {
                  const team = params.get('team')
                  const league = params.get('league')
                  const season = params.get('season') || '2024'
                  return `/teams/statistics?team=${team}&league=${league}&season=${season}`
                }
              }
            }

            // /api/football/teams?type=xxx
            if (path.startsWith('/api/football/teams')) {
              const type = params.get('type')

              switch (type) {
                case 'players': {
                  const fixture = params.get('fixture')
                  return `/fixtures/players?fixture=${fixture}`
                }
                case 'injuries': {
                  const team = params.get('team')
                  const season = params.get('season') || '2024'
                  const fixture = params.get('fixture')
                  let apiPath = `/injuries?team=${team}&season=${season}`
                  if (fixture) apiPath += `&fixture=${fixture}`
                  return apiPath
                }
                case 'h2h': {
                  const team1 = params.get('team1')
                  const team2 = params.get('team2')
                  const last = params.get('last') || '10'
                  return `/fixtures/headtohead?h2h=${team1}-${team2}&last=${last}`
                }
              }
            }

            // /api/football/leagues -> /leagues
            if (path.startsWith('/api/football/leagues')) {
              const apiParams = new URLSearchParams()
              const id = params.get('id')
              const country = params.get('country')
              const season = params.get('season')
              const current = params.get('current')
              const type = params.get('type')

              if (id) apiParams.append('id', id)
              if (country) apiParams.append('country', country)
              if (season) apiParams.append('season', season)
              if (current) apiParams.append('current', current)
              if (type) apiParams.append('type', type)

              const queryString = apiParams.toString()
              return `/leagues${queryString ? `?${queryString}` : ''}`
            }

            return path.replace('/api/football', '')
          },
          headers: {
            'x-apisports-key': env.FOOTBALL_API_KEY || env.VITE_FOOTBALL_API_KEY || ''
          }
        },
        '/api/health': {
          target: 'https://v3.football.api-sports.io',
          changeOrigin: true,
          rewrite: () => '/status',
          headers: {
            'x-apisports-key': env.FOOTBALL_API_KEY || env.VITE_FOOTBALL_API_KEY || ''
          }
        },

        // Sportmonks API - Third Data Source (支持中文)
        '/api/sportmonks': {
          target: 'https://api.sportmonks.com',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            const params = url.searchParams

            // Get API key from env
            const apiKey = env.SPORTMONKS_API_KEY || ''

            // Extract path after /api/sportmonks/
            const apiPath = path.replace(/^\/api\/sportmonks/, '')

            // Build query params - preserve existing ones and add api_token
            const newParams = new URLSearchParams(params)
            newParams.set('api_token', apiKey)

            // Construct final URL
            return `/v3/football${apiPath.split('?')[0]}?${newParams.toString()}`
          }
        }
      }
    },
  }
})
