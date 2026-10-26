#!/bin/sh
# One osrm-routed per profile, on IPv6 for Fly's private network; exit when either dies
# so Fly restarts the machine. --mmap reads map data from disk on demand, so memory pressure
# slows routing down instead of crashing it.
osrm-routed --ip :: --mmap --algorithm mld --port 5000 --max-viaroute-size 100 /data/car/ncr.osrm &
CAR=$!
osrm-routed --ip :: --mmap --algorithm mld --port 5001 --max-viaroute-size 100 /data/foot/ncr.osrm &
FOOT=$!
while kill -0 "$CAR" 2>/dev/null && kill -0 "$FOOT" 2>/dev/null; do sleep 5; done
exit 1
