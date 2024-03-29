#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const underscored = require('underscore.string/underscored');
const db = require('./lib/db');
const {fixAmount, fixDate, getCsvFilename, normalizeNameAndAddress, parseName} = require('./lib/util');
const currentCommittees = new Set();

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    })
    .finally(() => db.close());

async function main() {
    await db.createTables();
    for (const filerType of ['principal', 'exploratory', 'recall']) {
        await loadRecords(db.committeeTableName, db.committeeColumns, filerType);
        await loadRecords(db.contributionTableName, db.contributionColumns, filerType);
        await loadRecords(db.expenditureTableName, db.expenditureColumns, filerType);
    }
    await db.addDummyContributions();
    await db.runFixes();
    await db.setOcfLimits();
}

async function loadRecords(tableName, columns, filerType) {
    console.warn(`Loading ${filerType} ${tableName} records`);
    const parser = fs.createReadStream(getCsvFilename(tableName, filerType))
        .pipe(parse({columns: true}));
    let extraBatch = [];
    let totalCount = 0;
    let currentCount = 0;
    let batch = [];
    const unknownCommittees = new Set();
    for await (let record of parser) {
        totalCount++;
        record = transformRecord(record, filerType);
        const committeeName = record.committee_name;
        if (checkForProblem(record)) {
            if (!unknownCommittees.has(committeeName)) {
                console.warn(`Skipping ${tableName} record associated with "${committeeName}"`);
            }
            unknownCommittees.add(committeeName);
            continue;
        }
        if (tableName === db.committeeTableName) {
            if (currentCommittees.has(committeeName)) {
                // remove earlier record with the same committee name. @todo handle better
                console.warn(`Removing duplicate committee "${committeeName}"`);
                batch = batch.filter(function (r) { // eslint-disable-line no-loop-func
                    return r.committee_name !== record.committee_name;
                });
                extraBatch = extraBatch.filter(function (r) { // eslint-disable-line no-loop-func
                    return r.committee_name !== record.committee_name;
                });
            }
            currentCommittees.add(committeeName);
            extraBatch.push({
                committee_name: committeeName,
                filer_type: filerType,
                is_fair_elections: false,
                is_running: true,
            });
        }
        batch.push(record);
        if (batch.length >= 100000) {
            await insert();
        }
        currentCount++;
    }
    if (batch.length) {
        await insert();
    }
    if (extraBatch.length) {
        await db.createCommitteeExtraRecords(extraBatch);
    }
    console.warn(`Finished reading ${totalCount} records for ${tableName}`);
    console.warn(`Inserted ${currentCount} records into ${tableName}`);

    // Throw error if record structure is bad, return true if record should be skipped
    function checkForProblem(record) {
        if (totalCount === 1) {
            if (!arraysHaveSameElements(columns, Object.keys(record))) {
                console.error(columns, Object.keys(record));
                throw new Error(`Columns have changed in ${tableName}`);
            }
        }
        // skip if record is associated with a committee we don't have (avoid foreign key error)
        return tableName !== db.committeeTableName &&
            record.committee_name &&
            !currentCommittees.has(record.committee_name);
    }

    async function insert() {
        await db.batchInsert(tableName, batch);
        batch = []; // eslint-disable-line require-atomic-updates
    }
}

function transformRecord(record, filerType) {
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
    if (newRecord.payment_date && !newRecord.payee_organization_name) {
        newRecord.payee_organization_name = ''; // missing for exploratory and recall committees
    }
    if (newRecord.city) {
        newRecord.normalized = normalizeNameAndAddress(newRecord);
    }
    if (newRecord.office) {
        newRecord.office = newRecord.office.replace('D.C. State Board of Education', 'SBOE');
        if (filerType === 'recall') {
            newRecord.candidate_name = newRecord.committee_name;
            newRecord.office += ' (Recall)';
        }
    }
    if (newRecord.candidate_name) {
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
