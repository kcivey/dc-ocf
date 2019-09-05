#!/usr/bin/env bash

set -e
./make-json.js
echo 'Copying files from src to dist'
mkdir -p dist
rm dist/*
cp -u src/*.{js,json,html} dist/
echo 'Compiling and minifying JS'
npx babel src/dc-campaign-finance.js | \
    npx browserify - | \
    npx terser -c -m --toplevel --comments /Copyright/ \
    > dist/dc-campaign-finance.js
