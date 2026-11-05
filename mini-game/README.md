# Mini Game

Mini Game is a login-required, real-time-by-polling multiplayer quiz for 2–6 friends.
Open `/mini-game`, create a room, then share its six-character code or invite link.
The host starts the game after at least one other player joins. Each game has 5, 10,
or 15 multiple-choice questions, a 15-second timer per question, score for correct
answers, a persistent points leaderboard, and a short result screen between rounds.
At the end of a game, winners appear on a trophy podium and other players get a
gentle, sad-face "next round" reaction; detailed scores remain available below.

All players must open the same application server URL. When joining from another
device, use the server computer's reachable LAN address or public domain, not
`localhost` (which points to each player's own device). Each player also needs a
separate login session; two tabs in one browser share the same account cookie. For
two accounts on one computer, open the second account in a separate browser profile
or private/incognito window.

The current offline question bank includes English vocabulary, introductory C, and
Vietnamese history. Question and option order are randomized per room. Correct answers
stay on the server until a round ends. No external AI or quiz-provider key is needed
to play.

Live lobby and score updates use authenticated same-origin HTTP polling; this does not
require an extra WebSocket dependency. Account data remains in the existing account
database, while leaderboard scores are stored separately in `.data/minigame.sqlite`.

Round reactions are fixed, lighthearted encouragement. Players cannot enter custom
taunts or messages directed at other players.
