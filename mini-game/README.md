# Mini Game

Mini Game is a login-required, real-time-by-polling multiplayer quiz for 2–6 friends.
Open `/mini-game`, create a room, then share its six-character code or invite link.
The host starts the game after at least one other player joins. Each game has 5, 10,
or 15 multiple-choice questions, a 15-second timer per question, score for correct
answers, a persistent points leaderboard, and a short result screen between rounds.
At the end of a game, winners appear on a trophy podium and other players get a
gentle, sad-face "next round" reaction; detailed scores remain available below.

Players can send and accept friend requests by username from the dashboard. During a
room lobby, the host can invite an existing friend directly; the recipient accepts
the in-app invitation to join without entering a room code. Room codes and invite
links remain available for sharing.

The lifetime points leaderboard also determines a player's rank: Newbie, Đồng Bạc
(5,000 points), Vàng (10,000), Kim Cương (15,000), Huyền Thoại (50,000), and
Trạng Nguyên (100,000). Existing game scoring supplies rank points; cooperative
obstacle games continue to award no points. The dashboard shows cumulative points,
answered/correct question counts, a daily activity streak, and a seven-day correct
answer chart. Historic lifetime totals are retained, but daily streak and chart
history begin when activity tracking is introduced; older question totals can only
use correct answers that were already stored.

All players must open the same application server URL. When joining from another
device, use the server computer's reachable LAN address or public domain, not
`localhost` (which points to each player's own device). Each player also needs a
separate login session; two tabs in one browser share the same account cookie. For
two accounts on one computer, open the second account in a separate browser profile
or private/incognito window.

The current offline question bank includes English vocabulary, introductory C, and
Vietnamese history. Question and option order are randomized per room. Correct answers
stay on the server until a round ends. Standard quiz and picture modes need no AI key.

The AI-powered **Vượt Chướng Ngại Vật** mode lets the host choose 5, 10, or 15 clue
rows. It creates one clue question per row, a separate central keyword question,
and a custom vector illustration for each room. Gemini describes
the illustration as bounded SVG shapes; the server validates and renders those shapes
instead of embedding model-provided markup. Players choose any unfinished clue row,
hear the AI read it while the caption appears progressively, and use the buzzer to
claim an untimed answer attempt. A wrong answer passes the turn to other players;
correct answers open their matching image piece. The center question is available
after all selected rows; the center is numbered one higher than the row count.
This cooperative mode has no timer, points, or speed bonus and
requires Gemini and ElevenLabs keys (browser speech is used if ElevenLabs is unavailable).

The AI-powered **Đường lên đỉnh Olympia** mode opens with an illustrated broad question.
The AI voice reads it, players get 25 seconds to think, and the game then reads each
short-answer branch question aloud. A prominent three-second countdown appears
before the buzzer opens. Only the first player to buzz can answer by typing or using
speech recognition; a wrong or timed-out attempt forfeits that player's turn for the
question so another player can buzz. Olympia mode requires configured Gemini and
ElevenLabs keys; browser speech is used if ElevenLabs audio is unavailable.

Live lobby and score updates use authenticated same-origin HTTP polling; this does not
require an extra WebSocket dependency. Account data remains in the existing account
database, while leaderboard scores are stored separately in `.data/minigame.sqlite`.

Round reactions are fixed, lighthearted encouragement. Players cannot enter custom
taunts or messages directed at other players.
