#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const _ = require('underscore');
const underscored = require('underscore.string/underscored');
const db = require('./lib/db');
const {fixAmount, fixDate, normalizeNameAndAddress} = require('./lib/util');
const csvOptions = {columns: true};
const currentCommittees = {};

main()
    .catch(console.error)
    .finally(() => db.close());

function main() {
    return db.createTables()
        .then(readCommittees)
        .then(readContributions)
        .then(readExpenditures)
        .then(() => db.addDummyContributions());
}

function readCommittees() {
    return new Promise(function (resolve, reject) {
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
                        reject(new Error('Committee columns have changed'));
                    }
                    checked = true;
                }
                currentCommittees[record.committee_name] = true;
                records.push(record);
            }
        });
        parser.on('error', reject);
        parser.on('end', async function () {
            console.warn('Finished reading %d committees', records.length);
            await db.batchInsertCommittees(records);
            resolve();
        });
        input.pipe(parser);
    });
}

function readContributions() {
    return new Promise(function (resolve, reject) {
        const parser = parse(csvOptions);
        const input = fs.createReadStream(__dirname + '/' + db.contributionTableName + '.csv');
        const seen = {};
        const unrecognized = [];
        let totalCount = 0;
        let currentCount = 0;
        let batch = [];
        parser.on('readable', async function () {
            let record;
            while ((record = parser.read())) {
                totalCount++;
                record = transformRecord(record);
                if (totalCount === 1) {
                    const expected = db.contributionColumns.filter(v => v !== 'normalized');
                    if (!arraysAreEqual(expected, Object.keys(record))) {
                        console.warn(expected, Object.keys(record));
                        reject(new Error('Contribution columns have changed'));
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
                    await db.batchInsertContributions(batch);
                    batch = [];
                }
                currentCount++;
            }
        });
        parser.on('error', reject);
        parser.on('end', async function () {
            if (batch.length) {
                await db.batchInsertContributions(batch);
            }
            console.warn('Finished reading %d contributions', totalCount);
            console.warn('Inserted %d contributions', currentCount);
            console.warn('Unrecognized committees:\n', unrecognized.sort());
            resolve();
        });
        input.pipe(parser);
    });
}

function readExpenditures() {
    return new Promise(function (resolve, reject) {
        const parser = parse(csvOptions);
        const input = fs.createReadStream(__dirname + '/' + db.expenditureTableName + '.csv');
        const seen = {};
        const unrecognized = [];
        let totalCount = 0;
        let currentCount = 0;
        let batch = [];
        parser.on('readable', async function () {
            let record;
            while ((record = parser.read())) {
                totalCount++;
                record = transformRecord(record);
                if (totalCount === 1) {
                    const expected = db.expenditureColumns.filter(v => v !== 'normalized');
                    if (!arraysAreEqual(expected, Object.keys(record))) {
                        console.warn(expected, Object.keys(record));
                        reject(new Error('Expenditure columns have changed'));
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
                    await db.batchInsertExpenditures(batch);
                    batch = [];
                }
                currentCount++;
            }
        });
        parser.on('error', reject);
        parser.on('end', async function () {
            if (batch.length) {
                await db.batchInsertExpenditures(batch);
            }
            console.log('Finished reading %d expenditures', totalCount);
            console.log('Inserted %d expenditures', currentCount);
            if (unrecognized.length) {
                console.log('Unrecognized committees:\n', unrecognized.sort());
            }
            resolve();
        });
        input.pipe(parser);
    });
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
