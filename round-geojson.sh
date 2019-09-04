#!/usr/bin/env bash

json -o json-0 -e 'this.features.forEach(function (f) {
        f.geometry.coordinates.forEach(function(poly) {
            poly.forEach((c, i) => f.geometry.coordinates[i] = [+c[0].toFixed(6), +c[1].toFixed(6)]);
        });
    })'
