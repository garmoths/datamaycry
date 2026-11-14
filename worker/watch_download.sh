#!/bin/zsh
# Live view of the MERRA-2 download. Ctrl+C closes the view; the download keeps running.
cd "${0:A:h}/.." || exit 1
LOG=data/logs/download.log
while true; do
  clear
  print -r -- "MERRA-2 download  $(date +%H:%M:%S)"
  print -r -- "-----------------------------------------------"
  total=0
  for c in M2TMNXSLV M2TMNXFLX M2TMNXLND M2TMNXAER; do
    n=$(ls data/raw/$c 2>/dev/null | grep -c '^[0-9]*\.nc4$')
    total=$((total + n))
    filled=$((n * 30 / 561))
    bar=$(printf '%*s' $filled '' | tr ' ' '#')$(printf '%*s' $((30 - filled)) '' | tr ' ' '.')
    printf "%-10s [%s] %3d/561\n" $c $bar $n
  done
  print -r -- "-----------------------------------------------"
  printf "Total      %d/2244   disk: %s\n" $total "$(du -sh data/raw 2>/dev/null | cut -f1)"
  if pgrep -f download.py >/dev/null; then print -r -- "Status     running"; else print -r -- "Status     NOT running"; fi
  print -r -- ""
  grep -E "progress|DONE" $LOG 2>/dev/null | tail -1 | cut -c12-
  grep -E "WARNING|ERROR" $LOG 2>/dev/null | tail -3 | cut -c12-130
  sleep 3
done
