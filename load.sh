#!/usr/bin/env bash

set -e
./load-csv.js
./load-fair-elections.js
./add-wards.js --year 2020
./add-wards.js --year 2022
./add-wards.js --year 2024
./add-wards.js --year 2025
./add-wards.js --year 2026
