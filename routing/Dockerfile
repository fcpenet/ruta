# OSRM road snapping for the Add route screen: driving (jeeps, tricycles) on :5000 and
# walking (walk links) on :5001, built from OpenStreetMap data for Metro Manila and its edges.

FROM debian:bookworm-slim AS clip
RUN apt-get update && apt-get install -y --no-install-recommends osmium-tool curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /data
# Cache-bust with --build-arg OSM_DATE=<date> to pick up fresh map data.
ARG OSM_DATE=latest
RUN curl -fsSL -o ph.osm.pbf "https://download.geofabrik.de/asia/philippines-latest.osm.pbf" \
  && osmium extract --bbox 120.90,14.30,121.20,14.85 ph.osm.pbf -o ncr.osm.pbf \
  && rm ph.osm.pbf

FROM ghcr.io/project-osrm/osrm-backend:v26.4.0 AS build
COPY --from=clip /data/ncr.osm.pbf /data/
RUN for p in car foot; do \
      mkdir -p /data/$p && cp /data/ncr.osm.pbf /data/$p/ncr.osm.pbf \
      && osrm-extract -p /opt/$p.lua /data/$p/ncr.osm.pbf \
      && osrm-partition /data/$p/ncr.osrm \
      && osrm-customize /data/$p/ncr.osrm \
      && rm /data/$p/ncr.osm.pbf; \
    done && rm /data/ncr.osm.pbf

FROM ghcr.io/project-osrm/osrm-backend:v26.4.0
COPY --from=build /data /data
COPY start.sh /start.sh
EXPOSE 5000 5001
CMD ["sh", "/start.sh"]
