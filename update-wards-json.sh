#!/usr/bin/env bash

set -e
ORIGINAL_FILE=original.json
TARGET_FILE=src/dc-wards.json
if [ ! -e $ORIGINAL_FILE ]
    then curl https://opendata.arcgis.com/datasets/0ef47379cbae44e88267c01eaec2ff6e_31.geojson -o $ORIGINAL_FILE
fi
npx geo2topo wards=$ORIGINAL_FILE \
    | npx toposimplify -P 0.02 \
    | npx topo2geo wards=- \
    | json -o json-0 -e 'this.features.forEach(f=>f.properties={name:f.properties.NAME})' \
    | ./round-geojson.sh \
    > $TARGET_FILE
echo "$TARGET_FILE written"
