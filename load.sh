#!/usr/bin/env bash

set -e
./load-data.js
./parse-fair-elections.js
./add-wards.js --year 2020
