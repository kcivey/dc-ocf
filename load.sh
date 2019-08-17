#!/usr/bin/env bash

set -e
./load-data.js
./parse-fair-elections.js *.pdf
./add-wards.js
