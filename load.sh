#!/usr/bin/env bash

set -e
./load-csv.js
./load-fair-elections.js
./add-wards.js --year 2020
