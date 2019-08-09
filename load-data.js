#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const _ = require('underscore');
const underscored = require('underscore.string/underscored');
const db = require('./lib/db');
const {fixAmount, fixDate, normalizeNameAndAddress} = require('./lib/util');
const csvOptions = {columns: true};
const currentCommittees = {};
const batchSize = 10;

db.createTables().then(readCommittees);

function readCommittees() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + db.committeeTableName + '.csv');
    const records = [];
    parser.on('readable', function () {
        let checked = false;
        let record;
        while ((record = parser.read())) {
            record = transformRecord(record);
            if (!checked) {
                if (!arraysAreEqual(db.committeeColumns, Object.keys(record))) {
                    console.warn(db.committeeColumns, Object.keys(record));
                    throw new Error('Committee columns have changed');
                }
                checked = true;
            }
            currentCommittees[record.committee_name] = true;
            records.push(record);
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('end', function () {
        console.warn('Finished reading %d committees', records.length);
        db.batchInsertCommittees(records, batchSize)
            .then(readContributions);
    });
    input.pipe(parser);
}

function readContributions() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + db.contributionTableName + '.csv');
    const seen = {};
    const unrecognized = [];
    let totalCount = 0;
    let currentCount = 0;
    let batch = [];
    parser.on('readable', function () {
        let record;
        while ((record = parser.read())) {
            totalCount++;
            record = transformRecord(record);
            if (totalCount === 1) {
                const expected = db.contributionColumns.filter(v => v !== 'normalized');
                if (!arraysAreEqual(expected, Object.keys(record))) {
                    console.warn(expected, Object.keys(record));
                    throw new Error('Contribution columns have changed');
                }
            }
            const name = record.committee_name;
            if (!seen[name]) {
                seen[name] = true;
                if (!currentCommittees[name]) {
                    unrecognized.push(name);
                }
            }
            if (!currentCommittees[name]) {
                continue;
            }
            record.normalized = normalizeNameAndAddress(record);
            batch.push(record);
            if (batch.length >= 10000) {
                db.batchInsertContributions(batch, batchSize)
                    .then(function () {});
                batch = [];
            }
            currentCount++;
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('end', function () {
        if (batch.length) {
            db.batchInsertContributions(batch, batchSize)
                .then(function () {});
        }
        console.warn('Finished reading %d contributions', totalCount);
        console.warn('Inserted %d contributions', currentCount);
        console.warn('Unrecognized committees:\n', unrecognized.sort());
        readExpenditures();
    });
    input.pipe(parser);
}

function readExpenditures() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + db.expenditureTableName + '.csv');
    const seen = {};
    const unrecognized = [];
    let totalCount = 0;
    let currentCount = 0;
    let batch = [];
    parser.on('readable', function () {
        let record;
        while ((record = parser.read())) {
            totalCount++;
            record = transformRecord(record);
            if (totalCount === 1) {
                const expected = db.expenditureColumns.filter(v => v !== 'normalized');
                if (!arraysAreEqual(expected, Object.keys(record))) {
                    console.warn(expected, Object.keys(record));
                    throw new Error('Expenditure columns have changed');
                }
            }
            const name = record.committee_name;
            if (!seen[name]) {
                seen[name] = true;
                if (!currentCommittees[name]) {
                    unrecognized.push(name);
                }
            }
            if (!currentCommittees[name]) {
                continue;
            }
            record.normalized = normalizeNameAndAddress(record);
            batch.push(record);
            if (batch.length >= 10000) {
                db.batchInsertExpenditures(batch, batchSize)
                    .then(function () {});
                batch = [];
            }
            currentCount++;
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('end', function () {
        if (batch.length) {
            db.batchInsertExpenditures(batch, batchSize)
                .then(finish);
        }
        else {
            finish();
        }

        function finish() {
            console.log('Finished reading %d expenditures', totalCount);
            console.log('Inserted %d expenditures', currentCount);
            if (unrecognized.length) {
                console.log('Unrecognized committees:\n', unrecognized.sort());
            }
            db.addDummyContributions();
        }
    });
    input.pipe(parser);
}

function transformRecord(record) {
    const newRecord = {};
    _.each(record, function (value, key) {
        value = trim(value);
        key = underscored(key);
        if (/date/.test(key) && /^\d\d?\/\d\d?\/\d{4}$/.test(value)) {
            value = fixDate(value);
        }
        else if (/amount|total/.test(key) && /^[$.,\d]+$/.test(value)) {
            value = fixAmount(value);
        }
        newRecord[key] = value;
    });
    return newRecord;
}

function trim(s) {
    return s ? s.replace(/\s+/g, ' ').trim() : '';
}

function arraysAreEqual(array1, array2) {
    return array1.length === array2.length && array1.every((value, index) => value === array2[index]);
}
