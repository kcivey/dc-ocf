#!/usr/bin/env node

const tabula = require('tabula-js');
const parse = require('csv-parse/lib/sync');
const stream = tabula(
    'grossman-2019-07-31.pdf',
    {guess: true, debug: true, noSpreadsheet: true, pages: 'all'}
).streamCsv();

stream
    .split()
    .doto(function (line) {
        /*
        if (!columnTitles) {
            columnTitles = parse(line)[0];
            columnNames = columnTitles.map(_.camelCase);
            return;
        }
        */
        // const record = parse(line, {columns: columnNames})[0] || {};
        console.log(line);
    })
    .done(() => console.log('Finished'));
