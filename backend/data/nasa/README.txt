nasa_env_2020plus.csv.gz - real NASA records dated 2020-01-01 onward, staged by scripts/fetch_nasa_env.py
(run 2026-11-07, stride 3). Nothing is generated, interpolated or time-shifted.

Sources
  EDA     https://visualization.osdr.nasa.gov/eda/dashboard_<MISSION>   (missions RR-10, 18, 19, 20, 22, 23, 25, 28)
  RadLab  https://visualization.osdr.nasa.gov/radlab/api/              (absorbed_dose_rate; the unit is not stated by the API)

Reductions (the originals are far larger)
  EDA telemetry (about 1 reading/min): the FIRST valid raw reading of each UTC hour is kept, with its own timestamp.
  EDA daily radiation: every row kept. Rows before 2020-01-01 are dropped.
  RadLab: one hour (00:00-01:00 UTC) of every 3rd day since 2020-01-01; every raw row in that hour is kept.
  EDA timestamps are published without a zone ("Controller_Time_GMT" in the RR-1 table) and are stored as UTC.

The cache/ folder holds the per-day RadLab answers and per-mission EDA extracts the staging file was built from.
