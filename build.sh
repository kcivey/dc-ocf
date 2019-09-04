#!/usr/bin/env bash

mkdir -p dist
cp -u src/* dist/
npx babel src/dc-campaign-finance.js | \
    npx browserify - | \
    npx terser -c -m --toplevel --comments /Copyright/ \
    > dist/dc-campaign-finance.js
