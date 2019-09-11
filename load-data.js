#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const underscored = require('underscore.string/underscored');
const db = require('./lib/db');
const {fixAmount, fixDate, getCsvFilename, normalizeNameAndAddress, parseName} = require('./lib/util');
const currentCommittees = new Set();

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    await db.createTables();
    for (const filerType of ['principal', 'exploratory']) {
        await loadRecords(db.committeeTableName, db.committeeColumns, filerType);
        await loadRecords(db.contributionTableName, db.contributionColumns, filerType);
        await loadRecords(db.expenditureTableName, db.expenditureColumns, filerType);
    }
    await db.addDummyContributions();
    await db.runFixes();
    await db.setOcfLimits();
}

function loadRecords(tableName, columns, filerType) {
    console.warn(`Loading ${filerType} ${tableName} records`);
    return new Promise(function (resolve, reject) {
        const extraBatch = [];
        const parser = parse({columns: true});
        const input = fs.createReadStream(getCsvFilename(tableName, filerType));
        let totalCount = 0;
        let currentCount = 0;
        let batch = [];
        parser.on('readable', async function () {
            let record;
            while ((record = parser.read())) {
                totalCount++;
                record = transformRecord(record);
                if (checkForProblem(record)) {
                    continue;
                }
                batch.push(record);
                if (batch.length >= 10000) {
                    await insert();
                }
                if (tableName === db.committeeTableName) {
                    extraBatch.push({
                        committee_name: record.committee_name,
                        filer_type: filerType,
                        is_fair_elections: false,
                    });
                }
                currentCount++;
            }
            return undefined;
        });
        parser.on('error', reject);
        parser.on('end', async function () {
            if (batch.length) {
                await insert();
            }
            if (extraBatch.length) {
                await db.createCommitteeExtraRecords(extraBatch);
            }
            console.warn(`Finished reading ${totalCount} records for ${tableName}`);
            console.warn(`Inserted ${currentCount} records into ${tableName}`);
            return resolve();
        });
        input.pipe(parser);

        // Throw error if file structure is bad, return true if just this record should be skipped
        function checkForProblem(record) {
            if (totalCount === 1) {
                if (!arraysHaveSameElements(columns, Object.keys(record))) {
                    console.error(columns, Object.keys(record));
                    throw new Error(`Columns have changed in ${tableName}`);
                }
            }
            if (tableName === db.committeeTableName) {
                currentCommittees.add(record.committee_name);
                return false;
            }
            return !currentCommittees.has(record.committee_name);
        }

        async function insert() {
            await db.batchInsert(tableName, batch);
            batch = []; // eslint-disable-line require-atomic-updates
        }
    });
}

function transformRecord(record) {
    const newRecord = {};
    for (const [key, value] of Object.entries(record)) {
        let newKey = underscored(key);
        if (newKey === 'explorer_name') { // for exploratory committees
            newKey = 'candidate_name';
        }
        let newValue = trim(value);
        if (/_date/.test(newKey)) {
            newValue = fixDate(newValue);
        }
        else if (/amount|total/.test(newKey)) {
            newValue = fixAmount(newValue);
        }
        newRecord[newKey] = newValue;
    }
    if (newRecord.hasOwnProperty('payee_name') && !newRecord.hasOwnProperty('organization_name')) {
        newRecord.organization_name = ''; // missing for exploratory committees
    }
    if (newRecord.hasOwnProperty('city')) {
        newRecord.normalized = normalizeNameAndAddress(newRecord);
    }
    if (newRecord.hasOwnProperty('candidate_name')) {
        const nameParts = parseName(newRecord.candidate_name);
        newRecord.candidate_short_name = nameParts.last; // have to manually edit if more than one with same last name
    }
    return newRecord;
}

function trim(s) {
    return s ? s.replace(/\s+/g, ' ').trim() : '';
}

function arraysHaveSameElements(array1, array2) {
    return array1.length === array2.length && array1.every(value => array2.includes(value));
}
