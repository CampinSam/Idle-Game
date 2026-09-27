#!/usr/bin/env bash
# Each checkout owns its own socket-only PostgreSQL cluster and application ports.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
state="$root/.agent-local"
db_name=agent_dev
owner=$(id -un)

usage() {
  echo "Usage: $0 create <name> | setup | check | start | run <command...> | stop" >&2
  exit 2
}

free_port() {
  node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

if [[ "${1:-}" == create ]]; then
  [[ $# == 2 && "$2" =~ ^[a-zA-Z][a-zA-Z0-9_-]*$ ]] || usage
  # An uncommitted script or seed fix is not present in a new worktree.
  [[ -z "$(git -C "$root" status --porcelain)" ]] || { echo 'Commit or stash changes before creating a worktree.' >&2; exit 1; }
  destination="$(dirname "$root")/agent-worktrees/$2"
  [[ ! -e "$destination" ]] || { echo "Already exists: $destination" >&2; exit 1; }
  mkdir -p "$(dirname "$destination")"
  git -C "$root" worktree add -b "agent/$2" "$destination" HEAD
  echo "Created $destination; cd there and run scripts/agent-env.sh setup"
  exit
fi

[[ $# -gt 0 ]] || usage
command=$1
shift
case "$command" in
  setup|check|start|run|stop) ;;
  *) usage ;;
esac

cd "$root"
pg_bin=$(dirname "$(command -v initdb)")
for utility in pg_ctl initdb createdb pg_isready psql; do
  [[ -x "$pg_bin/$utility" ]] || { echo "PostgreSQL 16 tools required: $utility" >&2; exit 1; }
done

if [[ "$command" == stop ]]; then
  if [[ -f "$state/pgdata/PG_VERSION" ]]; then
    "$pg_bin/pg_ctl" -D "$state/pgdata" -m fast stop
  fi
  exit
fi

mkdir -p "$state/socket"
chmod 700 "$state/socket"
if [[ ! -f "$state/pgdata/PG_VERSION" ]]; then
  [[ ! -e "$state/pgdata" ]] || { echo "Incomplete local cluster at $state/pgdata; inspect it before retrying." >&2; exit 1; }
  "$pg_bin/initdb" -D "$state/pgdata" --auth-local=trust --auth-host=reject --no-instructions >"$state/init.log"
  free_port >"$state/pg-port"
  free_port >"$state/api-port"
  free_port >"$state/web-port"
  [[ "$(cat "$state/api-port")" != "$(cat "$state/web-port")" ]] || free_port >"$state/web-port"
fi

pg_port=$(cat "$state/pg-port")
api_port=$(cat "$state/api-port")
web_port=$(cat "$state/web-port")
if ! "$pg_bin/pg_ctl" -D "$state/pgdata" status >/dev/null 2>&1; then
  # PostgreSQL only binds this checkout's private Unix socket (never TCP).
  "$pg_bin/pg_ctl" -D "$state/pgdata" -o "-h '' -k $state/socket -p $pg_port" -l "$state/postgres.log" -w start
fi
if ! "$pg_bin/pg_isready" -q -h "$state/socket" -p "$pg_port" -U "$owner" -d postgres; then
  echo 'Local PostgreSQL is not reachable on this checkout socket.' >&2
  exit 1
fi
if [[ "$("$pg_bin/psql" -Atq -h "$state/socket" -p "$pg_port" -U "$owner" -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db_name'")" != 1 ]]; then
  "$pg_bin/createdb" -h "$state/socket" -p "$pg_port" -U "$owner" "$db_name"
fi

db_url="postgresql://$owner@localhost:$pg_port/$db_name?host=$state/socket"
isolated() {
  # Never pass the parent's database URL, cloud storage paths, Stripe keys, or
  # other workspace credentials into an agent's tools or app process.
  env -i HOME="$HOME" PATH="$PATH" USER="$owner" LOGNAME="$owner" \
    DATABASE_URL="$db_url" NODE_ENV=development \
    JWT_SECRET=local-agent-only-jwt-key \
    SESSION_SECRET=local-agent-only-session-key \
    PORT="$api_port" AGENT_API_PORT="$api_port" AGENT_WEB_PORT="$web_port" \
    "$@"
}

case "$command" in
  setup)
    echo "Isolated checkout: $root"
    echo "Local database socket: $state/socket; app ports: API $api_port, web $web_port"
    ;;
  check)
    isolated pnpm install --frozen-lockfile
    isolated pnpm --filter @derp/api prisma:generate
    isolated pnpm -r build
    isolated pnpm -r lint
    isolated pnpm -r test --if-present
    isolated pnpm prisma migrate deploy --schema=prisma/schema.prisma
    isolated pnpm prisma migrate status --schema=prisma/schema.prisma
    ;;
  start)
    isolated pnpm --filter @derp/shared build
    isolated pnpm --filter @derp/math build
    isolated pnpm --filter @derp/api prisma:generate
    isolated pnpm --filter @derp/api dev &
    api_pid=$!
    isolated pnpm --filter @derp/web dev &
    web_pid=$!
    trap 'kill "$api_pid" "$web_pid" 2>/dev/null || true; wait "$api_pid" "$web_pid" 2>/dev/null || true' EXIT INT TERM
    echo "Agent app at http://127.0.0.1:$web_port (API :$api_port); Ctrl-C stops the app, not its database."
    wait -n "$api_pid" "$web_pid"
    ;;
  run)
    [[ $# -gt 0 ]] || usage
    isolated "$@"
    ;;
esac