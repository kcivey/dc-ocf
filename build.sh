#!/usr/bin/env bash

set -e
./make-json.js --year 2020-2022
#./make-candidate-table.js --year 2022
echo 'Copying files from src to dist'
mkdir -p dist
rm dist/*
cp -u src/*.{js,json,html} dist/
echo 'Compiling and minifying JS'
npx babel src/dc-campaign-finance.js | \
    npx browserify - | \
    npx terser -c -m --toplevel --comments /Copyright/ \
    > dist/dc-campaign-finance.js
