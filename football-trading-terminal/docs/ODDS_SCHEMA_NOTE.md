# API-Football Odds Schema Note

## /odds (Prematch) Structure
```json
{
  "response": [{
    "league": { "id": 39, ... },
    "fixture": { "id": 123456, ... },
    "bookmakers": [{
      "id": 8,
      "name": "Bet365",
      "bets": [{
        "id": 1,
        "name": "Match Winner",
        "values": [
          { "value": "Home", "odd": "2.10" },
          { "value": "Draw", "odd": "3.40" },
          { "value": "Away", "odd": "3.20" }
        ]
      }]
    }]
  }]
}
```

## /odds/live Structure (DIFFERENT!)
```json
{
  "response": [{
    "fixture": { "id": 1516529, "status": { "elapsed": 69 } },
    "league": { "id": 99 },
    "teams": { "home": { "id": 298, "goals": 2 }, "away": { ... } },
    "odds": [{
      "id": 36,
      "name": "Over/Under Line",
      "values": [
        { "value": "Over", "odd": "1.75", "handicap": "2.5", "main": true },
        { "value": "Under", "odd": "2.05", "handicap": "2.5", "main": true }
      ]
    }, {
      "id": 33,
      "name": "Asian Handicap",
      "values": [
        { "value": "Home", "odd": "1.90", "handicap": "-1.5", "main": true },
        { "value": "Away", "odd": "1.90", "handicap": "+1.5", "main": true }
      ]
    }]
  }]
}
```

## Key Differences

| Aspect | /odds (prematch) | /odds/live |
|--------|------------------|------------|
| Markets location | `response[0].bookmakers[].bets[]` | `response[0].odds[]` |
| Bookmaker info | Explicit `bookmaker.id/name` | No bookmaker, single source |
| Bet ID for O/U | 5 (Goals Over/Under) | 36 (Over/Under Line) |
| Bet ID for AH | 8 (Asian Handicap) | 33 (Asian Handicap) |
| Bet ID for 1X2 | 1 (Match Winner) | 59 (Fulltime Result) |
| Line info | In `value` string: "Over 2.5" | Separate `handicap` field: "2.5" |
| Main market | Not specified | `main: true` flag |
| Suspended | Not specified | `suspended: boolean` |

## Unified OddsNormalized Structure
```typescript
interface OddsNormalized {
  fixture_id: number;
  minute: number | null;
  is_live: boolean;
  bookmaker: string;
  // 1X2
  home_win: number | null;
  draw: number | null;
  away_win: number | null;
  // O/U
  over_1_5: number | null;
  under_1_5: number | null;
  over_2_5: number | null;
  under_2_5: number | null;
  over_3_5: number | null;
  under_3_5: number | null;
  // AH
  asian_handicap_line: number | null;
  asian_handicap_home: number | null;
  asian_handicap_away: number | null;
  // Meta
  captured_at: string;
}
```

*Last updated: 2026-02-25*
