#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const db = require('./lib/db');
const parseFairElectionsPdf = require('./lib/parse-fair-elections-pdf');

main()
    .then(() => console.warn('Finished'))
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    })
    .finally(() => db.close())
    .finally(() => process.exit());

async function main() {
    await db.setCommitteeCodes();
    const inputFilesByCommittee = getInputFilesByCommittee();
    for (const [committeeCode, inputFiles] of Object.entries(inputFilesByCommittee)) {
        const committeeName = await db.getCommitteeNameByCode(committeeCode);
        if (/^test-committee/.test(committeeCode)) {
            continue;
        }
        assert(committeeName, `Can't find committee for code "${committeeCode}"`);
        console.warn(`Deleting records for ${committeeName}`);
        await db.deleteContributions(committeeName);
        await db.deleteExpenditures(committeeName);
        for (const inputFile of inputFiles) {
            await processFile(inputFile);
        }
    }
    console.warn('Adding dummy contributions');
    await db.addDummyContributions();
    console.warn('Running fixes');
    await db.runFixes();
    console.warn('Loading OCF limits');
    await db.setOcfLimits();
}

async function processFile(inputFile) {
    console.warn('processing', inputFile);
    const {committeeName, deadline, rowsBySchedule} = await parseFairElectionsPdf(inputFile);
    const committee = await db.getCommittee(committeeName);
    if (!committee) {
        throw new Error(`No committee record for "${committeeName}"`);
    }
    if (committee.is_fair_elections === null) {
        throw new Error(`No committee extra record for "${committeeName}"`);
    }
    console.log('Updating committee info');
    const updates = {is_fair_elections: true};
    if (!committee.last_deadline || deadline > committee.last_deadline) {
        updates.last_deadline = deadline;
    }
    await db.updateCommitteeExtra(committeeName, updates);
    for (const [schedule, rows] of Object.entries(rowsBySchedule)) {
        if (/^A/.test(schedule)) {
            console.warn(`Inserting ${rows.length} contributions`);
            await db.batchInsert(db.contributionTableName, rows);
            const extraRecords = rows.map(function (row) {
                return {
                    committee_name: row.committee_name,
                    is_fair_elections: true,
                    is_running: true,
                };
            });
            await db.createCommitteeExtraRecords(extraRecords);
        }
        else if (/^B/.test(schedule)) {
            console.warn(`Inserting ${rows.length} expenditures`);
            await db.batchInsert(db.expenditureTableName, rows);
        }
        else {
            throw new Error(`Got schedule ${schedule}`);
        }
    }
}

function getInputFilesByCommittee() {
    const dir = __dirname + '/fair-elections';
    const inputFiles = fs.readdirSync(dir)
        .filter(fn => /\.pdf$/.test(fn))
        .sort()
        .map(fn => dir + '/' + fn);
    const inputFilesByCommittee = {};
    for (const inputFile of inputFiles) {
        const m = inputFile.match(
            /^.+\/(.+)-(20\d\d-(?:\w+-\d+\w+|termination|8-day-pre-(?:primary|general-election)))(?:-amendment-\d+)?-\d{8}\.pdf$/ // eslint-disable-line max-len
        );
        assert(m, `Unexpected filename format "${inputFile}`);
        const committee = m[1];
        const reportType = m[2];
        if (!inputFilesByCommittee[committee]) {
            inputFilesByCommittee[committee] = {};
        }
        inputFilesByCommittee[committee][reportType] = inputFile;
    }
    for (const committee of Object.keys(inputFilesByCommittee)) {
        inputFilesByCommittee[committee] = Object.values(inputFilesByCommittee[committee]);
    }
    return inputFilesByCommittee;
}
