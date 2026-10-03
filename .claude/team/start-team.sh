#!/usr/bin/env bash
# Start the six Opportunity Radar agent sessions in tmux (session "or").
#
#   .claude/team/start-team.sh            start the team (refuses if session "or" already exists)
#   .claude/team/start-team.sh --attach   start (if needed) and attach
#   .claude/team/start-team.sh status     show windows and panes of the running session
#
# Layout (same as before):  window 0 "agents": Orchestrator | Engineer | Reviewer | QA | Researcher (tiled)
#                           window 1 "awake":  caffeinate (keeps the Mac awake)
#                           window 2 "designer": Designer (+ Product Manager)
# Switch windows: Ctrl-b then 0/1/2.  Panes: Ctrl-b then arrows, Ctrl-b z to zoom.
# Never `exit` inside a pane: that ends that agent. Detach with Ctrl-b d.

set -euo pipefail

SESSION="or"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v tmux >/dev/null   || { echo "tmux not found (brew install tmux)"; exit 1; }
command -v claude >/dev/null || { echo "claude CLI not found in PATH"; exit 1; }

if [ "${1:-}" = "status" ]; then
  tmux has-session -t "$SESSION" 2>/dev/null || { echo "session '$SESSION' is not running"; exit 1; }
  tmux list-panes -s -t "$SESSION" -F '#{window_index}.#{pane_index}  #{window_name}  #{pane_title}  (#{pane_current_command})'
  exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "session '$SESSION' is already running (starting again would duplicate the agents)."
  echo "  attach: tmux attach -t $SESSION     status: $0 status"
  [ "${1:-}" = "--attach" ] && exec tmux attach -t "$SESSION"
  exit 0
fi

# Warn about stray background sessions that would also answer to "Orchestrator".
if claude agents --json 2>/dev/null | grep -q '"kind": *"background"'; then
  echo "note: background agent sessions exist (claude agents). A stray background 'Orchestrator' would"
  echo "      receive messages meant for the team; stop it there if you see one."
fi

cd "$ROOT"

# Window 0: five agents, tiled.
tmux new-session -d -s "$SESSION" -n agents -x 183 -y 50 -c "$ROOT" \
  'claude --agent orchestrator --name Orchestrator'
tmux select-pane -t "$SESSION:agents" -T Orchestrator
for pair in "engineer:Engineer" "reviewer:Reviewer" "qa:QA" "researcher:Researcher"; do
  agent="${pair%%:*}"; name="${pair#*:}"
  tmux split-window -t "$SESSION:agents" -c "$ROOT" "claude --agent $agent --name $name"
  tmux select-pane -T "$name"
  tmux select-layout -t "$SESSION:agents" tiled >/dev/null
done

# Window 1: keep the Mac awake while the team works.
tmux new-window -t "$SESSION" -n awake -c "$ROOT" 'caffeinate -dims'

# Window 2: Designer (also Product Manager).
tmux new-window -t "$SESSION" -n designer -c "$ROOT" \
  'claude --agent designer --name Designer'

tmux select-window -t "$SESSION:agents"
echo "started session '$SESSION' with 6 agents. Attach: tmux attach -t $SESSION"
[ "${1:-}" = "--attach" ] && exec tmux attach -t "$SESSION"
exit 0
