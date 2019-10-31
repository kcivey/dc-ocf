#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('lodash');
const underscored = require('underscore.string/underscored');
const argv = require('yargs')
    .options({
        update: {
            type: 'boolean',
            describe: 'get new data from OCF site',
        },
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
const yamlFile = `${__dirname}/dcision${argv.year.toString().substr(-2)}.yaml`;
const templateFile = `${__dirname}/src/dc-2020-candidates.html.tpl`;
const majorParties = [
    'Democratic',
    'Libertarian',
    'Republican',
    'Statehood Green',
];

main().catch(console.trace);

async function main() {
    let records = readYaml();
    if (argv.update) {
        const newRecords = await getNewRecords();
        records = combineRecords(records, newRecords);
        writeYaml(records);
    }
    writeHtml(records);
}

function readYaml() {
    try {
        return yaml.safeLoad(fs.readFileSync(yamlFile, 'utf8'));
    }
    catch (err) {
        return {};
    }
}

async function getNewRecords() {
    const ocf = new OcfDisclosures({
        verbose: argv.verbose,
        limit: 100,
        year: argv.year,
        withDetails: true,
        useLastSeen: false,
    });
    const lastSeen = await ocf.getLastSeen(['Candidate']);
    const records = (await ocf.findNewRecords(lastSeen)).Candidate;
    return objectify(transformRecords(records), ['party', 'office']);
}

function transformRecords(records) {
    return records
        .map(
            function (r) {
                const newRec = {};
                for (const [key, value] of Object.entries(r)) {
                    newRec[underscored((key))] = typeof value === 'string' ? value.trim() : value;
                }
                return newRec;
            }
        )
        .sort(function (a, b) {
            return a.office.localeCompare(b.office) ||
                a.party_name.localeCompare(b.party_name) ||
                a.last_name.localeCompare(b.last_name) ||
                a.first_name.localeCompare(b.first_name);
        })
        .map(function (r) {
            r.party = r.party_name === 'Democrat' ? 'Democratic' : r.party_name;
            r.office = r.office.replace('D.C. State Board of Education', 'SBOE');
            for (const key of [
                'office_sought',
                'party_name',
                'party_affiliation',
                'name_of_committee',
                'filer_type_id',
                'election_year_description',
                'ocf_identification_no',
                'committee_alphanumeric_id',
            ]) {
                delete r[key];
            }
            const m = r.address.match(/^(.+), Washington, DC (\d+)$/);
            assert(m, `Unexpected address format "${r.address}"`);
            r.address = m[1].replace(/ Avenue\b/, ' Ave')
                .replace(/ Street\b/, ' St')
                .replace(/ Place\b/, ' Pl')
                .replace(/[.,]/g, '');
            r.zip = m[2];
            if (r.last_name === 'Grosman') { // kluge to fix OCF typo
                r.last_name = 'Grossman';
                r.candidate_name = r.candidate_name.replace('Grosman', 'Grossman');
                r.name = r.name.replace('Grosman', 'Grossman');
            }
            return r;
        });
}

function combineRecords(records, newRecords) {
    for (const [party, recordsByOffice] of Object.entries(newRecords)) {
        if (!records[party]) {
            records[party] = {};
        }
        for (const [office, candidates] of Object.entries(recordsByOffice)) {
            if (!records[party][office]) {
                records[party][office] = [];
            }
            for (const candidate of candidates) {
                const existingCandidate = records[party][office].find(r => r.id === candidate.id);
                if (existingCandidate) {
                    Object.assign(existingCandidate, candidate);
                }
                else {
                    records[party][office].push(candidate);
                }
            }
            records[party][office].sort(function (a, b) {
                return a.last_name.localeCompare(b.last_name) ||
                    a.first_name.localeCompare(b.first_name);
            });
        }
    }
    return records;
}

function writeYaml(records) {
    fs.writeFileSync(yamlFile, yaml.safeDump(records));
}

function writeHtml(records) {
    const template = _.template(fs.readFileSync(templateFile, 'utf8'));
    const outputFile = templateFile.replace(/\.tpl$/, '');
    const recordsByElection = {};
    for (const [party, recordsByOffice] of Object.entries(records)) {
        const election = majorParties.includes(party)
            ? 'Primary Election, June 2, 2020'
            : 'General Election, November 3, 2020';
        if (!recordsByElection[election]) {
            recordsByElection[election] = {};
        }
        recordsByElection[election][party] = recordsByOffice;
    }
    fs.writeFileSync(outputFile, template({recordsByElection}));
}

function objectify(arr, keyNames) {
    if (typeof keyNames === 'string') {
        keyNames = [keyNames];
    }
    if (!keyNames.length) {
        return arr;
    }
    const unsorted = {};
    const keyName = keyNames[0];
    for (const obj of arr) {
        const key = obj[keyName];
        delete obj[keyName];
        if (!unsorted[key]) {
            unsorted[key] = [];
        }
        unsorted[key].push(obj);
    }
    const sorted = {};
    for (const key of Object.keys(unsorted).sort(keySort)) {
        const subarray = unsorted[key];
        sorted[key] = objectify(subarray, keyNames.slice(1));
    }
    return sorted;
}

function keySort(a, b) {
    const [, a1, a2] = a.match(/^(?:(.+?)\s+)?(.+)$/);
    const [, b1, b2] = b.match(/^(?:(.+?)\s+)?(.+)$/);
    return a2.localeCompare(b2) || a1.localeCompare(b1);
}
