#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const underscored = require('underscore.string/underscored');
const db = require('./lib/db');
const {fixAmount, fixDate, normalizeNameAndAddress} = require('./lib/util');
const currentCommittees = new Set();

main()
    .catch(console.error)
    .finally(() => db.close());

function main() {
    return db.createTables()
        .then(() => loadTransactions(db.committeeTableName, db.committeeColumns))
        .then(() => loadTransactions(db.contributionTableName, db.contributionColumns))
        .then(() => loadTransactions(db.expenditureTableName, db.expenditureColumns))
        .then(() => db.addDummyContributions());
}

function loadTransactions(tableName, columns) {
    return new Promise(function (resolve, reject) {
        const parser = parse({columns: true});
        const input = fs.createReadStream(__dirname + '/' + tableName + '.csv');
        let totalCount = 0;
        let currentCount = 0;
        let batch = [];
        parser.on('readable', async function () {
            let record;
            while ((record = parser.read())) {
                totalCount++;
                record = transformRecord(record);
                try {
                    if (checkForProblem(record)) {
                        continue;
                    }
                    batch.push(record);
                    if (batch.length >= 10000) {
                        await insert();
                    }
                }
                catch (err) {
                    return reject(err);
                }
                currentCount++;
            }
        });
        parser.on('error', reject);
        parser.on('end', async function () {
            if (batch.length) {
                try {
                    await insert();
                }
                catch (err) {
                    return reject(err);
                }
            }
            console.warn(`Finished reading ${totalCount} records for ${tableName}`);
            console.warn(`Inserted ${currentCount} records into ${tableName}`);
            resolve();
        });
        input.pipe(parser);

        // Throw error if file structure is bad, return true if just this record should be skipped
        function checkForProblem(record) {
            if (totalCount === 1) {
                const expected = columns.filter(c => !['ward', 'mar_address'].includes(c));
                if (!arraysHaveSameElements(expected, Object.keys(record))) {
                    console.error(expected, Object.keys(record));
                    throw new Error(`Columns have changed in ${tableName}`);
                }
            }
            if (tableName === db.committeeTableName) {
                currentCommittees.add(record.committee_name);
                return false;
            }
            else {
                return !currentCommittees.has(record.committee_name);
            }
        }

        async function insert() {
            await db.batchInsert(tableName, batch);
            batch = [];
        }
    });
}

function transformRecord(record) {
    const newRecord = {};
    for (const [key, value] of Object.entries(record)) {
        const newKey = underscored(key);
        let newValue = trim(value);
        if (/date/.test(key)) {
            newValue = fixDate(newValue);
        }
        else if (/amount|total/.test(newKey)) {
            newValue = fixAmount(newValue);
        }
        newRecord[newKey] = newValue;
    }
    if (newRecord.hasOwnProperty('city')) {
        newRecord.normalized = normalizeNameAndAddress(newRecord);
    }
    return newRecord;
}

function trim(s) {
    return s ? s.replace(/\s+/g, ' ').trim() : '';
}

function arraysHaveSameElements(array1, array2) {
    return array1.length === array2.length && array1.every(value => array2.includes(value));
}
