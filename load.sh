#!/usr/bin/env bash

set -e
./load-data.js
./parse-fair-elections.js fair-elections/*.pdf
./add-wards.js
