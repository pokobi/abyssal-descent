#!/bin/bash
# every guardian in turn, three at a time: tests/coop/sweep.sh [log dir]
D=${1:-/tmp/coopsweep}; mkdir -p "$D"
ALL="colossus wyrm archon executioner broodmother twins heart hunter drake abyssking sovereign sovereign2 houndlord boneking warlock cerberus madman ossuary hollowknight lich behemoth weaver warden arbiter minotaur cinderpriest ashdrake oboro foxfire karakuri stormimp"
run() { i=0; for b in $1; do COOP_PORT=$2 timeout 120 node tests/coop/coop_test.js --secs=25 --boss=$b > "$D/$b.log" 2>&1; echo "$b $?" >> "$D/summary.txt"; done; }
A=""; B=""; C=""; n=0
for b in $ALL; do case $((n%3)) in 0) A="$A $b";; 1) B="$B $b";; 2) C="$C $b";; esac; n=$((n+1)); done
rm -f "$D/summary.txt"
run "$A" 8801 & run "$B" 8811 & run "$C" 8821 & wait
echo DONE >> "$D/summary.txt"
