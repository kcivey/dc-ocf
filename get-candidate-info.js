#!/usr/bin/env node

const yaml = require('js-yaml');
const underscored = require('underscore.string/underscored');
const argv = require('yargs')
    .options({
        verbose: {
            type: 'boolean',
            describe: 'print something about what\'s going on',
            alias: 'v',
        },
        year: {
            type: 'number',
            describe: 'retrieve only for specified election year',
            default: Math.floor((new Date().getFullYear() + 1) / 2) * 2,
            requiresArg: true,
        },
    })
    .strict(true)
    .argv;
const OcfDisclosures = require('./lib/ocf-disclosures');

main().catch(console.trace);

async function main() {
    const ocf = new OcfDisclosures({
        verbose: argv.verbose,
        limit: 100,
        year: argv.year,
        withDetails: true,
        useLastSeen: false,
    });
    const types = ['Candidate'];
    const lastSeen = await ocf.getLastSeen(types);
    const allNewRecords = await ocf.findNewRecords(lastSeen);
    printYaml(allNewRecords);
}

function printYaml(allNewRecords) {
    const recordsByTypeAndOffice = {};
    for (const [type, records] of Object.entries(allNewRecords)) {
        recordsByTypeAndOffice[type] = {};
        const underscoredRecords = records.map(
            function (rec) {
                const newRec = {};
                for (const [key, value] of Object.entries(rec)) {
                    newRec[underscored((key))] = typeof value === 'string' ? value.trim() : value;
                }
                return newRec;
            }
        ).sort(function (a, b) {
            return a.office.localeCompare(b.office) ||
                a.party_name.localeCompare(b.party_name) ||
                a.last_name.localeCompare(b.last_name) ||
                a.first_name.localeCompare(b.first_name);
        });
        for (const r of underscoredRecords) {
            const office = r.office;
            const party = r.party_name;
            delete r.office;
            delete r.party_name;
            delete r.party_affiliation;
            delete r.filter_type_id;
            if (!recordsByTypeAndOffice[type][party]) {
                recordsByTypeAndOffice[type][party] = {};
            }
            if (!recordsByTypeAndOffice[type][party][office]) {
                recordsByTypeAndOffice[type][party][office] = [];
            }
            recordsByTypeAndOffice[type][party][office].push(r);
        }
    }
    process.stdout.write(yaml.safeDump(recordsByTypeAndOffice['Candidate']));
}
