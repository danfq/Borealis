#!/usr/bin/env bash
#
# report memory used by borealis and every process it spawned
#
# usage: scripts/memory.sh [pid]
#
# pss splits shared pages between the processes using them, so the pss
# total is the closest number to what the app really costs

set -euo pipefail

root="${1:-$(pgrep -xo borealis || true)}"

if [[ -z "$root" ]]; then
  echo "borealis is not running" >&2
  exit 1
fi

# list a process and all of its descendants, depth first
tree() {
  echo "$1"

  local child
  for child in $(pgrep -P "$1" || true); do
    tree "$child"
  done
}

printf "%-8s %-24s %10s %10s %10s %10s\n" PID PROCESS PSS RSS PRIVATE SWAP

for pid in $(tree "$root"); do
  rollup="/proc/$pid/smaps_rollup"
  [[ -r "$rollup" ]] || continue

  # comm cuts names at 15 characters, the executable keeps them whole
  exe="$(readlink "/proc/$pid/exe" 2>/dev/null || cat "/proc/$pid/comm")"
  name="${exe##*/}"
  name="${name// /_}"

  awk -v pid="$pid" -v name="$name" '
    /^Pss:/           { pss = $2 }
    /^Rss:/           { rss = $2 }
    /^Private_Clean:/ { priv += $2 }
    /^Private_Dirty:/ { priv += $2 }
    /^Swap:/          { swap = $2 }
    END { printf "%s %s %d %d %d %d\n", pid, name, pss, rss, priv, swap }
  ' "$rollup"
done | awk '
  function mib(kb) { return sprintf("%.1f MiB", kb / 1024) }

  {
    printf "%-8s %-24s %10s %10s %10s %10s\n", $1, $2, mib($3), mib($4), mib($5), mib($6)

    pss += $3; priv += $5; swap += $6
    count[$2]++; group[$2] += $3
  }

  END {
    print ""
    print "PSS by process type"

    for (name in group)
      printf "  %-24s %3d x %12s\n", name, count[name], mib(group[name])

    print ""
    printf "total pss %s, private %s, swap %s\n", mib(pss), mib(priv), mib(swap)
  }
'
