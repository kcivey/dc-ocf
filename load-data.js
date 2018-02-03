#!/usr/bin/env node

var fs = require('fs'),
    parse = require('csv-parse'),
    _ = require('underscore'),
    moment = require('moment'),
    db = require('./db'),
    csvOptions = {columns: true},
    currentCommittees = {},
    batchSize = 10,
    committeeTableName = 'committees',
    contributionTableName = 'contributions';

db.schema.dropTableIfExists(contributionTableName)
    .dropTableIfExists(committeeTableName)
    .createTable(
        committeeTableName,
        function (table) {
            var columnNames = [
                'committee_name',
                'candidate_name',
                'election_year',
                'status',
                'office'
            ];
            table.increments();
            columnNames.forEach(function (columnName) {
                if (/year/.test(columnName)) {
                    table.integer(columnName);
                }
                else {
                    table.string(columnName);
                }
            });
        }
    )
    .createTable(
        contributionTableName,
        function (table) {
            var columnNames = [
                    'committee_name',
                    'contributor_name',
                    'contributor_address',
                    'contributor_type',
                    'contribution_type',
                    'employer_name',
                    'employer_address',
                    'occupation',
                    'receipt_date',
                    'amount'
                ];
            table.increments();
            columnNames.forEach(function (columnName) {
                if (/date/.test(columnName)) {
                    table.date(columnName);
                }
                else if (/amount|total/.test(columnName)) {
                    table.float(columnName);
                }
                else {
                    table.string(columnName);
                }
            });
        }
    )
    .then(readCommittees);

function readCommittees() {
    var parser = parse(csvOptions),
        input = fs.createReadStream(__dirname + '/' + committeeTableName + '.csv'),
        records = [];
    parser.on('readable', function () {
        var record;
        while(record = parser.read()) {
            record = transformRecord(record);
            currentCommittees[record.committee_name] = true;
            records.push(record);
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('finish', function () {
        console.log('Finished reading committees');
        console.log(Object.keys(currentCommittees).sort());
        db.batchInsert(committeeTableName, records, batchSize)
            .returning('id')
            .then(readContributions);
    });
    input.pipe(parser);
}

function readContributions() {
    var parser = parse(csvOptions),
        input = fs.createReadStream(__dirname + '/' + contributionTableName + '.csv'),
        seen = {},
        unrecognized = [],
        totalCount = 0,
        currentCount = 0,
        batch = [];
    parser.on('readable', function () {
        var record;
        while (record = parser.read()) {
            var name;
            totalCount++;
            record = transformRecord(record);
            name = record.committee_name;
            if (!seen[name]) {
                seen[name] = true;
                console.log(name);
                if (!currentCommittees[name]) {
                    unrecognized.push(name);
                }
            }
            if (!currentCommittees[name]) {
                continue;
            }
            batch.push(record);
            if (batch.length >= batchSize) {
                batchInsert(batch);
                batch = [];
            }
            currentCount++;
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('finish', function () {
        if (batch.length) {
            batchInsert(batch);
        }
        console.log('Finished reading %d contributions', totalCount);
        console.log('Inserted %d contributions', currentCount);
        console.log('Unrecognized committees:\n', unrecognized.sort());
    });
    input.pipe(parser);
}

function transformRecord(record) {
    var newRecord = {};
    _.each(record, function (value, key) {
        value = trim(value);
        key = nameToCode(key);
        if (/date/.test(key) && /^\d\d?\/\d\d?\/\d{4}$/.test(value)) {
            value = moment(value, 'MM/DD/YYYY').format('YYYY-MM-DD');
        }
        else if (/amount|total/.test(key) && /^[\$\.,\d]+$/.test(value)) {
            value = value.replace(/[\$,]/g, '');
        }
        newRecord[key] = value;
    });
    return newRecord;
}

function nameToCode(s) {
    return s.toLowerCase()
        .replace(/\W+/g, '_')
        .replace(/^_|_$/g, '');
}

function trim(s) {
    if (s == null) {
        return null;
    }
    return s.replace(/\s+/g, ' ')
        .replace(/^ | $/g, '');
}

function batchInsert(batch) {
    db.batchInsert(contributionTableName, batch, batchSize)
        .returning('id')
        .then(function () {});
}
